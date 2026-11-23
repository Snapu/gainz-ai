import {
  StorageSerializers,
  useDocumentVisibility,
  useLocalStorage,
  useOnline,
} from "@vueuse/core";
import { Mutex } from "async-mutex";
import type { GoogleSpreadsheet } from "google-spreadsheet";
import { err, errAsync, ok, okAsync, type Result, ResultAsync } from "neverthrow";
import { defineStore } from "pinia";
import { computed, onScopeDispose, type Ref, ref, shallowRef, watch, watchEffect } from "vue";
import { CLIENT_ID, useAuthErrorHandler, useAuthStore } from "@/modules/auth/presentation";
import {
  createSpreadsheet,
  type GooglePickerError,
  getSpreadsheetId,
  loadSpreadsheet,
  pickSpreadsheetId,
  SPREADSHEET_NAME,
  type SpreadsheetTrashError,
  trashSpreadsheet,
} from "@/modules/platform/infrastructure";

const TRANSIENT_RETRY_DELAYS_MS = [5_000, 15_000, 30_000] as const;
const LINKED_SPREADSHEET_STORAGE_KEY = "gainz:linkedSpreadsheetId";

export type SpreadsheetChoiceError =
  | "missing-access-token"
  | "auth-failed"
  | "forbidden"
  | "create-spreadsheet-failed"
  | "load-spreadsheet-failed"
  | "not-found"
  | GooglePickerError;

type SpreadsheetInitError =
  | SpreadsheetChoiceError
  | "get-spreadsheet-id-failed"
  | "parse-data-failed";

