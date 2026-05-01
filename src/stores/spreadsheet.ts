import * as Sentry from "@sentry/vue";
import { Mutex } from "async-mutex";
import type { GoogleSpreadsheet } from "google-spreadsheet";
import { defineStore } from "pinia";
import { computed, type Ref, ref, shallowRef, watchEffect } from "vue";
import { useAuthErrorHandler } from "@/composables/useAuthErrorHandler";
import {
  createSpreadsheet,
  getSpreadsheetId,
  loadSpreadsheet,
  SPREADSHEET_NAME,
} from "@/services/spreadsheets";
import { useAuthStore } from "./auth";

export const useSpreadsheetStore = defineStore("spreadsheet", () => {
  const doc = shallowRef<GoogleSpreadsheet | null>(null) as Ref<GoogleSpreadsheet | null>;
  const isLoading = ref(false);

  const authStore = useAuthStore();
  const mutex = new Mutex();

  const { handleAuthError } = useAuthErrorHandler();

  // Clear doc when user logs out
  watchEffect(() => {
    if (!authStore.isLoggedIn && doc.value) {
      doc.value = null;
    }
  });

  async function init(accessToken: string) {
    await mutex.runExclusive(async () => {
      if (doc.value) return;

      isLoading.value = true;
      try {
        const idResult = await getSpreadsheetId(SPREADSHEET_NAME, accessToken);
        if (idResult.isErr()) {
          if (idResult.error === "auth-failed") {
            handleAuthError();
            return;
          }
          console.error("Error getting spreadsheet ID:", idResult.error);
          Sentry.captureMessage("Error getting spreadsheet ID", {
            level: "error",
            tags: { scope: "spreadsheet-store", feature: "init-get-id" },
            extra: { reason: idResult.error },
          });
        }
        if (idResult.isOk() && idResult.value !== null) {
          const loadResult = await loadSpreadsheet(idResult.value, accessToken);
          if (loadResult.isErr() && loadResult.error === "auth-failed") {
            handleAuthError();
            return;
          }
          if (loadResult.isErr()) {
            Sentry.captureMessage("Spreadsheet load failed", {
              level: "error",
              tags: { scope: "spreadsheet-store", feature: "init-load" },
              extra: { reason: loadResult.error, spreadsheetId: idResult.value },
            });
            return;
          }
          if (loadResult.isOk()) doc.value = loadResult.value as GoogleSpreadsheet;
        } else if (idResult.isOk()) {
          const createResult = await createSpreadsheet(SPREADSHEET_NAME, accessToken);
          if (createResult.isErr() && createResult.error === "auth-failed") {
            handleAuthError();
            return;
          }
          if (createResult.isErr()) {
            Sentry.captureMessage("Spreadsheet creation failed", {
              level: "error",
              tags: { scope: "spreadsheet-store", feature: "init-create" },
              extra: { reason: createResult.error },
            });
            return;
          }
          if (createResult.isOk()) doc.value = createResult.value as GoogleSpreadsheet;
        }
      } catch (error) {
        console.error("Failed to init spreadsheet", error);
        Sentry.captureException(error, {
          tags: { scope: "spreadsheet-store", feature: "init" },
        });
      } finally {
        isLoading.value = false;
      }
    });
  }

  watchEffect(() => {
    const { accessToken, isLoggedIn } = authStore;
    if (!accessToken || !isLoggedIn) return;
    console.debug("User has logged in - initializing spreadsheet");
    void init(accessToken);
  });

  const spreadsheetUrl = computed(() => {
    if (!doc.value?.spreadsheetId) return null;
    return `https://docs.google.com/spreadsheets/d/${doc.value.spreadsheetId}/edit`;
  });

  function openInBrowser() {
    if (spreadsheetUrl.value) {
      window.open(spreadsheetUrl.value, "_blank");
    }
  }

  return { isLoading, doc, spreadsheetUrl, openInBrowser, init };
});
