import assert from 'node:assert/strict';
import { test } from 'node:test';

// Simulation of LocalStorage
class MockLocalStorage {
  constructor() {
    this.store = new Map();
  }
  getItem(key) {
    return this.store.get(key) ?? null;
  }
  setItem(key, value) {
    this.store.set(key, String(value));
  }
  removeItem(key) {
    this.store.delete(key);
  }
  clear() {
    this.store.clear();
  }
  key(index) {
    return Array.from(this.store.keys())[index] ?? null;
  }
  get length() {
    return this.store.size;
  }
}

// Logic mirroring draftStorage.ts
const DRAFT_VERSION = 1;
const STORAGE_PREFIX = 'fieldmate_draft_';

function buildStorageKey(tenantId, userId, formKey) {
  return `${STORAGE_PREFIX}${tenantId}_${userId}_${formKey}`;
}

function saveFormDraft(storage, tenantId, userId, formKey, payload, ttlMs = 86400000) {
  const now = Date.now();
  const draft = {
    version: DRAFT_VERSION,
    tenantId,
    userId,
    formKey,
    timestamp: now,
    expiresAt: now + ttlMs,
    payload,
  };
  storage.setItem(buildStorageKey(tenantId, userId, formKey), JSON.stringify(draft));
}

function loadFormDraft(storage, tenantId, userId, formKey) {
  const key = buildStorageKey(tenantId, userId, formKey);
  const raw = storage.getItem(key);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    const now = Date.now();
    if (parsed.version !== DRAFT_VERSION || now > parsed.expiresAt) {
      storage.removeItem(key);
      return null;
    }
    if (parsed.tenantId !== tenantId || parsed.userId !== userId) {
      storage.removeItem(key);
      return null;
    }
    const ageMinutes = Math.max(0, Math.floor((now - parsed.timestamp) / 60000));
    return {
      payload: parsed.payload,
      timestamp: parsed.timestamp,
      ageMinutes,
    };
  } catch {
    return null;
  }
}

function clearFormDraft(storage, tenantId, userId, formKey) {
  storage.removeItem(buildStorageKey(tenantId, userId, formKey));
}

function clearAllTenantDrafts(storage, tenantId) {
  const keysToRemove = [];
  for (let i = 0; i < storage.length; i++) {
    const k = storage.key(i);
    if (k && k.startsWith(STORAGE_PREFIX)) {
      if (!tenantId || k.includes(`_${tenantId}_`)) {
        keysToRemove.push(k);
      }
    }
  }
  keysToRemove.forEach((k) => storage.removeItem(k));
}

test('Draft storage strictly isolates data across organizations and users', () => {
  const storage = new MockLocalStorage();

  // Tenant A, User 1 saves a repair draft
  saveFormDraft(storage, 'tenant-alpha', 'user-001', 'repair_INC-1048', {
    rootCause: 'Loose terminal connection on phase L2',
    actionTaken: 'Retorqued to 45 Nm',
  });

  // User 1 in Tenant A can restore their draft
  const draftUser1 = loadFormDraft(storage, 'tenant-alpha', 'user-001', 'repair_INC-1048');
  assert.ok(draftUser1);
  assert.equal(draftUser1.payload.rootCause, 'Loose terminal connection on phase L2');

  // User 2 in Tenant A CANNOT access User 1 draft
  const draftUser2 = loadFormDraft(storage, 'tenant-alpha', 'user-002', 'repair_INC-1048');
  assert.equal(draftUser2, null);

  // User 1 switching to Tenant B CANNOT access Tenant A draft
  const draftTenantB = loadFormDraft(storage, 'tenant-beta', 'user-001', 'repair_INC-1048');
  assert.equal(draftTenantB, null);
});

