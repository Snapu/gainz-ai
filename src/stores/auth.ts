import * as Sentry from "@sentry/vue";
import { useLocalStorage } from "@vueuse/core";
import { errAsync, okAsync, ResultAsync } from "neverthrow";
import { defineStore } from "pinia";
import { computed } from "vue";
import { type CallbackTypes, googleSdkLoaded } from "vue3-google-login";

export const CLIENT_ID = "804592774481-hvo962fnjn23g9tt4i0s5d62f17pegg7.apps.googleusercontent.com";
const SCOPES = [
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/drive.metadata.readonly",
  "https://www.googleapis.com/auth/drive.file",
];

type AuthError = "token-request-failed" | "missing-scopes";

export const useAuthStore = defineStore("auth", () => {
  const accessToken = useLocalStorage<string | null>("auth:accessToken", null);
  const expiresAt = useLocalStorage<number | null>("auth:expiresAt", null);

  const isLoggedIn = computed(() => {
    if (!accessToken.value || !expiresAt.value) return false;
    return expiresAt.value - Date.now() > 0;
  });

  const requestAccessToken = (): ResultAsync<CallbackTypes.TokenPopupResponse, AuthError> =>
    ResultAsync.fromPromise(
      new Promise<CallbackTypes.TokenPopupResponse>((resolve, reject) => {
        googleSdkLoaded((google) => {
          const client = google.accounts.oauth2.initTokenClient({
            client_id: CLIENT_ID,
            scope: SCOPES.join(" "),
            callback: resolve,
            error_callback: reject,
          });
          client.requestAccessToken();
        });
      }),
      (e) => e,
    )
      .orTee((originalError) => {
        console.error("Token request failed", originalError);
        Sentry.captureException(originalError);
      })
      .mapErr((): AuthError => "token-request-failed")
      .andThen(
        (response): ResultAsync<CallbackTypes.TokenPopupResponse, AuthError> =>
          SCOPES.every((scope) => response.scope?.includes(scope))
            ? okAsync(response)
            : errAsync("missing-scopes"),
      );

  function login() {
    return requestAccessToken()
      .andTee((response) => {
        accessToken.value = response.access_token;
        expiresAt.value = response.expires_in * 1000 + Date.now();
      })
      .orTee((error) => {
        console.error("Login failed", error);
        Sentry.captureMessage(`Login failed: ${error}`, {
          level: "error",
        });
      });
  }

  function logout() {
    accessToken.value = null;
    expiresAt.value = null;
  }

  return { accessToken, expiresAt, isLoggedIn, login, logout };
});
