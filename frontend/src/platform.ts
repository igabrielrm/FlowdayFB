import { Capacitor } from '@capacitor/core';

export const isNative = Capacitor.isNativePlatform() || import.meta.env.VITE_NATIVE === 'true';

export function assetUrl(path?: string | null) {
  if (!path) return path ?? '';
  if (/^(https?:|data:|blob:)/i.test(path)) return path;
  return path;
}

