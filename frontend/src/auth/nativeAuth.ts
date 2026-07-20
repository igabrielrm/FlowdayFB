import { SecureStorage } from '@aparajita/capacitor-secure-storage';
import { apiUrl, isNative } from '../platform';
import { withTimeout } from '../api/timeout';

const REFRESH_TOKEN_KEY = 'flowday_refresh_token';
const OAUTH_VERIFIER_KEY = 'flowday_oauth_verifier';
const NETWORK_TIMEOUT_MS = 2500;

let accessToken: string | null = null;
let refreshInFlight: Promise<string | null> | null = null;

type TokenPayload = {
  accessToken?: string;
  refreshToken?: string;
  access_token?: string;
  refresh_token?: string;
  data?: TokenPayload;
};

function unpack(payload: TokenPayload) {
  const source = payload.data ?? payload;
  return {
    accessToken: source.accessToken ?? source.access_token ?? null,
    refreshToken: source.refreshToken ?? source.refresh_token ?? null,
  };
}

export function getNativeAccessToken() {
  return isNative ? accessToken : null;
}

export async function storeNativeTokens(payload: TokenPayload) {
  if (!isNative) return;
  const tokens = unpack(payload);
  accessToken = tokens.accessToken;
  if (tokens.refreshToken) {
    await SecureStorage.set(REFRESH_TOKEN_KEY, tokens.refreshToken);
  }
}

export async function clearNativeTokens() {
  accessToken = null;
  if (!isNative) return;
  try {
    await SecureStorage.remove(REFRESH_TOKEN_KEY);
  } catch {
    // The token may not exist yet.
  }
}

async function readRefreshToken() {
  if (!isNative) return null;
  try {
    const value = await SecureStorage.get(REFRESH_TOKEN_KEY);
    return typeof value === 'string' ? value : null;
  } catch {
    return null;
  }
}

export async function getNativeRefreshToken() {
  return readRefreshToken();
}

export async function refreshNativeAccessToken(): Promise<string | null> {
  if (!isNative) return null;
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    const refreshToken = await readRefreshToken();
    if (!refreshToken) return null;

    try {
      const response = await withTimeout(
        fetch(apiUrl('/api/v1/mobile-auth/refresh'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken }),
        }),
        NETWORK_TIMEOUT_MS,
      );
      if (!response.ok) {
        await clearNativeTokens();
        return null;
      }
      const payload = (await response.json()) as TokenPayload;
      await storeNativeTokens(payload);
      return accessToken;
    } catch {
      return null;
    }
  })().finally(() => {
    refreshInFlight = null;
  });

  return refreshInFlight;
}

export async function nativeAuthHeaders(): Promise<Record<string, string>> {
  if (!isNative) return {};
  const token = accessToken ?? (await refreshNativeAccessToken());
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function exchangeNativeOAuthCode(code: string) {
  if (!isNative || !code) return false;
  try {
    const storedVerifier = await SecureStorage.get(OAUTH_VERIFIER_KEY);
    if (typeof storedVerifier !== 'string') return false;
    const response = await withTimeout(
      fetch(apiUrl('/api/v1/mobile-auth/oauth/exchange'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, codeVerifier: storedVerifier }),
      }),
      NETWORK_TIMEOUT_MS,
    );
    if (!response.ok) return false;
    await storeNativeTokens((await response.json()) as TokenPayload);
    await SecureStorage.remove(OAUTH_VERIFIER_KEY);
    return !!accessToken;
  } catch {
    return false;
  }
}

function base64Url(bytes: Uint8Array) {
  let binary = '';
  bytes.forEach((value) => {
    binary += String.fromCharCode(value);
  });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function nativeOAuthStartUrl(provider: string) {
  const random = crypto.getRandomValues(new Uint8Array(32));
  const verifier = base64Url(random);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  const challenge = base64Url(new Uint8Array(digest));
  await SecureStorage.set(OAUTH_VERIFIER_KEY, verifier);
  return apiUrl(
    `/api/v1/mobile-auth/oauth/${encodeURIComponent(provider)}/start`
      + `?codeChallenge=${encodeURIComponent(challenge)}`,
  );
}

export async function nativeAuthorizedFetch(path: string, init: RequestInit = {}) {
  const headers = {
    ...(init.headers || {}),
    ...(await nativeAuthHeaders()),
  };
  let response = await withTimeout(fetch(apiUrl(path), { ...init, headers }), NETWORK_TIMEOUT_MS);

  if (isNative && response.status === 401) {
    const renewed = await refreshNativeAccessToken();
    if (renewed) {
      response = await withTimeout(
        fetch(apiUrl(path), {
          ...init,
          headers: { ...(init.headers || {}), Authorization: `Bearer ${renewed}` },
        }),
        NETWORK_TIMEOUT_MS,
      );
    }
  }
  return response;
}
