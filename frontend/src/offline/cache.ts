import type { UsuarioDto } from '../api/client';

const API_PREFIX = 'flowday-offline-api:';
const USER_KEY = 'flowday-offline-user';
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

type CachedEntry<T> = {
  data: T;
  savedAt: number;
};

function readEntry<T>(key: string): CachedEntry<T> | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedEntry<T>;
    if (!parsed?.data || !parsed.savedAt) return null;
    if (Date.now() - parsed.savedAt > MAX_AGE_MS) {
      localStorage.removeItem(key);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeEntry<T>(key: string, data: T) {
  try {
    const entry: CachedEntry<T> = { data, savedAt: Date.now() };
    localStorage.setItem(key, JSON.stringify(entry));
  } catch {
    /* quota */
  }
}

export function isBrowserOffline(): boolean {
  return typeof navigator !== 'undefined' && !navigator.onLine;
}

export function cacheApiGet<T>(path: string, data: T) {
  writeEntry(`${API_PREFIX}${path}`, data);
}

export function readApiGet<T>(path: string): T | null {
  return readEntry<T>(`${API_PREFIX}${path}`)?.data ?? null;
}

export function cacheSessionUser(user: UsuarioDto) {
  writeEntry(USER_KEY, user);
}

export function readSessionUser(): UsuarioDto | null {
  return readEntry<UsuarioDto>(USER_KEY)?.data ?? null;
}

export function clearSessionUser() {
  localStorage.removeItem(USER_KEY);
}

export function isTempEntityId(id: number) {
  return id < 0;
}

export function updateApiGet<T>(path: string, updater: (current: T | null) => T | null) {
  const current = readApiGet<T>(path);
  const next = updater(current);
  if (next != null) {
    cacheApiGet(path, next);
  } else {
    localStorage.removeItem(`${API_PREFIX}${path}`);
  }
}

export function removeApiGet(path: string) {
  localStorage.removeItem(`${API_PREFIX}${path}`);
}
