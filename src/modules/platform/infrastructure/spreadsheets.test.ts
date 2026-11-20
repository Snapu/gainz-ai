import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createSpreadsheet,
  ensureSheetHeaders,
  findSheet,
  getOrCreateSheet,
  getSpreadsheetId,
  loadSpreadsheet,
  SPREADSHEET_NAME,
} from "@/modules/platform/infrastructure/spreadsheets";

describe("spreadsheets", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getSpreadsheetId", () => {
    it("should expose a ResultAsync contract for chaining", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          files: [{ id: "spreadsheet-123", modifiedTime: "2024-03-15T10:00:00Z" }],
        }),
      });

      const result = getSpreadsheetId(SPREADSHEET_NAME, "access-token");

      expect(typeof result.andThen).toBe("function");
      await expect(
        result.match(
          (value) => value,
          () => null,
        ),
      ).resolves.toBe("spreadsheet-123");
    });

    it("should return spreadsheet id when found", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          files: [{ id: "spreadsheet-123", modifiedTime: "2024-03-15T10:00:00Z" }],
        }),
      });

      const result = await getSpreadsheetId(SPREADSHEET_NAME, "access-token");

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toBe("spreadsheet-123");
      }
    });

    it("should return null when no spreadsheet found", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ files: [] }),
      });

      const result = await getSpreadsheetId(SPREADSHEET_NAME, "access-token");

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toBeNull();
      }
    });

    it("should return auth-failed when fetch returns 401", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
      });

      const result = await getSpreadsheetId(SPREADSHEET_NAME, "access-token");

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error).toBe("auth-failed");
      }
    });

    it("should return auth-failed when fetch returns 403", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
      });

      const result = await getSpreadsheetId(SPREADSHEET_NAME, "access-token");

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error).toBe("auth-failed");
      }
    });
  });

  describe("loadSpreadsheet", () => {
    it("should return auth-failed when google-spreadsheet throws 401", async () => {
      const error = new Error("Unauthorized");
      // @ts-expect-error - Adding response property for mock
      error.response = { status: 401 };

      const { GoogleSpreadsheet } = await import("google-spreadsheet");
      vi.spyOn(GoogleSpreadsheet.prototype, "loadInfo").mockRejectedValue(error);

      const result = await loadSpreadsheet("spreadsheet-123", "access-token");

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error).toBe("auth-failed");
      }
    });

    it("should return forbidden when google-spreadsheet throws 403", async () => {
      const error = new Error("Forbidden");
      // @ts-expect-error - Adding response property for mock
      error.response = { status: 403 };

      const { GoogleSpreadsheet } = await import("google-spreadsheet");
      vi.spyOn(GoogleSpreadsheet.prototype, "loadInfo").mockRejectedValue(error);

      const result = await loadSpreadsheet("spreadsheet-123", "access-token");

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error).toBe("forbidden");
      }
    });

    it("should return not-found when google-spreadsheet throws 404", async () => {
      const error = new Error("Not Found");
      // @ts-expect-error - Adding response property for mock
      error.response = { status: 404 };

      const { GoogleSpreadsheet } = await import("google-spreadsheet");
      vi.spyOn(GoogleSpreadsheet.prototype, "loadInfo").mockRejectedValue(error);

      const result = await loadSpreadsheet("spreadsheet-123", "access-token");

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error).toBe("not-found");
      }
    });

    it("should return load-spreadsheet-failed for non-auth errors", async () => {
      const error = new Error("Network error");

      const { GoogleSpreadsheet } = await import("google-spreadsheet");
      vi.spyOn(GoogleSpreadsheet.prototype, "loadInfo").mockRejectedValue(error);

      const result = await loadSpreadsheet("spreadsheet-123", "access-token");

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error).toBe("load-spreadsheet-failed");
      }
    });
  });

  describe("createSpreadsheet", () => {
    it("should return auth-failed when google-spreadsheet throws 401", async () => {
      const error = new Error("Unauthorized");
      // @ts-expect-error - Adding response property for mock
      error.response = { status: 401 };

      const { GoogleSpreadsheet } = await import("google-spreadsheet");
      vi.spyOn(GoogleSpreadsheet, "createNewSpreadsheetDocument").mockRejectedValue(error);

      const result = await createSpreadsheet(SPREADSHEET_NAME, "access-token");

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error).toBe("auth-failed");
      }
    });

    it("should return auth-failed when google-spreadsheet throws 403", async () => {
      const error = new Error("Forbidden");
      // @ts-expect-error - Adding response property for mock
      error.response = { status: 403 };

      const { GoogleSpreadsheet } = await import("google-spreadsheet");
      vi.spyOn(GoogleSpreadsheet, "createNewSpreadsheetDocument").mockRejectedValue(error);

      const result = await createSpreadsheet(SPREADSHEET_NAME, "access-token");

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error).toBe("auth-failed");
      }
    });

    it("should return create-spreadsheet-failed for non-auth errors", async () => {
      const error = new Error("Network error");

      const { GoogleSpreadsheet } = await import("google-spreadsheet");
      vi.spyOn(GoogleSpreadsheet, "createNewSpreadsheetDocument").mockRejectedValue(error);

      const result = await createSpreadsheet(SPREADSHEET_NAME, "access-token");

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error).toBe("create-spreadsheet-failed");
      }
    });
  });

  describe("getOrCreateSheet", () => {
    it("returns an existing sheet without calling loadInfo or addSheet", async () => {
      const existingSheet = { title: "DeloadPhase" };
      const doc = {
        sheetsByTitle: { DeloadPhase: existingSheet },
        loadInfo: vi.fn(),
        addSheet: vi.fn(),
      } as unknown as Parameters<typeof getOrCreateSheet>[0];

      const sheet = await getOrCreateSheet(doc, "DeloadPhase", ["startedAt"]);

      expect(sheet).toBe(existingSheet);
      expect(doc.loadInfo).not.toHaveBeenCalled();
      expect(doc.addSheet).not.toHaveBeenCalled();
    });

    it("refreshes loadInfo and returns a concurrently created sheet on HTTP 400", async () => {
      const concurrentSheet = { title: "DeloadPhase" };
      const conflictError = Object.assign(new Error("Already exists"), {
        response: { status: 400 },
      });
      let loadCalls = 0;
      const doc = {
        sheetsByTitle: {} as Record<string, unknown>,
        loadInfo: vi.fn(async () => {
          loadCalls += 1;
          if (loadCalls === 2) {
            (doc.sheetsByTitle as Record<string, unknown>).DeloadPhase = concurrentSheet;
          }
        }),
        addSheet: vi.fn().mockRejectedValue(conflictError),
      } as unknown as Parameters<typeof getOrCreateSheet>[0];

      const sheet = await getOrCreateSheet(doc, "DeloadPhase", ["startedAt"]);

      expect(sheet).toBe(concurrentSheet);
      expect(doc.loadInfo).toHaveBeenCalledTimes(2);
    });

    it("finds a sheet added on disk during initial loadInfo check", async () => {
      const remoteSheet = { title: "Logs2026" };
      const doc = {
        sheetsByTitle: {} as Record<string, unknown>,
        loadInfo: vi.fn(async () => {
          (doc.sheetsByTitle as Record<string, unknown>).Logs2026 = remoteSheet;
        }),
      } as unknown as Parameters<typeof findSheet>[0];

      const sheet = await findSheet(doc, "Logs2026");

      expect(sheet).toBe(remoteSheet);
    });
  });

  describe("ensureSheetHeaders", () => {
    it("appends only missing headers and reloads", async () => {
      const sheet = {
        headerValues: ["a", "b"],
        loadHeaderRow: vi.fn().mockResolvedValue(undefined),
        setHeaderRow: vi.fn().mockResolvedValue(undefined),
      };

      await ensureSheetHeaders(sheet, ["a", "b", "c"]);

      expect(sheet.setHeaderRow).toHaveBeenCalledWith(["a", "b", "c"]);
      expect(sheet.loadHeaderRow).toHaveBeenCalledTimes(2);
    });

    it("skips setHeaderRow when all headers are already present", async () => {
      const sheet = {
        headerValues: ["a", "b"],
        loadHeaderRow: vi.fn().mockResolvedValue(undefined),
        setHeaderRow: vi.fn().mockResolvedValue(undefined),
      };

      await ensureSheetHeaders(sheet, ["a", "b"]);

      expect(sheet.setHeaderRow).not.toHaveBeenCalled();
    });
  });
});
