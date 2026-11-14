import * as Sentry from "@sentry/vue";
import { useDocumentVisibility, useOnline } from "@vueuse/core";
import { Mutex } from "async-mutex";
import type { GoogleSpreadsheet } from "google-spreadsheet";
import type { ResultAsync } from "neverthrow";
import { defineStore } from "pinia";
import { computed, onScopeDispose, type Ref, ref, shallowRef, watch, watchEffect } from "vue";
import { useAuthErrorHandler, useAuthStore } from "@/modules/auth/presentation";
import {
  createSpreadsheet,
  getSpreadsheetId,
  loadSpreadsheet,
  SPREADSHEET_NAME,
} from "@/modules/platform/infrastructure/spreadsheets";

const TRANSIENT_RETRY_DELAYS_MS = [5_000, 15_000, 30_000] as const;

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
  const isOnline = useOnline();
  const visibility = useDocumentVisibility();
  const mutex = new Mutex();
  let transientRetryTimer: ReturnType<typeof setTimeout> | null = null;
  let transientRetryCount = 0;

  const { handleAuthError } = useAuthErrorHandler();

  function clearTransientRetry() {
    if (transientRetryTimer !== null) {
      clearTimeout(transientRetryTimer);
      transientRetryTimer = null;
    }
  }

  function scheduleTransientRetry() {
    if (!authStore.isLoggedIn || !isOnline.value || doc.value) return;
    if (transientRetryTimer !== null || transientRetryCount >= TRANSIENT_RETRY_DELAYS_MS.length) {
      return;
    }
    const delayMs = TRANSIENT_RETRY_DELAYS_MS[transientRetryCount] ?? 30_000;
    transientRetryCount += 1;
    transientRetryTimer = setTimeout(() => {
      transientRetryTimer = null;
      if (authStore.isLoggedIn && isOnline.value && !doc.value) {
        void init();
      }
    }, delayMs);
  }

  onScopeDispose(clearTransientRetry);

  // Keep existing GoogleSpreadsheet instances synchronized immediately when the OAuth token refreshes
  watch(
    () => authStore.accessToken,
    (currentToken) => {
      if (doc.value && currentToken) {
        doc.value.auth = { token: currentToken };
      }
    },
    { flush: "sync", immediate: true },
  );

  // Cancel pending retries when user is logged out or offline, and reset retry backoff when connection returns
  watch(
    () => [authStore.isLoggedIn, isOnline.value] as const,
    ([loggedIn, online]) => {
      if (!loggedIn || !online) {
        clearTransientRetry();
      }
      if (loggedIn && online) {
        transientRetryCount = 0;
      }
    },
  );

  watch(visibility, (current, previous) => {
    if (
      current === "visible" &&
      previous === "hidden" &&
      !doc.value &&
      authStore.isLoggedIn &&
      isOnline.value
    ) {
      transientRetryCount = 0;
      clearTransientRetry();
      void init();
    }
  });

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

  async function resolveValidToken(explicitAccessToken?: string): Promise<string | null> {
    if (explicitAccessToken) return explicitAccessToken;

    const tokenResult = await authStore.ensureValidAccessToken();
    return tokenResult.match(
      (token) => token,
      () => null,
    );
  }

  async function initializeWithAuthRetry(accessToken: string) {
    const firstResult = await initializeSpreadsheet(accessToken);
    if (!(firstResult.isErr() && firstResult.error.reason === "auth-failed")) {
      return firstResult;
    }

    const recovered = await handleAuthError("spreadsheet-init");
    if (!recovered) return firstResult;

    const refreshedToken = await resolveValidToken();
    return refreshedToken ? initializeSpreadsheet(refreshedToken) : firstResult;
  }

  async function init(explicitAccessToken?: string) {
    await mutex.runExclusive(async () => {
      const accessToken = await resolveValidToken(explicitAccessToken);
      if (!accessToken) {
        scheduleTransientRetry();
        return;
      }

      if (doc.value) {
        clearTransientRetry();
        transientRetryCount = 0;
        doc.value.auth = { token: accessToken };
        return;
      }

      isLoading.value = true;
      const result = await initializeWithAuthRetry(accessToken);

      result.match(
        (initialized) => {
          clearTransientRetry();
          transientRetryCount = 0;
          doc.value = initialized.doc;
        },
        (error) => {
          if (error.reason !== "auth-failed") {
            reportInitError(error);
          }
          scheduleTransientRetry();
        },
      );

      isLoading.value = false;
    });
  }

  watchEffect(() => {
    // Track auth state, token updates, and online status so init() retries while doc is null
    const canInitialize =
      authStore.isLoggedIn && isOnline.value && authStore.accessToken !== undefined;
    if (!doc.value && canInitialize) {
      console.debug("User has logged in - initializing spreadsheet");
      void init();
    }
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
