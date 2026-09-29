const prefix = 'fieldmate.pending-writes.';

export function createWriteStorage(
  storage: Storage,
  organizationId: string,
  userId: string,
) {
  const scope = `${prefix}v2.${organizationId}.${userId}.`;
  let active = true;
  // Legacy recovery data has no owner and cannot be safely restored.
  storage.removeItem(`${prefix}v1`);
  return {
    getItem: (key: string) => (active ? storage.getItem(scope + key) : null),
    setItem: (key: string, value: string) => {
      if (active) storage.setItem(scope + key, value);
    },
    dispose: () => {
      active = false;
    },
  };
}

export function clearPendingWrites(storage: Storage) {
  for (let i = storage.length - 1; i >= 0; i--) {
    const key = storage.key(i);
    if (key?.startsWith(prefix)) storage.removeItem(key);
  }
}
