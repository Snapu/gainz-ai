import * as Sentry from "@sentry/vue";
import { useLocalStorage } from "@vueuse/core";
import { err, errAsync, okAsync, ResultAsync } from "neverthrow";
import { defineStore } from "pinia";
import { computed } from "vue";
import { googleSdkLoaded } from "vue3-google-login";

const CLIENT_ID = "804592774481-hvo962fnjn23g9tt4i0s5d62f17pegg7.apps.googleusercontent.com";
const SCOPES = [
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/drive.metadata.readonly",
  "https://www.googleapis.com/auth/drive.file",
];

type AuthError = "token-request-failed" | "missing-scopes";
interface GoogleTokenResponse {
  access_token: string;
  expires_in: string;
  scope: string;
}

export const useAuthStore = defineStore("auth", () => {
  const accessToken = useLocalStorage<string | null>("auth:accessToken", null);
  const expiresAt = useLocalStorage<number | null>("auth:expiresAt", null);

  const isLoggedIn = computed(() => {
    if (!accessToken.value || !expiresAt.value) return false;
    return expiresAt.value - Date.now() > 0;
  });

  const needsRefresh = computed(() => {
    if (!expiresAt.value) return false;
    // Refresh if token expires in less than 5 minutes
    return expiresAt.value - Date.now() < 5 * 60 * 1000;
  });

  const requestAccessToken = (
    prompt: "none" | "consent" | "select_account" = "none",
  ): ResultAsync<GoogleTokenResponse, AuthError> =>
    ResultAsync.fromPromise(
      new Promise<GoogleTokenResponse>((resolve, reject) => {
        googleSdkLoaded((google) => {
          const client = google.accounts.oauth2.initTokenClient({
            client_id: CLIENT_ID,
            scope: SCOPES.join(" "),
            prompt,
            callback: resolve,
            error_callback: reject,
          });
          client.requestAccessToken();
        });
      }),
      (e) => e,
    )
      .orTee((originalError) => Sentry.captureException(originalError)) // log transport error
      .mapErr((): AuthError => "token-request-failed")
      .andThen(
        (response): ResultAsync<GoogleTokenResponse, AuthError> =>
          SCOPES.every((scope) => response.scope?.includes(scope))
            ? okAsync(response)
            : errAsync("missing-scopes"),
      );

  const login = () =>
    requestAccessToken("none")
      .orElse((error) => (error === "missing-scopes" ? requestAccessToken("consent") : err(error)))
      .andTee((response) => {
        accessToken.value = response.access_token;
        expiresAt.value = parseInt(response.expires_in, 10) * 1000 + Date.now();
      })
      .orTee((error) => {
        Sentry.captureMessage(`Login failed: ${error}`, {
          level: "error",
        });
      });

  return { accessToken, isLoggedIn, needsRefresh, login };
});
