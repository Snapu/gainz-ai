import * as Sentry from "@sentry/vue";
import { useLocalStorage } from "@vueuse/core";
import { defineStore } from "pinia";
import { computed } from "vue";
import { CLIENT_ID, requestAccessToken } from "@/modules/auth/application";
import { createGoogleAccessTokenRequester } from "@/modules/auth/infrastructure";

export { CLIENT_ID };

export const useAuthStore = defineStore("auth", () => {
  const accessToken = useLocalStorage<string | null>("auth:accessToken", null);
  const expiresAt = useLocalStorage<number | null>("auth:expiresAt", null);

  const isLoggedIn = computed(() => {
    if (!accessToken.value || !expiresAt.value) return false;
    return expiresAt.value - Date.now() > 0;
  });

  function login() {
    return requestAccessToken(createGoogleAccessTokenRequester())
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
