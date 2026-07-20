/**
 * Offline mutation queue is no longer used. Firebase Firestore handles all
 * persistence through its built-in IndexedDB engine.
 * This module is kept as a no-op stub for backwards compatibility.
 */

export type OfflineMutationKind = string;

export type OfflineMutationStatus = 'PENDING' | 'SYNCING' | 'CONFLICT' | 'FAILED';

export type OfflineMutation = {
  id: string;
  userId: string;
  kind: OfflineMutationKind;
  label: string;
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  body?: string;
  entityId?: number | string;
  tempId?: number;
  createdAt: number;
  status: OfflineMutationStatus;
  attempts: number;
  dependsOn?: string[];
  expectedVersion?: number;
  lastError?: string;
  serverData?: unknown;
};

export function currentOfflineUserId() {
  return 'anonymous';
}

export async function readQueue(_includeResolved = false): Promise<OfflineMutation[]> {
  return [];
}

export async function pendingCount(): Promise<number> {
  return 0;
}

export function allocateTempId(): number {
  return -Date.now();
}

export async function enqueue(
  _mutation: Partial<OfflineMutation> & { noteId?: string },
): Promise<OfflineMutation | null> {
  return null;
}

export function removeFromQueue(_id: string) {
  return Promise.resolve();
}

export async function remapTempId(_tempId: number, _realId: number) {
  // No-op
}

export async function updateMutation(
  _id: string,
  _patch: Partial<Pick<OfflineMutation, 'status' | 'attempts' | 'lastError' | 'serverData' | 'expectedVersion'>>,
) {
  // No-op
}

export async function updateEntityVersion(_entityId: number, _expectedVersion: number) {
  // No-op
}

export async function discardUserOutbox(_userId?: string) {
  // No-op
}