export const useSpreadsheetStore = defineStore("spreadsheet", () => {
  const doc = shallowRef<GoogleSpreadsheet | null>(null) as Ref<GoogleSpreadsheet | null>;
  const createdSpreadsheetId = ref<string | null>(null);
  const isLoading = ref(false);
  const isPickerOpen = ref(false);
  const needsSpreadsheetChoice = ref(false);
  const linkedSpreadsheetId = useLocalStorage<string | null>(LINKED_SPREADSHEET_STORAGE_KEY, null, {
    flush: "sync",
    serializer: StorageSerializers.string,
  });

  const authStore = useAuthStore();
  const isOnline = useOnline();
  const visibility = useDocumentVisibility();
  const mutex = new Mutex();
  let transientRetryTimer: ReturnType<typeof setTimeout> | null = null;
  let transientRetryCount = 0;
  let sessionGeneration = 0;
  let activePickerAbortController: AbortController | null = null;

  const { handleAuthError } = useAuthErrorHandler();

  function clearTransientRetry() {
    transientRetryCount = 0;
    if (transientRetryTimer !== null) {
      clearTimeout(transientRetryTimer);
      transientRetryTimer = null;
    }
  }

  function scheduleTransientRetry() {
    if (!authStore.isLoggedIn || !isOnline.value || doc.value || needsSpreadsheetChoice.value) {
      return;
    }
    if (transientRetryTimer !== null || transientRetryCount >= TRANSIENT_RETRY_DELAYS_MS.length) {
      return;
    }
    const delayMs = TRANSIENT_RETRY_DELAYS_MS[transientRetryCount] ?? 30_000;
    transientRetryCount += 1;
    transientRetryTimer = setTimeout(() => {
      transientRetryTimer = null;
      if (authStore.isLoggedIn && isOnline.value && !doc.value && !needsSpreadsheetChoice.value) {
        void init();
      }
    }, delayMs);
  }

  function clearSpreadsheetSessionState() {
    sessionGeneration += 1;
    activePickerAbortController?.abort();
    activePickerAbortController = null;
    clearTransientRetry();
    createdSpreadsheetId.value = null;
    doc.value = null;
    needsSpreadsheetChoice.value = false;
  }

  onScopeDispose(() => {
    activePickerAbortController?.abort();
    activePickerAbortController = null;
    clearTransientRetry();
  });

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

  // Cancel pending retries and reset retry backoff when user is logged out or offline
  watch(
    () => [authStore.isLoggedIn, isOnline.value] as const,
    ([loggedIn, online]) => {
      if (!loggedIn || !online) {
        clearTransientRetry();
      }
    },
  );

  watch(visibility, (current, previous) => {
    if (
      current === "visible" &&
      previous === "hidden" &&
      !doc.value &&
      !needsSpreadsheetChoice.value &&
      authStore.isLoggedIn &&
      isOnline.value
    ) {
      clearTransientRetry();
      void init();
    }
  });

  // Reset active sheet session on token expiry/logout while keeping linkedSpreadsheetId across 1h Web expiries
  watch(
    () => authStore.isLoggedIn,
    (loggedIn, previousLoggedIn) => {
      if (!loggedIn && previousLoggedIn) {
        clearSpreadsheetSessionState();
      }
    },
    { flush: "sync" },
  );

  function activateSpreadsheetDoc(nextDoc: GoogleSpreadsheet) {
    if (!authStore.isLoggedIn) return;
    clearTransientRetry();
    needsSpreadsheetChoice.value = false;
    linkedSpreadsheetId.value = nextDoc.spreadsheetId;
    doc.value = nextDoc;
  }

  function resolveByName(
    accessToken: string,
  ): ResultAsync<GoogleSpreadsheet | null, SpreadsheetInitError> {
    return getSpreadsheetId(SPREADSHEET_NAME, accessToken).andThen((id) =>
      id === null ? okAsync(null) : loadSpreadsheet(id, accessToken),
    );
  }

  function initializeSpreadsheet(
    accessToken: string,
  ): ResultAsync<GoogleSpreadsheet | null, SpreadsheetInitError> {
    const savedId = linkedSpreadsheetId.value?.trim();
    if (!savedId) {
      return resolveByName(accessToken);
    }

    // Clear linkedSpreadsheetId on 404/403 so deleted, unshared, or cross-account sheets fall back cleanly
    return loadSpreadsheet(savedId, accessToken).orElse((error) => {
      if (error === "not-found" || error === "forbidden") {
        linkedSpreadsheetId.value = null;
        return resolveByName(accessToken);
      }
      return errAsync(error);
    });
  }

  function resolveValidToken(explicitAccessToken?: string): Promise<string | null> {
    return explicitAccessToken
      ? Promise.resolve(explicitAccessToken)
      : authStore.ensureValidAccessToken().unwrapOr(null);
  }

  function runWithAuthRetry<T, E extends string>(
    scope: string,
    initialToken: string,
    operation: (token: string) => ResultAsync<T, E>,
  ): ResultAsync<T, E> {
    return operation(initialToken).orElse((error) => {
      if (error !== "auth-failed") {
        return errAsync(error);
      }
      return ResultAsync.fromSafePromise(handleAuthError(scope)).andThen((recovered) =>
        recovered
          ? authStore
              .ensureValidAccessToken()
              .mapErr(() => error)
              .andThen(operation)
          : errAsync(error),
      );
    });
  }

  function applyInitResult(result: Result<GoogleSpreadsheet | null, SpreadsheetInitError>): void {
    result.match(
      (loadedDoc) => {
        if (!loadedDoc) {
          clearTransientRetry();
          needsSpreadsheetChoice.value = true;
          return;
        }
        activateSpreadsheetDoc(loadedDoc);
      },
      (error) => {
        if (error !== "auth-failed") {
          console.error("Spreadsheet initialization failed:", error);
        }
        scheduleTransientRetry();
      },
    );
  }

  async function runInit(explicitAccessToken?: string): Promise<void> {
    if (!authStore.isLoggedIn || doc.value || needsSpreadsheetChoice.value) return;
    const startGeneration = sessionGeneration;

    const accessToken = await resolveValidToken(explicitAccessToken);
    if (!accessToken) {
      scheduleTransientRetry();
      return;
    }
    if (startGeneration !== sessionGeneration || doc.value || needsSpreadsheetChoice.value) return;

    isLoading.value = true;
    try {
      const result = await runWithAuthRetry("spreadsheet-init", accessToken, initializeSpreadsheet);
      if (startGeneration !== sessionGeneration || !authStore.isLoggedIn) return;
      applyInitResult(result);
    } finally {
      isLoading.value = false;
    }
  }

  async function init(explicitAccessToken?: string) {
    await mutex.runExclusive(() => runInit(explicitAccessToken));
  }

  function commitChoice(
    scope: string,
    operation: (token: string) => ResultAsync<GoogleSpreadsheet, SpreadsheetChoiceError>,
    initialTokenOverride?: string,
  ): ResultAsync<void, SpreadsheetChoiceError> {
    return new ResultAsync(
      mutex.runExclusive(async (): Promise<Result<void, SpreadsheetChoiceError>> => {
        if (doc.value) return ok(undefined);
        const startGeneration = sessionGeneration;
        const initialToken =
          initialTokenOverride ?? (authStore.isLoggedIn ? await resolveValidToken() : null);
        if (!initialToken || startGeneration !== sessionGeneration || !authStore.isLoggedIn) {
          return err("missing-access-token");
        }

        isLoading.value = true;
        try {
          return await runWithAuthRetry(scope, initialToken, operation)
            .orTee((error) => {
              if (error !== "auth-failed") {
                console.error(`Spreadsheet setup failed (${scope}):`, error);
              }
            })
            .andThen((nextDoc): Result<void, SpreadsheetChoiceError> => {
              if (startGeneration !== sessionGeneration || !authStore.isLoggedIn) {
                return err("missing-access-token");
              }
              activateSpreadsheetDoc(nextDoc);
              return ok(undefined);
            });
        } finally {
          isLoading.value = false;
        }
      }),
    );
  }

  function createNewSpreadsheet(): ResultAsync<void, SpreadsheetChoiceError> {
    if (doc.value || activePickerAbortController) return okAsync(undefined);
    return commitChoice("spreadsheet-create", (token) =>
      createSpreadsheet(SPREADSHEET_NAME, token).andTee((createdDoc) => {
        createdSpreadsheetId.value = createdDoc.spreadsheetId;
      }),
    );
  }

  async function promptSpreadsheetPicker(): Promise<
    Result<{ id: string; token: string }, SpreadsheetChoiceError>
  > {
    const controller = new AbortController();
    activePickerAbortController = controller;
    try {
      const token = authStore.isLoggedIn ? await resolveValidToken() : null;
      if (!token || controller.signal.aborted || !authStore.isLoggedIn) {
        return err("missing-access-token");
      }
      isPickerOpen.value = true;
      const picked = await pickSpreadsheetId({
        accessToken: token,
        clientId: CLIENT_ID,
        signal: controller.signal,
      });
      return picked.map((id) => ({ id, token }));
    } finally {
      if (activePickerAbortController === controller) {
        activePickerAbortController = null;
      }
      isPickerOpen.value = false;
    }
  }

  function linkExistingSpreadsheet(): ResultAsync<void, SpreadsheetChoiceError> {
    if (doc.value || activePickerAbortController) return okAsync(undefined);
    return new ResultAsync(promptSpreadsheetPicker()).andThen(({ id, token: initialToken }) =>
      commitChoice(
        "spreadsheet-link",
        (token) =>
          loadSpreadsheet(id, token).andTee(() => {
            createdSpreadsheetId.value = null;
          }),
        initialToken,
      ),
    );
  }

  function switchSpreadsheet(): ResultAsync<void, SpreadsheetChoiceError> {
    if (activePickerAbortController) return okAsync(undefined);
    return new ResultAsync(promptSpreadsheetPicker())
      .andTee(({ id }) => {
        if (id === doc.value?.spreadsheetId) return;
        linkedSpreadsheetId.value = id;
        window.location.reload();
      })
      .map(() => undefined);
  }

  watchEffect(() => {
    // Track auth state, token updates, and online status so init() retries while doc is null
    const canInitialize =
      authStore.isLoggedIn && isOnline.value && authStore.accessToken !== undefined;
    if (!doc.value && !needsSpreadsheetChoice.value && canInitialize) {
      console.debug("User has logged in - initializing spreadsheet");
      void init();
    }
  });

  const spreadsheetUrl = computed<string | null>(() => {
    if (!doc.value?.spreadsheetId) return null;
    return `https://docs.google.com/spreadsheets/d/${doc.value.spreadsheetId}/edit`;
  });

  const activeSpreadsheetId = computed<string | null>(
    () => doc.value?.spreadsheetId ?? (linkedSpreadsheetId.value?.trim() || null),
  );

  function clearLinkedSpreadsheet(): void {
    linkedSpreadsheetId.value = null;
    clearSpreadsheetSessionState();
  }

  function trashActiveSpreadsheet(): ResultAsync<
    void,
    SpreadsheetTrashError | "missing-access-token"
  > {
    if (!activeSpreadsheetId.value) {
      clearLinkedSpreadsheet();
      return okAsync(undefined);
    }

    return new ResultAsync(
      mutex.runExclusive(
        async (): Promise<Result<void, SpreadsheetTrashError | "missing-access-token">> => {
          const targetId = activeSpreadsheetId.value;
          if (!targetId) {
            clearLinkedSpreadsheet();
            return ok(undefined);
          }

          const token = authStore.isLoggedIn ? await resolveValidToken() : null;
          if (!token) {
            return err("missing-access-token");
          }

          return runWithAuthRetry("spreadsheet-trash", token, (validToken) =>
            trashSpreadsheet(targetId, validToken),
          ).andTee(() => {
            clearLinkedSpreadsheet();
          });
        },
      ),
    );
  }

  function openInBrowser() {
    if (spreadsheetUrl.value) {
      window.open(spreadsheetUrl.value, "_blank");
    }
  }

  return {
    isLoading,
    isPickerOpen,
    needsSpreadsheetChoice,
    createdSpreadsheetId,
    doc,
    activeSpreadsheetId,
    spreadsheetUrl,
    openInBrowser,
    init,
    createNewSpreadsheet,
    linkExistingSpreadsheet,
    switchSpreadsheet,
    clearLinkedSpreadsheet,
    trashActiveSpreadsheet,
  };
});
