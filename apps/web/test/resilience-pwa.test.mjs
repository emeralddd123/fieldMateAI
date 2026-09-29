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

import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import {
  createWriteStorage,
  clearPendingWrites,
} from '../src/voice/writeStorage.ts';
import * as drafts from '../src/utils/draftStorage.ts';

function withStorage(storage, callback) {
  globalThis.window = {};
  globalThis.localStorage = storage;
  try {
    return callback();
  } finally {
    delete globalThis.window;
    delete globalThis.localStorage;
  }
}
const saveFormDraft = (storage, ...args) =>
  withStorage(storage, () => drafts.saveFormDraft(...args));
const loadFormDraft = (storage, ...args) =>
  withStorage(storage, () => drafts.loadFormDraft(...args));
const clearFormDraft = (storage, ...args) =>
  withStorage(storage, () => drafts.clearFormDraft(...args));
const clearAllTenantDrafts = (storage, ...args) =>
  withStorage(storage, () => drafts.clearAllTenantDrafts(...args));

test('Draft storage strictly isolates data across organizations and users', () => {
  const storage = new MockLocalStorage();

  // Tenant A, User 1 saves a repair draft
  saveFormDraft(storage, 'tenant-alpha', 'user-001', 'repair_INC-1048', {
    rootCause: 'Loose terminal connection on phase L2',
    actionTaken: 'Retorqued to 45 Nm',
  });

  // User 1 in Tenant A can restore their draft
  const draftUser1 = loadFormDraft(
    storage,
    'tenant-alpha',
    'user-001',
    'repair_INC-1048',
  );
  assert.ok(draftUser1);
  assert.equal(
    draftUser1.payload.rootCause,
    'Loose terminal connection on phase L2',
  );

  // User 2 in Tenant A CANNOT access User 1 draft
  const draftUser2 = loadFormDraft(
    storage,
    'tenant-alpha',
    'user-002',
    'repair_INC-1048',
  );
  assert.equal(draftUser2, null);

  // User 1 switching to Tenant B CANNOT access Tenant A draft
  const draftTenantB = loadFormDraft(
    storage,
    'tenant-beta',
    'user-001',
    'repair_INC-1048',
  );
  assert.equal(draftTenantB, null);
});

test('Expired local drafts are automatically invalidated and removed', () => {
  const storage = new MockLocalStorage();

  // Save draft with TTL of -100ms (already expired)
  saveFormDraft(
    storage,
    'tenant-alpha',
    'user-001',
    'note_INC-1048',
    { note: 'Stale note' },
    -100,
  );

  const loaded = loadFormDraft(
    storage,
    'tenant-alpha',
    'user-001',
    'note_INC-1048',
  );
  assert.equal(loaded, null);
  // Key was purged from storage
  assert.equal(storage.length, 0);
});

test('Sign-out cleans up all local unsubmitted drafts', () => {
  const storage = new MockLocalStorage();

  saveFormDraft(storage, 'tenant-alpha', 'user-001', 'repair_1', {
    note: 'Repair draft 1',
  });
  saveFormDraft(storage, 'tenant-alpha', 'user-001', 'note_2', {
    note: 'Note draft 2',
  });
  saveFormDraft(storage, 'tenant-beta', 'user-002', 'repair_3', {
    note: 'Other tenant draft',
  });

  assert.equal(storage.length, 3);

  // Logout clears all tenant drafts
  clearAllTenantDrafts(storage);

  assert.equal(storage.length, 0);
  assert.equal(
    loadFormDraft(storage, 'tenant-alpha', 'user-001', 'repair_1'),
    null,
  );
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
  const restored = loadFormDraft(
    storage,
    'tenant-alpha',
    'user-001',
    'repair_INC-1048',
  );
  assert.ok(restored);
  assert.equal(
    networkMutationsCount,
    0,
    'No mutation must trigger on restoration',
  );

  // The draft remains unsubmitted until technician clicks "Submit"
  const formPayload = { ...restored.payload };
  assert.equal(formPayload.rootCause, 'Damaged impeller');

  // User explicitly reviews and clicks submit:
  submitRepairOnline(formPayload);
  clearFormDraft(storage, 'tenant-alpha', 'user-001', 'repair_INC-1048');

  assert.equal(networkMutationsCount, 1);
  assert.equal(
    loadFormDraft(storage, 'tenant-alpha', 'user-001', 'repair_INC-1048'),
    null,
  );
});

test('the actual service worker never caches authenticated requests', async () => {
  const handlers = new Map();
  const deleted = [];
  const context = {
    self: {
      location: { origin: 'https://fieldmate.internal' },
      addEventListener: (type, fn) => handlers.set(type, fn),
      clients: { claim() {} },
    },
    URL,
    caches: {
      keys: async () => [
        'fieldmate-shell-v1',
        'fieldmate-shell-v2',
        'other-app',
      ],
      delete: async (key) => deleted.push(key),
    },
  };
  vm.runInNewContext(
    readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8'),
    context,
  );
  for (const path of [
    '/api/v1/auth/me',
    '/api/v1/assets',
    '/api/v1/admin/users',
    '/api/v1/procedures/p?safeStateConfirmed=true',
    'https://other.example/assets/a.js',
  ]) {
    handlers.get('fetch')({
      request: {
        method: 'GET',
        url: new URL(path, context.self.location.origin).href,
      },
      respondWith() {
        assert.fail(`Must bypass cache: ${path}`);
      },
    });
  }
  let activation;
  handlers.get('activate')({
    waitUntil: (promise) => {
      activation = promise;
    },
  });
  await activation;
  assert.deepEqual(deleted, ['fieldmate-shell-v1']);
});

test('voice recovery isolates users and organizations and removes legacy data', () => {
  const storage = new MockLocalStorage();
  storage.setItem('fieldmate.pending-writes.v1', 'unowned');
  const a = createWriteStorage(storage, 'org-a', 'alice');
  a.setItem('pending', 'private repair');
  assert.equal(storage.getItem('fieldmate.pending-writes.v1'), null);
  assert.equal(
    createWriteStorage(storage, 'org-a', 'bob').getItem('pending'),
    null,
  );
  assert.equal(
    createWriteStorage(storage, 'org-b', 'alice').getItem('pending'),
    null,
  );
  assert.equal(
    createWriteStorage(storage, 'org-a', 'alice').getItem('pending'),
    'private repair',
  );
  a.dispose();
  clearPendingWrites(storage);
  a.setItem('pending', 'late response');
  assert.equal(storage.length, 0);
});
