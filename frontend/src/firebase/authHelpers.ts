import { firebaseClient } from './client';

export function getCurrentUid(): string | null {
  return firebaseClient.auth.currentUser?.uid ?? null;
}

export function requireCurrentUid(): string {
  const uid = getCurrentUid();
  if (!uid) {
    throw new Error('No hay usuario autenticado');
  }
  return uid;
}

export function isFirebaseSignedIn(): boolean {
  return getCurrentUid() != null;
}
