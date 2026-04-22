import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createSpreadsheet,
  getSpreadsheetId,
  loadSpreadsheet,
  SPREADSHEET_NAME,
} from "./spreadsheets";

describe("spreadsheets", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getSpreadsheetId", () => {
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

    it("should return auth-failed when google-spreadsheet throws 403", async () => {
      const error = new Error("Forbidden");
      // @ts-expect-error - Adding response property for mock
      error.response = { status: 403 };

      const { GoogleSpreadsheet } = await import("google-spreadsheet");
      vi.spyOn(GoogleSpreadsheet.prototype, "loadInfo").mockRejectedValue(error);

      const result = await loadSpreadsheet("spreadsheet-123", "access-token");

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error).toBe("auth-failed");
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
});
