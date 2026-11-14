import * as Sentry from "@sentry/vue";
import { useIntervalFn, useNow } from "@vueuse/core";
import { Mutex } from "async-mutex";
import { err, errAsync, ok, okAsync, type Result, ResultAsync } from "neverthrow";
import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { CLIENT_ID, refreshAccessToken, requestAccessToken } from "@/modules/auth/application";
import type { AuthTokenRequestError, OAuthTokenResponse } from "@/modules/auth/domain";
import {
  clearAuthTokens,
  createGoogleAccessTokenService,
  loadAuthTokens,
  readSynchronousWebTokens,
  saveAuthTokens,
} from "@/modules/auth/infrastructure";

export { CLIENT_ID };

const AUTH_REFRESH_BUFFER_MS = 60_000;
export const AUTH_PROACTIVE_REFRESH_THRESHOLD_MS = 5 * AUTH_REFRESH_BUFFER_MS;

function parseJwtExpirationMs(token: string | null | undefined): number | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const raw = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = raw.padEnd(raw.length + ((4 - (raw.length % 4)) % 4), "=");
    const json = JSON.parse(atob(padded)) as { exp?: unknown };
    return typeof json.exp === "number" ? json.exp * 1000 : null;
  } catch {
    return null;
  }
}

export const useAuthStore = defineStore("auth", () => {
  const initial = readSynchronousWebTokens();
  const accessToken = ref<string | null>(initial.accessToken);
  const refreshToken = ref<string | null>(initial.refreshToken);
  const idToken = ref<string | null>(initial.idToken);
  const expiresAt = ref<number | null>(initial.expiresAt);
  const now = useNow({ scheduler: (cb) => useIntervalFn(cb, 10000) });
  const refreshMutex = new Mutex();
  let initPromise: Promise<void> | null = null;
  let authGeneration = 0;

  const isLoggedIn = computed(() => {
    if (refreshToken.value) return true;
    if (!accessToken.value || !expiresAt.value) return false;
    return expiresAt.value - now.value.getTime() > 0;
  });

  function hydrateFromStorage(
    stored: {
      accessToken: string | null;
      refreshToken: string | null;
      idToken: string | null;
      expiresAt: number | null;
    },
    expectedGeneration: number,
  ): void {
    if (expectedGeneration !== authGeneration) return;

    if (stored.refreshToken && !refreshToken.value) {
      refreshToken.value = stored.refreshToken;
    }
    if (stored.accessToken && !accessToken.value) {
      accessToken.value = stored.accessToken;
    }
    if (stored.idToken && !idToken.value) {
      idToken.value = stored.idToken;
    }
    if (stored.expiresAt && !expiresAt.value) {
      expiresAt.value = stored.expiresAt;
    }
  }

  function init(): Promise<void> {
    if (!initPromise) {
      const expectedGeneration = authGeneration;
      initPromise = loadAuthTokens().then((stored) =>
        hydrateFromStorage(stored, expectedGeneration),
      );
    }
    return initPromise;
  }

  void init();

  function applyTokenResponse(response: OAuthTokenResponse): void {
    authGeneration++;
    const computedExpiresAt = response.expires_in * 1000 + Date.now();
    accessToken.value = response.access_token;
    expiresAt.value = computedExpiresAt;
    if (response.refresh_token) {
      refreshToken.value = response.refresh_token;
    }
    // Never retain an older grant's id_token if a refresh omits it (prevents stale/rejected JWT reuse)
    idToken.value = response.id_token ?? null;
    saveAuthTokens({
      accessToken: response.access_token,
      refreshToken: response.refresh_token ?? refreshToken.value,
      idToken: response.id_token ?? null,
      expiresAt: computedExpiresAt,
    }).catch((err) => {
      console.error("Failed to persist auth tokens to storage", err);
      Sentry.captureException(err);
    });
  }

  function login() {
    return requestAccessToken(createGoogleAccessTokenService())
      .andTee((response) => {
        applyTokenResponse(response);
      })
      .orTee((error) => {
        console.warn("Login cancelled or failed", error);
      });
  }

  function refreshSession(force = false): ResultAsync<string, AuthTokenRequestError> {
    if (!refreshToken.value) {
      return errAsync("token-refresh-failed");
    }

    return ResultAsync.fromPromise(
      refreshMutex.runExclusive(async (): Promise<Result<string, AuthTokenRequestError>> => {
        if (
          !force &&
          accessToken.value &&
          expiresAt.value &&
          expiresAt.value - Date.now() > AUTH_PROACTIVE_REFRESH_THRESHOLD_MS
        ) {
          return ok(accessToken.value);
        }

        const currentRefreshToken = refreshToken.value;
        if (!currentRefreshToken) {
          return err("token-refresh-failed");
        }

        const result = await refreshAccessToken(
          createGoogleAccessTokenService(),
          currentRefreshToken,
        );

        if (result.isOk()) {
          applyTokenResponse(result.value);
          return ok(result.value.access_token);
        }

        if (result.error === "refresh-token-invalid") {
          logout();
        }
        return err(result.error);
      }),
      (): AuthTokenRequestError => "token-refresh-failed",
    ).andThen((inner) => inner);
  }

  function ensureValidAccessToken(): ResultAsync<string, AuthTokenRequestError> {
    if (
      accessToken.value &&
      expiresAt.value &&
      expiresAt.value - Date.now() > AUTH_REFRESH_BUFFER_MS
    ) {
      return okAsync(accessToken.value);
    }

    if (refreshToken.value) {
      return refreshSession();
    }

    if (accessToken.value && expiresAt.value && expiresAt.value - Date.now() > 0) {
      return okAsync(accessToken.value);
    }

    return errAsync("token-refresh-failed");
  }

  function isIdTokenValid(): boolean {
    if (!idToken.value) return false;
    const exp = parseJwtExpirationMs(idToken.value);
    const deadline = exp ?? expiresAt.value;
    return deadline !== null && deadline - Date.now() > AUTH_REFRESH_BUFFER_MS;
  }

  function ensureValidIdToken(): ResultAsync<string, AuthTokenRequestError> {
    if (isIdTokenValid() && idToken.value) {
      return okAsync(idToken.value);
    }

    if (refreshToken.value) {
      return refreshSession().andThen(() => {
        if (isIdTokenValid() && idToken.value) {
          return okAsync(idToken.value);
        }
        return ensureValidAccessToken();
      });
    }

    return ensureValidAccessToken();
  }

  function logout(): void {
    authGeneration++;
    accessToken.value = null;
    refreshToken.value = null;
    idToken.value = null;
    expiresAt.value = null;
    clearAuthTokens().catch((err) => {
      console.error("Failed to clear auth tokens from storage on logout", err);
      Sentry.captureException(err);
    });
  }

  return {
    accessToken,
    refreshToken,
    idToken,
    expiresAt,
    isLoggedIn,
    login,
    refreshSession,
    init,
    ensureValidAccessToken,
    ensureValidIdToken,
    logout,
  };
});
