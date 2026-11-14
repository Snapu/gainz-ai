import type { GoogleSpreadsheet } from "google-spreadsheet";
import { errAsync, okAsync, type ResultAsync } from "neverthrow";
import { createPinia, type Pinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick, ref } from "vue";
import * as spreadsheetService from "@/modules/platform/infrastructure/spreadsheets";
import { useSpreadsheetStore } from "./spreadsheetStore";

const mockAccessToken = ref<string | null>("test-token");
const mockIsLoggedIn = ref(true);
const defaultEnsureValidAccessToken = (): ResultAsync<string, string> =>
  mockAccessToken.value ? okAsync(mockAccessToken.value) : errAsync("token-refresh-failed");
const mockEnsureValidAccessToken = vi.fn(defaultEnsureValidAccessToken);
const mockRefreshSession = vi.fn(() => okAsync("refreshed-token"));
const mockRefreshToken: string | null = "refresh-token";

vi.mock("@/modules/platform/infrastructure/spreadsheets", () => ({
  SPREADSHEET_NAME: "Test Spreadsheet",
  getSpreadsheetId: vi.fn(),
  loadSpreadsheet: vi.fn(),
  createSpreadsheet: vi.fn(),
}));

vi.mock("@sentry/vue", () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}));

vi.mock("@/modules/auth/presentation/stores/authStore", () => ({
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
    ensureValidAccessToken: () => mockEnsureValidAccessToken(),
    refreshSession: () => mockRefreshSession(),
    logout: vi.fn(),
  }),
}));

describe("useSpreadsheetStore", () => {
  let pinia: Pinia;

  beforeEach(() => {
    pinia = createPinia();
    setActivePinia(pinia);
    vi.clearAllMocks();
    mockAccessToken.value = "test-token";
    mockIsLoggedIn.value = true;
    mockEnsureValidAccessToken.mockImplementation(defaultEnsureValidAccessToken);
  });

  afterEach(() => {
    (pinia as unknown as { _e?: { stop?: () => void } })._e?.stop?.();
    vi.restoreAllMocks();
  });

  it("should prevent concurrent initializations and redundant creations", async () => {
    const store = useSpreadsheetStore();

    let getSpreadsheetIdCalls = 0;
    vi.mocked(spreadsheetService.getSpreadsheetId).mockImplementation(() => {
      getSpreadsheetIdCalls++;
      return okAsync(null);
    });

    vi.mocked(spreadsheetService.createSpreadsheet).mockImplementation(() => {
      return okAsync({
        spreadsheetId: "new-id",
        loadInfo: vi.fn(),
      } as unknown as GoogleSpreadsheet);
    });

    // Trigger multiple initializations concurrently
    // Note: in the store, watchEffect also calls init, but here we call it manually
    const p1 = store.init("token1");
    const p2 = store.init("token1");
    const p3 = store.init("token1");

    await Promise.all([p1, p2, p3]);

    // Should only call getSpreadsheetId once because of the mutex and doc.value check
    expect(getSpreadsheetIdCalls).toBe(1);
    expect(spreadsheetService.createSpreadsheet).toHaveBeenCalledTimes(1);
    expect(store.doc).not.toBeNull();
  });

  it("should not create spreadsheet if getSpreadsheetId fails with an error", async () => {
    const store = useSpreadsheetStore();

    vi.mocked(spreadsheetService.getSpreadsheetId).mockReturnValue(
      errAsync("get-spreadsheet-id-failed"),
    );

    await store.init("token1");

    expect(spreadsheetService.createSpreadsheet).not.toHaveBeenCalled();
    expect(store.doc).toBeNull();
  });

  it("re-runs init when authStore.accessToken arrives while doc is still null", async () => {
    mockAccessToken.value = null;
    mockIsLoggedIn.value = true;
    vi.mocked(spreadsheetService.getSpreadsheetId).mockReturnValue(okAsync("existing-id"));
    vi.mocked(spreadsheetService.loadSpreadsheet).mockReturnValue(
      okAsync({
        spreadsheetId: "existing-id",
        loadInfo: vi.fn(),
      } as unknown as GoogleSpreadsheet),
    );

    const store = useSpreadsheetStore();
    await vi.waitFor(() => {
      expect(mockEnsureValidAccessToken).toHaveBeenCalledTimes(1);
    });
    expect(spreadsheetService.getSpreadsheetId).not.toHaveBeenCalled();
    expect(store.doc).toBeNull();

    mockAccessToken.value = "recovered-token";
    await nextTick();
    await vi.waitFor(() => {
      expect(store.doc).not.toBeNull();
    });

    expect(spreadsheetService.getSpreadsheetId).toHaveBeenCalledTimes(1);
    expect(spreadsheetService.getSpreadsheetId).toHaveBeenCalledWith(
      "Test Spreadsheet",
      "recovered-token",
    );
  });

  it("retries init automatically when browser transitions from offline to online while doc is null", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    window.dispatchEvent(new Event("offline"));

    vi.mocked(spreadsheetService.getSpreadsheetId).mockReturnValue(okAsync("existing-id"));
    vi.mocked(spreadsheetService.loadSpreadsheet).mockReturnValue(
      okAsync({
        spreadsheetId: "existing-id",
        loadInfo: vi.fn(),
      } as unknown as GoogleSpreadsheet),
    );

    const store = useSpreadsheetStore();
    await nextTick();
    expect(spreadsheetService.getSpreadsheetId).not.toHaveBeenCalled();
    expect(store.doc).toBeNull();

    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    window.dispatchEvent(new Event("online"));
    await vi.waitFor(() => {
      expect(store.doc).not.toBeNull();
    });

    expect(spreadsheetService.getSpreadsheetId).toHaveBeenCalledTimes(1);
  });

  it("awaits auth recovery and retries init once when initialization fails with auth-failed", async () => {
    mockRefreshSession.mockImplementationOnce(() => {
      mockAccessToken.value = "recovered-init-token";
      return okAsync("recovered-init-token");
    });
    vi.mocked(spreadsheetService.getSpreadsheetId)
      .mockReturnValueOnce(errAsync("auth-failed"))
      .mockReturnValueOnce(okAsync("recovered-sheet-id"));
    vi.mocked(spreadsheetService.loadSpreadsheet).mockReturnValueOnce(
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
    expect(spreadsheetService.getSpreadsheetId).toHaveBeenCalledTimes(2);
    expect(spreadsheetService.getSpreadsheetId).toHaveBeenLastCalledWith(
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
      vi.mocked(spreadsheetService.getSpreadsheetId)
        .mockReturnValueOnce(errAsync("auth-failed"))
        .mockReturnValueOnce(errAsync("auth-failed"))
        .mockReturnValueOnce(okAsync("recovered-sheet-id"));
      vi.mocked(spreadsheetService.loadSpreadsheet).mockReturnValueOnce(
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
});
