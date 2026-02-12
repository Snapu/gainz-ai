import { useLocalStorage } from "@vueuse/core";
import { defineStore } from "pinia";
import { computed } from "vue";
import { googleSdkLoaded } from "vue3-google-login";

const CLIENT_ID = "804592774481-hvo962fnjn23g9tt4i0s5d62f17pegg7.apps.googleusercontent.com";
const SCOPES = [
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/drive.metadata.readonly",
  "https://www.googleapis.com/auth/drive.file",
];

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

  const login = () => {
    googleSdkLoaded((google) => {
      google.accounts.oauth2
        .initTokenClient({
          client_id: CLIENT_ID,
          scope: SCOPES.join(" "),
          callback: (response) => {
            if (!SCOPES.every((scope) => response.scope.includes(scope))) {
              console.warn("missing scopes in: ", response.scope);
            }
            accessToken.value = response.access_token;
            expiresAt.value = parseInt(response.expires_in, 10) * 1000 + Date.now();
          },
        })
        .requestAccessToken();
    });
  };

  const refreshAccessToken = async () => {
    return new Promise<void>((resolve, reject) => {
      googleSdkLoaded((google) => {
        google.accounts.oauth2
          .initTokenClient({
            client_id: CLIENT_ID,
            scope: SCOPES.join(" "),
            prompt: "", // Silent refresh
            callback: (response) => {
              accessToken.value = response.access_token;
              expiresAt.value = parseInt(response.expires_in, 10) * 1000 + Date.now();
              resolve();
            },
            error_callback: (error) => {
              reject(new Error(error.message));
            },
          })
          .requestAccessToken({ prompt: "" });
      });
    });
  };

  return { accessToken, isLoggedIn, needsRefresh, login, refreshAccessToken };
});
