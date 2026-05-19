import * as Sentry from "@sentry/vue";
import { Mutex } from "async-mutex";
import type { GoogleSpreadsheet } from "google-spreadsheet";
import type { ResultAsync } from "neverthrow";
import { defineStore } from "pinia";
import { computed, type Ref, ref, shallowRef, watchEffect } from "vue";
import { useAuthStore } from "@/modules/auth/presentation";
import {
  createSpreadsheet,
  getSpreadsheetId,
  loadSpreadsheet,
  SPREADSHEET_NAME,
} from "@/modules/platform/infrastructure/spreadsheets";
import { useAuthErrorHandler } from "@/shared/presentation/composables/useAuthErrorHandler";

type SpreadsheetInitError =
  | { stage: "get-id"; reason: "get-spreadsheet-id-failed" | "parse-data-failed" | "auth-failed" }
  | { stage: "load"; reason: "load-spreadsheet-failed" | "auth-failed"; spreadsheetId: string }
  | { stage: "create"; reason: "create-spreadsheet-failed" | "auth-failed" };

type SpreadsheetInitResult =
  | { kind: "loaded"; doc: GoogleSpreadsheet; spreadsheetId: string }
  | { kind: "created"; doc: GoogleSpreadsheet };

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

  function initializeSpreadsheet(
    accessToken: string,
  ): ResultAsync<SpreadsheetInitResult, SpreadsheetInitError> {
    return getSpreadsheetId(SPREADSHEET_NAME, accessToken)
      .mapErr((reason) => ({ stage: "get-id", reason }) as const)
      .andThen((id) => {
        if (id !== null) {
          return loadSpreadsheet(id, accessToken)
            .map((loadedDoc) => ({ kind: "loaded", doc: loadedDoc, spreadsheetId: id }) as const)
            .mapErr((reason) => ({ stage: "load", reason, spreadsheetId: id }) as const);
        }

        return createSpreadsheet(SPREADSHEET_NAME, accessToken)
          .map((createdDoc) => ({ kind: "created", doc: createdDoc }) as const)
          .mapErr((reason) => ({ stage: "create", reason }) as const);
      });
  }

  function reportInitError(error: Exclude<SpreadsheetInitError, { reason: "auth-failed" }>) {
    if (error.stage === "get-id") {
      console.error("Error getting spreadsheet ID:", error.reason);
      Sentry.captureMessage("Error getting spreadsheet ID", {
        level: "error",
        tags: { scope: "spreadsheet-store", feature: "init-get-id" },
        extra: { reason: error.reason },
      });
      return;
    }

    if (error.stage === "load") {
      Sentry.captureMessage("Spreadsheet load failed", {
        level: "error",
        tags: { scope: "spreadsheet-store", feature: "init-load" },
        extra: { reason: error.reason, spreadsheetId: error.spreadsheetId },
      });
      return;
    }

    Sentry.captureMessage("Spreadsheet creation failed", {
      level: "error",
      tags: { scope: "spreadsheet-store", feature: "init-create" },
      extra: { reason: error.reason },
    });
  }

  async function init(accessToken: string) {
    await mutex.runExclusive(async () => {
      if (doc.value) return;

      isLoading.value = true;
      const result = await initializeSpreadsheet(accessToken);

      if (result.isErr()) {
        if (result.error.reason === "auth-failed") {
          handleAuthError();
          isLoading.value = false;
          return;
        }

        reportInitError(result.error);
        isLoading.value = false;
        return;
      }

      doc.value = result.value.doc;
      isLoading.value = false;
    });
  }

  watchEffect(() => {
    const { accessToken, isLoggedIn } = authStore;
    if (!accessToken || !isLoggedIn) return;
    console.debug("User has logged in - initializing spreadsheet");
    void init(accessToken);
  });

  const spreadsheetUrl = computed<string | null>(() => {
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
