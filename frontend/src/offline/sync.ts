export type SyncResult = {
  synced: number;
  failed: number;
  errors: string[];
};

let flushing = false;

/**
 * Offline sync now relies entirely on Firebase Firestore's built-in persistence.
 * Changes are automatically stored in Firestore's IndexedDB and synced when online.
 * This module is kept as a no-op stub for backwards compatibility.
 */
export async function flushOfflineQueue(): Promise<SyncResult> {
  if (flushing) return { synced: 0, failed: 0, errors: [] };
  flushing = true;
  try {
    return { synced: 0, failed: 0, errors: [] };
  } finally {
    flushing = false;
  }
}

export function isFlushingQueue() {
  return flushing;
}