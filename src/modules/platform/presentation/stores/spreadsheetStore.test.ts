import type { GoogleSpreadsheet } from "google-spreadsheet";
import { errAsync, ok, okAsync, type Result, ResultAsync } from "neverthrow";
import { createPinia, type Pinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick, ref } from "vue";
import * as platformInfra from "@/modules/platform/infrastructure";
import { useSpreadsheetStore } from "./spreadsheetStore";

const LINKED_SPREADSHEET_STORAGE_KEY = "gainz:linkedSpreadsheetId";

const mockAccessToken = ref<string | null>("test-token");
const mockIsLoggedIn = ref(true);
const defaultEnsureValidAccessToken = (): ResultAsync<string, string> =>
  mockAccessToken.value ? okAsync(mockAccessToken.value) : errAsync("token-refresh-failed");
const mockEnsureValidAccessToken = vi.fn(defaultEnsureValidAccessToken);
const mockRefreshSession = vi.fn(() => okAsync("refreshed-token"));
const mockAuthInit = vi.fn(() => Promise.resolve());
const mockRefreshToken: string | null = "refresh-token";

vi.mock("@/modules/platform/infrastructure", () => ({
  SPREADSHEET_NAME: "Test Spreadsheet",
  getSpreadsheetId: vi.fn(),
  loadSpreadsheet: vi.fn(),
  createSpreadsheet: vi.fn(),
  pickSpreadsheetId: vi.fn(),
  trashSpreadsheet: vi.fn(),
}));

vi.mock("@sentry/vue", () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}));

vi.mock("@/modules/auth/presentation/stores/authStore", () => ({
  CLIENT_ID: "804592774481-testclient.apps.googleusercontent.com",
  useAuthStore: () => ({
    get accessToken() {
      return mockAccessToken.value;
    },
    get isLoggedIn() {
      return mockIsLoggedIn.value;
    },
    get refreshToken() {
      return mockRefreshToken;
    },
    init: () => mockAuthInit(),
    ensureValidAccessToken: () => mockEnsureValidAccessToken(),
    refreshSession: () => mockRefreshSession(),
    logout: vi.fn(),
  }),
}));