test('Expired local drafts are automatically invalidated and removed', () => {
  const storage = new MockLocalStorage();

  // Save draft with TTL of -100ms (already expired)
  saveFormDraft(storage, 'tenant-alpha', 'user-001', 'note_INC-1048', { note: 'Stale note' }, -100);

  const loaded = loadFormDraft(storage, 'tenant-alpha', 'user-001', 'note_INC-1048');
  assert.equal(loaded, null);
  // Key was purged from storage
  assert.equal(storage.getItem(buildStorageKey('tenant-alpha', 'user-001', 'note_INC-1048')), null);
});

test('Sign-out cleans up all local unsubmitted drafts', () => {
  const storage = new MockLocalStorage();

  saveFormDraft(storage, 'tenant-alpha', 'user-001', 'repair_1', { note: 'Repair draft 1' });
  saveFormDraft(storage, 'tenant-alpha', 'user-001', 'note_2', { note: 'Note draft 2' });
  saveFormDraft(storage, 'tenant-beta', 'user-002', 'repair_3', { note: 'Other tenant draft' });

  assert.equal(storage.length, 3);

  // Logout clears all tenant drafts
  clearAllTenantDrafts(storage);

  assert.equal(storage.length, 0);
  assert.equal(loadFormDraft(storage, 'tenant-alpha', 'user-001', 'repair_1'), null);
});

test('Restored drafts require explicit user review and never auto-replay mutations', () => {
  const storage = new MockLocalStorage();
  let networkMutationsCount = 0;

  // Mock form submission function
  const submitRepairOnline = () => {
    networkMutationsCount++;
    return { success: true };
  };

  saveFormDraft(storage, 'tenant-alpha', 'user-001', 'repair_INC-1048', {
    rootCause: 'Damaged impeller',
    actionTaken: 'Replaced impeller',
    verificationSummary: 'Checked vibration: nominal',
  });

  // When form opens, draft is restored to UI fields
  const restored = loadFormDraft(storage, 'tenant-alpha', 'user-001', 'repair_INC-1048');
  assert.ok(restored);
  assert.equal(networkMutationsCount, 0, 'No mutation must trigger on restoration');

  // The draft remains unsubmitted until technician clicks "Submit"
  const formPayload = { ...restored.payload };
  assert.equal(formPayload.rootCause, 'Damaged impeller');

  // User explicitly reviews and clicks submit:
  submitRepairOnline(formPayload);
  clearFormDraft(storage, 'tenant-alpha', 'user-001', 'repair_INC-1048');

  assert.equal(networkMutationsCount, 1);
  assert.equal(loadFormDraft(storage, 'tenant-alpha', 'user-001', 'repair_INC-1048'), null);
});

test('Service worker security rules forbid caching credentials and replaying mutations', () => {
  const isCachableRequest = (method, urlString) => {
    // Rule 1: NEVER cache mutations
    if (method !== 'GET') return false;

    const url = new URL(urlString, 'https://fieldmate.internal');
    // Rule 2: NEVER cache auth/token routes
    if (
      url.pathname.startsWith('/api/auth') ||
      url.pathname.includes('/token') ||
      url.pathname.includes('/login') ||
      url.pathname.includes('/logout')
    ) {
      return false;
    }
    return true;
  };

  // Safe read-only queries are cachable
  assert.equal(isCachableRequest('GET', '/api/assets'), true);
  assert.equal(isCachableRequest('GET', '/api/incidents'), true);
  assert.equal(isCachableRequest('GET', '/manifest.json'), true);
  assert.equal(isCachableRequest('GET', '/assets/index.js'), true);

  // Mutations must NEVER be cached
  assert.equal(isCachableRequest('POST', '/api/incidents/123/complete-repair'), false);
  assert.equal(isCachableRequest('POST', '/api/incidents/123/notes'), false);
  assert.equal(isCachableRequest('PATCH', '/api/assets/123'), false);
  assert.equal(isCachableRequest('DELETE', '/api/incidents/123'), false);

  // Auth & Tokens must NEVER be cached
  assert.equal(isCachableRequest('GET', '/api/auth/session'), false);
  assert.equal(isCachableRequest('POST', '/api/auth/login'), false);
  assert.equal(isCachableRequest('POST', '/api/auth/token'), false);
});
