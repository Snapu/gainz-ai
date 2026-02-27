import * as Sentry from "@sentry/vue";
import { useLocalStorage } from "@vueuse/core";
import { err, errAsync, okAsync, ResultAsync } from "neverthrow";
import { defineStore } from "pinia";
import { computed, ref, watch } from "vue";
import { type CallbackTypes, googleSdkLoaded } from "vue3-google-login";

export const CLIENT_ID = "804592774481-hvo962fnjn23g9tt4i0s5d62f17pegg7.apps.googleusercontent.com";
const SCOPES = [
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/drive.metadata.readonly",
  "https://www.googleapis.com/auth/drive.file",
];

type AuthError = "token-request-failed" | "missing-scopes";

export const useAuthStore = defineStore("auth", () => {
  const email = ref<string | null>(null);
  const accessToken = useLocalStorage<string | null>("auth:accessToken", null);
  const expiresAt = useLocalStorage<number | null>("auth:expiresAt", null);

  const isLoggedIn = computed(() => {
    if (!accessToken.value || !expiresAt.value) return false;
    return expiresAt.value - Date.now() > 0;
  });

  const requestAccessToken = (
    email: string,
    prompt: "" | "none" | "consent" | "select_account" = "none",
  ): ResultAsync<CallbackTypes.TokenPopupResponse, AuthError> =>
    ResultAsync.fromPromise(
      new Promise<CallbackTypes.TokenPopupResponse>((resolve, reject) => {
        googleSdkLoaded((google) => {
          const client = google.accounts.oauth2.initTokenClient({
            client_id: CLIENT_ID,
            scope: SCOPES.join(" "),
            prompt,
            hint: email,
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

  function setEmail(newEmail: string) {
    email.value = newEmail;
  }

  const isEmailSet = computed(() => !!email.value);

  function login() {
    if (!email.value) return;
    requestAccessToken(email.value, "none")
      .orElse((error) =>
        error === "missing-scopes" && email.value
          ? requestAccessToken(email.value, "consent")
          : err(error),
      )
      .andTee((response) => {
        accessToken.value = response.access_token;
        expiresAt.value = parseInt(response.expires_in, 10) * 1000 + Date.now();
      })
      .orTee((error) => {
        console.error("Login failed", error);
        Sentry.captureMessage(`Login failed: ${error}`, {
          level: "error",
        });
        email.value = null;
      });
  }
  return { accessToken, isLoggedIn, isEmailSet, setEmail, login };
});