describe("useSpreadsheetStore", () => {
  let pinia: Pinia;

  beforeEach(() => {
    localStorage.clear();
    pinia = createPinia();
    setActivePinia(pinia);
    vi.clearAllMocks();
    mockAccessToken.value = "test-token";
    mockIsLoggedIn.value = true;
    mockEnsureValidAccessToken.mockImplementation(defaultEnsureValidAccessToken);
    mockAuthInit.mockImplementation(() => Promise.resolve());
    vi.mocked(platformInfra.getSpreadsheetId).mockReturnValue(
      errAsync("get-spreadsheet-id-failed"),
    );
  });

  afterEach(() => {
    (pinia as unknown as { _e?: { stop?: () => void } })._e?.stop?.();
    vi.restoreAllMocks();
  });

  it("prevents concurrent initializations and enters choice state without auto-creating when no sheet is visible", async () => {
    const store = useSpreadsheetStore();

    let getSpreadsheetIdCalls = 0;
    vi.mocked(platformInfra.getSpreadsheetId).mockImplementation(() => {
      getSpreadsheetIdCalls++;
      return okAsync(null);
    });

    const p1 = store.init("token1");
    const p2 = store.init("token1");
    const p3 = store.init("token1");

    await Promise.all([p1, p2, p3]);

    expect(getSpreadsheetIdCalls).toBe(1);
    expect(platformInfra.createSpreadsheet).not.toHaveBeenCalled();
    expect(store.doc).toBeNull();
    expect(store.needsSpreadsheetChoice).toBe(true);
    expect(store.isLoading).toBe(false);
  });

  it("should not create spreadsheet or enter choice state if getSpreadsheetId fails with an error", async () => {
    const store = useSpreadsheetStore();

    mockAuthInit.mockImplementation(() => Promise.resolve());
    vi.mocked(platformInfra.getSpreadsheetId).mockReturnValue(
      errAsync("get-spreadsheet-id-failed"),
    );

    await store.init("token1");

    expect(platformInfra.createSpreadsheet).not.toHaveBeenCalled();
    expect(store.doc).toBeNull();
    expect(store.needsSpreadsheetChoice).toBe(false);
  });

  it("re-runs init when authStore.accessToken arrives while doc is still null", async () => {
    mockAccessToken.value = null;
    mockIsLoggedIn.value = true;
    vi.mocked(platformInfra.getSpreadsheetId).mockReturnValue(okAsync("existing-id"));
    vi.mocked(platformInfra.loadSpreadsheet).mockReturnValue(
      okAsync({
        spreadsheetId: "existing-id",
        loadInfo: vi.fn(),
      } as unknown as GoogleSpreadsheet),
    );

    const store = useSpreadsheetStore();
    await vi.waitFor(() => {
      expect(mockEnsureValidAccessToken).toHaveBeenCalledTimes(1);
    });
    expect(platformInfra.getSpreadsheetId).not.toHaveBeenCalled();
    expect(store.doc).toBeNull();

    mockAccessToken.value = "recovered-token";
    await nextTick();
    await vi.waitFor(() => {
      expect(store.doc).not.toBeNull();
    });

    expect(platformInfra.getSpreadsheetId).toHaveBeenCalledTimes(1);
    expect(platformInfra.getSpreadsheetId).toHaveBeenCalledWith(
      "Test Spreadsheet",
      "recovered-token",
    );
  });

  it("retries init automatically when browser transitions from offline to online while doc is null", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    window.dispatchEvent(new Event("offline"));

    vi.mocked(platformInfra.getSpreadsheetId).mockReturnValue(okAsync("existing-id"));
    vi.mocked(platformInfra.loadSpreadsheet).mockReturnValue(
      okAsync({
        spreadsheetId: "existing-id",
        loadInfo: vi.fn(),
      } as unknown as GoogleSpreadsheet),
    );

    const store = useSpreadsheetStore();
    await nextTick();
    expect(platformInfra.getSpreadsheetId).not.toHaveBeenCalled();
    expect(store.doc).toBeNull();

    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    window.dispatchEvent(new Event("online"));
    await vi.waitFor(() => {
      expect(store.doc).not.toBeNull();
    });

    expect(platformInfra.getSpreadsheetId).toHaveBeenCalledTimes(1);
  });

  it("awaits auth recovery and retries init once when initialization fails with auth-failed", async () => {
    mockRefreshSession.mockImplementationOnce(() => {
      mockAccessToken.value = "recovered-init-token";
      return okAsync("recovered-init-token");
    });
    vi.mocked(platformInfra.getSpreadsheetId)
      .mockReturnValueOnce(errAsync("auth-failed"))
      .mockReturnValueOnce(okAsync("recovered-sheet-id"));
    vi.mocked(platformInfra.loadSpreadsheet).mockReturnValueOnce(
      okAsync({
        spreadsheetId: "recovered-sheet-id",
        loadInfo: vi.fn(),
      } as unknown as GoogleSpreadsheet),
    );

    const store = useSpreadsheetStore();
    await vi.waitFor(() => {
      expect(store.doc).not.toBeNull();
    });

    expect(mockRefreshSession).toHaveBeenCalledOnce();
    expect(platformInfra.getSpreadsheetId).toHaveBeenCalledTimes(2);
    expect(platformInfra.getSpreadsheetId).toHaveBeenLastCalledWith(
      "Test Spreadsheet",
      "recovered-init-token",
    );
  });

  it("schedules a backoff retry when transient auth refresh fails while online", async () => {
    vi.useFakeTimers();
    try {
      mockRefreshSession
        .mockReturnValueOnce(
          errAsync("token-refresh-failed") as unknown as ReturnType<typeof mockRefreshSession>,
        )
        .mockImplementationOnce(() => {
          mockAccessToken.value = "eventual-token";
          return okAsync("eventual-token");
        });
      vi.mocked(platformInfra.getSpreadsheetId)
        .mockReturnValueOnce(errAsync("auth-failed"))
        .mockReturnValueOnce(errAsync("auth-failed"))
        .mockReturnValueOnce(okAsync("recovered-sheet-id"));
      vi.mocked(platformInfra.loadSpreadsheet).mockReturnValueOnce(
        okAsync({
          spreadsheetId: "recovered-sheet-id",
          loadInfo: vi.fn(),
        } as unknown as GoogleSpreadsheet),
      );

      const store = useSpreadsheetStore();
      await vi.waitFor(() => expect(mockRefreshSession).toHaveBeenCalledTimes(1));
      expect(store.doc).toBeNull();

      await vi.advanceTimersByTimeAsync(5_000);
      await vi.waitFor(() => expect(store.doc).not.toBeNull());
      expect(mockRefreshSession).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("loads a saved linkedSpreadsheetId directly on init without calling getSpreadsheetId", async () => {
    localStorage.setItem(LINKED_SPREADSHEET_STORAGE_KEY, "saved-sheet-99");
    vi.mocked(platformInfra.loadSpreadsheet).mockReturnValueOnce(
      okAsync({
        spreadsheetId: "saved-sheet-99",
        loadInfo: vi.fn(),
      } as unknown as GoogleSpreadsheet),
    );

    const store = useSpreadsheetStore();
    await vi.waitFor(() => {
      expect(store.doc?.spreadsheetId).toBe("saved-sheet-99");
    });

    expect(platformInfra.getSpreadsheetId).not.toHaveBeenCalled();
    expect(platformInfra.loadSpreadsheet).toHaveBeenCalledWith("saved-sheet-99", "test-token");
    expect(store.needsSpreadsheetChoice).toBe(false);
  });

  it("clears saved linkedSpreadsheetId and falls back to name lookup on not-found (404) or forbidden (403)", async () => {
    localStorage.setItem(LINKED_SPREADSHEET_STORAGE_KEY, "deleted-sheet-id");
    vi.mocked(platformInfra.loadSpreadsheet).mockReturnValueOnce(errAsync("not-found"));
    vi.mocked(platformInfra.getSpreadsheetId).mockReturnValueOnce(okAsync(null));

    const store = useSpreadsheetStore();
    await vi.waitFor(() => {
      expect(store.needsSpreadsheetChoice).toBe(true);
    });

    expect(localStorage.getItem(LINKED_SPREADSHEET_STORAGE_KEY)).toBeNull();
    expect(platformInfra.getSpreadsheetId).toHaveBeenCalledWith("Test Spreadsheet", "test-token");
    expect(store.doc).toBeNull();
  });

  it("clears saved linkedSpreadsheetId and falls back without triggering auth recovery on forbidden (403)", async () => {
    localStorage.setItem(LINKED_SPREADSHEET_STORAGE_KEY, "other-account-sheet-id");
    vi.mocked(platformInfra.loadSpreadsheet).mockReturnValueOnce(errAsync("forbidden"));
    vi.mocked(platformInfra.getSpreadsheetId).mockReturnValueOnce(okAsync("default-sheet-2"));
    vi.mocked(platformInfra.loadSpreadsheet).mockReturnValueOnce(
      okAsync({
        spreadsheetId: "default-sheet-2",
        loadInfo: vi.fn(),
      } as unknown as GoogleSpreadsheet),
    );

    const store = useSpreadsheetStore();
    await vi.waitFor(() => {
      expect(store.doc?.spreadsheetId).toBe("default-sheet-2");
    });

    expect(mockRefreshSession).not.toHaveBeenCalled();
    expect(localStorage.getItem(LINKED_SPREADSHEET_STORAGE_KEY)).toBe("default-sheet-2");
  });

  it("preserves saved linkedSpreadsheetId when loadSpreadsheet fails transiently", async () => {
    localStorage.setItem(LINKED_SPREADSHEET_STORAGE_KEY, "saved-sheet-99");
    vi.mocked(platformInfra.loadSpreadsheet).mockReturnValue(errAsync("load-spreadsheet-failed"));

    const store = useSpreadsheetStore();
    await vi.waitFor(() => {
      expect(platformInfra.loadSpreadsheet).toHaveBeenCalled();
    });

    expect(localStorage.getItem(LINKED_SPREADSHEET_STORAGE_KEY)).toBe("saved-sheet-99");
    expect(store.needsSpreadsheetChoice).toBe(false);
    expect(store.doc).toBeNull();
  });

  it("createNewSpreadsheet creates a sheet, persists linkedSpreadsheetId, and clears choice state", async () => {
    vi.mocked(platformInfra.getSpreadsheetId).mockReturnValueOnce(okAsync(null));
    vi.mocked(platformInfra.createSpreadsheet).mockReturnValueOnce(
      okAsync({
        spreadsheetId: "created-sheet-1",
        loadInfo: vi.fn(),
      } as unknown as GoogleSpreadsheet),
    );

    const store = useSpreadsheetStore();
    await vi.waitFor(() => expect(store.needsSpreadsheetChoice).toBe(true));

    const result = await store.createNewSpreadsheet();

    expect(result.isOk()).toBe(true);
    expect(store.doc?.spreadsheetId).toBe("created-sheet-1");
    expect(store.createdSpreadsheetId).toBe("created-sheet-1");
    expect(store.needsSpreadsheetChoice).toBe(false);
    expect(localStorage.getItem(LINKED_SPREADSHEET_STORAGE_KEY)).toBe("created-sheet-1");
  });

  it("leaves createdSpreadsheetId null when createNewSpreadsheet fails", async () => {
    vi.mocked(platformInfra.getSpreadsheetId).mockReturnValueOnce(okAsync(null));
    vi.mocked(platformInfra.createSpreadsheet).mockReturnValueOnce(
      errAsync("create-spreadsheet-failed"),
    );

    const store = useSpreadsheetStore();
    await vi.waitFor(() => expect(store.needsSpreadsheetChoice).toBe(true));

    const result = await store.createNewSpreadsheet();

    expect(result.isErr()).toBe(true);
    expect(store.doc).toBeNull();
    expect(store.createdSpreadsheetId).toBeNull();
  });

  it("linkExistingSpreadsheet opens Google Picker, loads picked sheet with auth retry, and persists its ID", async () => {
    vi.mocked(platformInfra.getSpreadsheetId).mockReturnValueOnce(okAsync(null));
    vi.mocked(platformInfra.pickSpreadsheetId).mockReturnValueOnce(okAsync("picked-sheet-7"));
    mockRefreshSession.mockImplementationOnce(() => {
      mockAccessToken.value = "refreshed-picker-token";
      return okAsync("refreshed-picker-token");
    });
    vi.mocked(platformInfra.loadSpreadsheet)
      .mockReturnValueOnce(errAsync("auth-failed"))
      .mockReturnValueOnce(
        okAsync({
          spreadsheetId: "picked-sheet-7",
          loadInfo: vi.fn(),
        } as unknown as GoogleSpreadsheet),
      );

    const store = useSpreadsheetStore();
    await vi.waitFor(() => expect(store.needsSpreadsheetChoice).toBe(true));

    const result = await store.linkExistingSpreadsheet();

    expect(result.isOk()).toBe(true);
    expect(platformInfra.pickSpreadsheetId).toHaveBeenCalledWith(
      expect.objectContaining({
        accessToken: "test-token",
        clientId: "804592774481-testclient.apps.googleusercontent.com",
      }),
    );
    expect(platformInfra.loadSpreadsheet).toHaveBeenLastCalledWith(
      "picked-sheet-7",
      "refreshed-picker-token",
    );
    expect(store.doc?.spreadsheetId).toBe("picked-sheet-7");
    expect(store.needsSpreadsheetChoice).toBe(false);
    expect(localStorage.getItem(LINKED_SPREADSHEET_STORAGE_KEY)).toBe("picked-sheet-7");
  });

  it("keeps current doc untouched when cancelling Google Picker before a sheet is loaded", async () => {
    vi.mocked(platformInfra.getSpreadsheetId).mockReturnValueOnce(okAsync(null));
    vi.mocked(platformInfra.pickSpreadsheetId).mockReturnValueOnce(errAsync("picker-cancelled"));

    const store = useSpreadsheetStore();
    await vi.waitFor(() => expect(store.needsSpreadsheetChoice).toBe(true));

    const result = await store.linkExistingSpreadsheet();

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toBe("picker-cancelled");
    expect(store.doc).toBeNull();
    expect(store.needsSpreadsheetChoice).toBe(true);
    expect(localStorage.getItem(LINKED_SPREADSHEET_STORAGE_KEY)).toBeNull();
  });

  it("clears active doc and choice state on token expiry while preserving linkedSpreadsheetId", async () => {
    vi.mocked(platformInfra.getSpreadsheetId).mockReturnValueOnce(okAsync(null));
    const store = useSpreadsheetStore();
    await vi.waitFor(() => expect(store.needsSpreadsheetChoice).toBe(true));

    vi.mocked(platformInfra.createSpreadsheet).mockReturnValueOnce(
      okAsync({
        spreadsheetId: "custom-linked-sheet",
        loadInfo: vi.fn(),
      } as unknown as GoogleSpreadsheet),
    );
    await store.createNewSpreadsheet();
    expect(localStorage.getItem(LINKED_SPREADSHEET_STORAGE_KEY)).toBe("custom-linked-sheet");

    mockIsLoggedIn.value = false;
    await nextTick();

    expect(store.needsSpreadsheetChoice).toBe(false);
    expect(store.doc).toBeNull();
    expect(localStorage.getItem(LINKED_SPREADSHEET_STORAGE_KEY)).toBe("custom-linked-sheet");
  });

  it("preserves linkedSpreadsheetId across cold unauthenticated boot after 1-hour Web token expiry", async () => {
    localStorage.setItem(LINKED_SPREADSHEET_STORAGE_KEY, "custom-linked-sheet");
    mockIsLoggedIn.value = false;

    const store = useSpreadsheetStore();
    await Promise.resolve();
    await Promise.resolve();

    expect(store.doc).toBeNull();
    expect(store.needsSpreadsheetChoice).toBe(false);
    expect(localStorage.getItem(LINKED_SPREADSHEET_STORAGE_KEY)).toBe("custom-linked-sheet");
  });

  it("reloads saved linkedSpreadsheetId cleanly once async token hydration completes", async () => {
    localStorage.setItem(LINKED_SPREADSHEET_STORAGE_KEY, "capacitor-saved-sheet");
    mockIsLoggedIn.value = false;
    mockAccessToken.value = null;

    vi.mocked(platformInfra.loadSpreadsheet).mockReturnValueOnce(
      okAsync({
        spreadsheetId: "capacitor-saved-sheet",
        loadInfo: vi.fn(),
      } as unknown as GoogleSpreadsheet),
    );

    const store = useSpreadsheetStore();
    await nextTick();
    expect(localStorage.getItem(LINKED_SPREADSHEET_STORAGE_KEY)).toBe("capacitor-saved-sheet");

    mockIsLoggedIn.value = true;
    mockAccessToken.value = "hydrated-native-token";
    await vi.waitFor(() => {
      expect(store.doc?.spreadsheetId).toBe("capacitor-saved-sheet");
    });
    expect(localStorage.getItem(LINKED_SPREADSHEET_STORAGE_KEY)).toBe("capacitor-saved-sheet");
  });

  it("does not resurrect doc or linkedSpreadsheetId when user logs out mid-load or aborts open picker", async () => {
    type LoadResult = Result<
      GoogleSpreadsheet,
      "load-spreadsheet-failed" | "not-found" | "forbidden" | "auth-failed"
    >;
    let resolveLoad!: (result: LoadResult) => void;
    vi.mocked(platformInfra.getSpreadsheetId).mockReturnValueOnce(okAsync("in-flight-id"));
    vi.mocked(platformInfra.loadSpreadsheet).mockImplementationOnce(
      () =>
        new ResultAsync(
          new Promise<LoadResult>((resolve) => {
            resolveLoad = resolve;
          }),
        ),
    );

    const store = useSpreadsheetStore();
    await vi.waitFor(() => expect(platformInfra.loadSpreadsheet).toHaveBeenCalled());

    mockIsLoggedIn.value = false;
    await nextTick();

    resolveLoad(
      ok({ spreadsheetId: "in-flight-id", loadInfo: vi.fn() } as unknown as GoogleSpreadsheet),
    );
    await Promise.resolve();
    await nextTick();

    expect(store.doc).toBeNull();
    expect(localStorage.getItem(LINKED_SPREADSHEET_STORAGE_KEY)).toBeNull();

    // Now test logging out while Google Picker is open releases mutex via AbortSignal
    mockIsLoggedIn.value = true;
    await nextTick();
    let capturedSignal: AbortSignal | undefined;
    vi.mocked(platformInfra.pickSpreadsheetId).mockImplementationOnce((({
      signal,
    }: {
      signal?: AbortSignal;
    }) => {
      capturedSignal = signal;
      return new Promise((resolve) => {
        signal?.addEventListener("abort", () => {
          resolve(errAsync("picker-cancelled"));
        });
      });
    }) as unknown as typeof platformInfra.pickSpreadsheetId);

    const linkPromise = store.linkExistingSpreadsheet();
    await vi.waitFor(() => expect(store.isPickerOpen).toBe(true));
    expect(capturedSignal?.aborted).toBe(false);

    mockIsLoggedIn.value = false;
    const linkResult = await linkPromise;

    expect(capturedSignal?.aborted).toBe(true);
    expect(linkResult.isErr()).toBe(true);
    expect(linkResult._unsafeUnwrapErr()).toBe("picker-cancelled");
    expect(store.isPickerOpen).toBe(false);
  });

  it("does not reopen picker or create another sheet once a spreadsheet is already connected", async () => {
    const initialDoc = {
      spreadsheetId: "active-sheet-1",
      loadInfo: vi.fn(),
    } as unknown as GoogleSpreadsheet;
    vi.mocked(platformInfra.getSpreadsheetId).mockReturnValueOnce(okAsync("active-sheet-1"));
    vi.mocked(platformInfra.loadSpreadsheet).mockReturnValueOnce(okAsync(initialDoc));

    const store = useSpreadsheetStore();
    await vi.waitFor(() => expect(store.doc).toBe(initialDoc));

    const linkResult = await store.linkExistingSpreadsheet();
    const createResult = await store.createNewSpreadsheet();

    expect(linkResult.isOk()).toBe(true);
    expect(createResult.isOk()).toBe(true);
    expect(platformInfra.pickSpreadsheetId).not.toHaveBeenCalled();
    expect(platformInfra.createSpreadsheet).not.toHaveBeenCalled();
    expect(store.doc).toBe(initialDoc);
  });

  it("trashActiveSpreadsheet trashes active spreadsheet via Drive API and clears linked state", async () => {
    const initialDoc = {
      spreadsheetId: "active-sheet-1",
      loadInfo: vi.fn(),
    } as unknown as GoogleSpreadsheet;
    vi.mocked(platformInfra.getSpreadsheetId).mockReturnValueOnce(okAsync("active-sheet-1"));
    vi.mocked(platformInfra.loadSpreadsheet).mockReturnValueOnce(okAsync(initialDoc));
    vi.mocked(platformInfra.trashSpreadsheet).mockReturnValueOnce(okAsync(undefined));

    const store = useSpreadsheetStore();
    await vi.waitFor(() => expect(store.doc).toBe(initialDoc));
    expect(store.activeSpreadsheetId).toBe("active-sheet-1");

    const result = await store.trashActiveSpreadsheet();

    expect(result.isOk()).toBe(true);
    expect(platformInfra.trashSpreadsheet).toHaveBeenCalledWith("active-sheet-1", "test-token");
    expect(store.doc).toBeNull();
    expect(store.activeSpreadsheetId).toBeNull();
    expect(localStorage.getItem(LINKED_SPREADSHEET_STORAGE_KEY)).toBeNull();
  });

  it("trashActiveSpreadsheet resolves cleanly when no spreadsheet is linked and preserves link on failure", async () => {
    const store = useSpreadsheetStore();
    const emptyResult = await store.trashActiveSpreadsheet();
    expect(emptyResult.isOk()).toBe(true);
    expect(platformInfra.trashSpreadsheet).not.toHaveBeenCalled();

    localStorage.setItem(LINKED_SPREADSHEET_STORAGE_KEY, "persisted-sheet-9");
    vi.mocked(platformInfra.trashSpreadsheet).mockReturnValueOnce(errAsync("forbidden"));

    // Create fresh store reading linkedSpreadsheetId from localStorage
    setActivePinia(createPinia());
    const linkedStore = useSpreadsheetStore();
    expect(linkedStore.activeSpreadsheetId).toBe("persisted-sheet-9");

    const failResult = await linkedStore.trashActiveSpreadsheet();

    expect(failResult.isErr()).toBe(true);
    expect(failResult._unsafeUnwrapErr()).toBe("forbidden");
    expect(localStorage.getItem(LINKED_SPREADSHEET_STORAGE_KEY)).toBe("persisted-sheet-9");
  });

  it("switchSpreadsheet saves chosen spreadsheet ID and reloads when switching to a different sheet", async () => {
    const initialDoc = {
      spreadsheetId: "active-sheet-1",
      loadInfo: vi.fn(),
    } as unknown as GoogleSpreadsheet;
    vi.mocked(platformInfra.getSpreadsheetId).mockReturnValueOnce(okAsync("active-sheet-1"));
    vi.mocked(platformInfra.loadSpreadsheet).mockReturnValueOnce(okAsync(initialDoc));

    const reloadMock = vi.fn();
    vi.stubGlobal("location", { ...window.location, reload: reloadMock });

    const store = useSpreadsheetStore();
    await vi.waitFor(() => expect(store.doc).toBe(initialDoc));

    // Selecting the already-active sheet is a no-op
    vi.mocked(platformInfra.pickSpreadsheetId).mockReturnValueOnce(okAsync("active-sheet-1"));
    const sameResult = await store.switchSpreadsheet();
    expect(sameResult.isOk()).toBe(true);
    expect(reloadMock).not.toHaveBeenCalled();

    // Selecting a different sheet writes linkedSpreadsheetId and reloads
    vi.mocked(platformInfra.pickSpreadsheetId).mockReturnValueOnce(okAsync("switched-sheet-2"));
    const switchResult = await store.switchSpreadsheet();
    expect(switchResult.isOk()).toBe(true);
    expect(localStorage.getItem(LINKED_SPREADSHEET_STORAGE_KEY)).toBe("switched-sheet-2");
    expect(reloadMock).toHaveBeenCalledTimes(1);

    vi.unstubAllGlobals();
  });
});
