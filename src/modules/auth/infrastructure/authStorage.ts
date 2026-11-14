import { Capacitor } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";

export interface StoredAuthTokens {
  accessToken: string | null;
  refreshToken: string | null;
  idToken: string | null;
  expiresAt: number | null;
}

const AUTH_KEYS = {
  accessToken: "auth:accessToken",
  refreshToken: "auth:refreshToken",
  idToken: "auth:idToken",
  expiresAt: "auth:expiresAt",
} as const;

export function readSynchronousWebTokens(): StoredAuthTokens {
  if (Capacitor.isNativePlatform() || typeof localStorage === "undefined") {
    return {
      accessToken: null,
      refreshToken: null,
      idToken: null,
      expiresAt: null,
    };
  }

  const rawExpires = localStorage.getItem(AUTH_KEYS.expiresAt);
  const expiresNum = rawExpires ? Number.parseInt(rawExpires, 10) : null;

  return {
    accessToken: localStorage.getItem(AUTH_KEYS.accessToken),
    refreshToken: localStorage.getItem(AUTH_KEYS.refreshToken),
    idToken: localStorage.getItem(AUTH_KEYS.idToken),
    expiresAt: Number.isFinite(expiresNum) ? expiresNum : null,
  };
}

async function saveNativeToken(key: string, value: string | null): Promise<void> {
  if (typeof localStorage !== "undefined") {
    try {
      localStorage.removeItem(key);
    } catch {
      // ignore webview localstorage errors
    }
  }
  if (value === null) {
    await Preferences.remove({ key });
  } else {
    await Preferences.set({ key, value });
  }
}

function saveWebToken(key: string, value: string | null): void {
  if (value === null) {
    localStorage.removeItem(key);
  } else {
    localStorage.setItem(key, value);
  }
}

export async function saveAuthTokens(tokens: {
  accessToken?: string | null;
  refreshToken?: string | null;
  idToken?: string | null;
  expiresAt?: number | null;
}): Promise<void> {
  const isNative = Capacitor.isNativePlatform();

  const entries: Array<[keyof typeof AUTH_KEYS, string | null | undefined]> = [
    ["accessToken", tokens.accessToken],
    ["refreshToken", tokens.refreshToken],
    ["idToken", tokens.idToken],
    [
      "expiresAt",
      tokens.expiresAt !== undefined && tokens.expiresAt !== null
        ? String(tokens.expiresAt)
        : tokens.expiresAt,
    ],
  ];

  for (const [key, value] of entries) {
    if (value === undefined) continue;
    const storageKey = AUTH_KEYS[key];

    if (isNative) {
      await saveNativeToken(storageKey, value);
    } else {
      saveWebToken(storageKey, value);
    }
  }
}

export async function loadAuthTokens(): Promise<StoredAuthTokens> {
  const isNative = Capacitor.isNativePlatform();

  if (isNative) {
    const [accessRes, refreshRes, idRes, expiresRes] = await Promise.all([
      Preferences.get({ key: AUTH_KEYS.accessToken }),
      Preferences.get({ key: AUTH_KEYS.refreshToken }),
      Preferences.get({ key: AUTH_KEYS.idToken }),
      Preferences.get({ key: AUTH_KEYS.expiresAt }),
    ]);

    const expiresNum = expiresRes.value ? Number.parseInt(expiresRes.value, 10) : null;

    return {
      accessToken: accessRes.value ?? null,
      refreshToken: refreshRes.value ?? null,
      idToken: idRes.value ?? null,
      expiresAt: Number.isFinite(expiresNum) ? expiresNum : null,
    };
  }

  return readSynchronousWebTokens();
}

export async function clearAuthTokens(): Promise<void> {
  const isNative = Capacitor.isNativePlatform();

  const keys = Object.values(AUTH_KEYS);
  if (isNative) {
    if (typeof localStorage !== "undefined") {
      try {
        for (const key of keys) localStorage.removeItem(key);
      } catch {
        // ignore webview localstorage errors
      }
    }
    await Promise.all(keys.map((key) => Preferences.remove({ key })));
  } else {
    for (const key of keys) {
      localStorage.removeItem(key);
    }
  }
}
