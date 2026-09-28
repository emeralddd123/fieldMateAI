/**
 * Safe Local Draft Storage for Offline Resilience
 * 
 * Rules:
 * 1. Drafts are short-lived (default 24h expiration).
 * 2. Scoped strictly by tenantId + userId to prevent cross-tenant/cross-user leakage.
 * 3. Never auto-replays mutations to backend. Restored drafts require explicit user review & submission.
 * 4. Cleared on sign-out and tenant switch.
 */

export interface StoredDraft<T = unknown> {
  version: number;
  tenantId: string;
  userId: string;
  formKey: string;
  timestamp: number;
  expiresAt: number;
  payload: T;
}

const DRAFT_VERSION = 1;
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const STORAGE_PREFIX = 'fieldmate_draft_';

function buildStorageKey(tenantId: string, userId: string, formKey: string): string {
  return `${STORAGE_PREFIX}${tenantId}_${userId}_${formKey}`;
}

/**
 * Saves uncommitted form state to localStorage with tenant isolation and expiration.
 */
export function saveFormDraft<T>(
  tenantId: string,
  userId: string,
  formKey: string,
  payload: T,
  ttlMs = DEFAULT_TTL_MS,
): void {
  if (typeof window === 'undefined' || !tenantId || !userId || !formKey) return;
  try {
    const now = Date.now();
    const draft: StoredDraft<T> = {
      version: DRAFT_VERSION,
      tenantId,
      userId,
      formKey,
      timestamp: now,
      expiresAt: now + ttlMs,
      payload,
    };
    const key = buildStorageKey(tenantId, userId, formKey);
    localStorage.setItem(key, JSON.stringify(draft));
  } catch (err) {
    console.warn('[DraftStorage] Failed to save draft:', err);
  }
}

/**
 * Loads an uncommitted form draft if present, unexpired, and belonging to the active user & tenant.
 */
export function loadFormDraft<T>(
  tenantId: string,
  userId: string,
  formKey: string,
): { payload: T; timestamp: number; ageMinutes: number } | null {
  if (typeof window === 'undefined' || !tenantId || !userId || !formKey) return null;
  try {
    const key = buildStorageKey(tenantId, userId, formKey);
    const raw = localStorage.getItem(key);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as StoredDraft<T>;
    const now = Date.now();

    // Verify version and expiration
    if (parsed.version !== DRAFT_VERSION || now > parsed.expiresAt) {
      localStorage.removeItem(key);
      return null;
    }

    // Verify tenant and user isolation
    if (parsed.tenantId !== tenantId || parsed.userId !== userId) {
      localStorage.removeItem(key);
      return null;
    }

    const ageMinutes = Math.max(0, Math.floor((now - parsed.timestamp) / 60_000));
    return {
      payload: parsed.payload,
      timestamp: parsed.timestamp,
      ageMinutes,
    };
  } catch {
    return null;
  }
}

/**
 * Removes a specific form draft upon successful submission or user discard.
 */
export function clearFormDraft(
  tenantId: string,
  userId: string,
  formKey: string,
): void {
  if (typeof window === 'undefined' || !tenantId || !userId || !formKey) return;
  try {
    const key = buildStorageKey(tenantId, userId, formKey);
    localStorage.removeItem(key);
  } catch {
    // Ignore error
  }
}

/**
 * Clears all drafts associated with a given tenant (or all drafts on logout).
 */
export function clearAllTenantDrafts(tenantId?: string): void {
  if (typeof window === 'undefined') return;
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(STORAGE_PREFIX)) {
        if (!tenantId || k.includes(`_${tenantId}_`)) {
          keysToRemove.push(k);
        }
      }
    }
    keysToRemove.forEach((k) => localStorage.removeItem(k));
  } catch {
    // Ignore error
  }
}

/**
 * Formats relative age for user-facing draft restoration notices.
 */
export function formatDraftAge(minutes: number): string {
  if (minutes < 1) return 'just now';
  if (minutes === 1) return '1 minute ago';
  if (minutes < 60) return `${minutes} minutes ago`;
  const hours = Math.floor(minutes / 60);
  if (hours === 1) return '1 hour ago';
  return `${hours} hours ago`;
}
