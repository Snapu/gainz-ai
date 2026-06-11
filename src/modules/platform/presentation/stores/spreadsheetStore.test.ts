import type { GoogleSpreadsheet } from "google-spreadsheet";
import { errAsync, okAsync } from "neverthrow";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as spreadsheetService from "@/modules/platform/infrastructure/spreadsheets";
import { useSpreadsheetStore } from "./spreadsheetStore";

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

vi.mock("@/modules/auth/presentation", () => ({
  useAuthStore: () => ({
    accessToken: "test-token",
    isLoggedIn: true,
  }),
}));

describe("useSpreadsheetStore", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
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
});
