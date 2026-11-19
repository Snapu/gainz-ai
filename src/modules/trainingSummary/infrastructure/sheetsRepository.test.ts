import type { GoogleSpreadsheet } from "google-spreadsheet";
import { err, ok } from "neverthrow";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TrainingSummary } from "@/modules/trainingSummary/domain";
import { createTrainingSummaryRepository } from "./sheetsRepository";

function makeHttpError(status: number): Error & { response: { status: number } } {
  const error = new Error(`HTTP ${status}`) as Error & { response: { status: number } };
  error.response = { status };
  return error;
}

function makeSummary(overrides: Partial<TrainingSummary> = {}): TrainingSummary {
  return {
    year: 2025,
    month: 11,
    workoutDays: 12,
    exerciseName: "Bench Press",
    sets: 24,
    totalReps: 200,
    maxWeight: 100,
    totalVolume: 16000,
    ...overrides,
  };
}

function createMockRow(data: Record<string, unknown>, rowNumber = 2) {
  return {
    rowNumber,
    toObject: () => ({ ...data }),
  };
}

function createMockSheet(overrides: Record<string, unknown> = {}) {
  return {
    getRows: vi.fn().mockResolvedValue([]),
    addRows: vi.fn().mockResolvedValue([]),
    clearRows: vi.fn().mockResolvedValue(undefined),
    deleteRows: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function createMockDoc(sheet: Record<string, unknown>): GoogleSpreadsheet {
  return {
    sheetsByTitle: {
      TrainingSummary: sheet,
    },
    addSheet: vi.fn().mockResolvedValue(sheet),
  } as unknown as GoogleSpreadsheet;
}

describe("trainingSummary sheetsRepository", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });
  describe("auth error classification (401/403)", () => {
    it("maps 401 and 403 to auth-failed on load and non-auth errors to load-failed", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      const sheet = createMockSheet({
        getRows: vi
          .fn()
          .mockRejectedValueOnce(makeHttpError(401))
          .mockRejectedValueOnce(makeHttpError(403))
          .mockRejectedValueOnce(makeHttpError(500)),
      });
      const repo = createTrainingSummaryRepository(createMockDoc(sheet));

      expect(await repo.load()).toEqual(err("auth-failed"));
      expect(await repo.load()).toEqual(err("auth-failed"));
      expect(await repo.load()).toEqual(err("load-failed"));
    });

    it("maps 401 and 403 to auth-failed on saveRows and skips addRows for empty input", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      const sheet = createMockSheet({
        addRows: vi
          .fn()
          .mockRejectedValueOnce(makeHttpError(401))
          .mockRejectedValueOnce(makeHttpError(403))
          .mockRejectedValueOnce(makeHttpError(503)),
      });
      const repo = createTrainingSummaryRepository(createMockDoc(sheet));
      const rows = [makeSummary()];

      expect(await repo.saveRows([])).toEqual(ok(undefined));
      expect(sheet.addRows).not.toHaveBeenCalled();

      expect(await repo.saveRows(rows)).toEqual(err("auth-failed"));
      expect(await repo.saveRows(rows)).toEqual(err("auth-failed"));
      expect(await repo.saveRows(rows)).toEqual(err("save-failed"));
    });

    it("maps 401 and 403 to auth-failed on replaceRows", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      const sheet = createMockSheet({
        getRows: vi.fn().mockResolvedValue([createMockRow(makeSummary())]),
        addRows: vi
          .fn()
          .mockRejectedValueOnce(makeHttpError(401))
          .mockRejectedValueOnce(makeHttpError(403)),
      });
      const repo = createTrainingSummaryRepository(createMockDoc(sheet));
      const rows = [makeSummary({ month: 12 })];

      expect(await repo.replaceRows(rows)).toEqual(err("auth-failed"));
      expect(await repo.replaceRows(rows)).toEqual(err("auth-failed"));
      expect(sheet.clearRows).not.toHaveBeenCalled();
      expect(sheet.deleteRows).not.toHaveBeenCalled();
    });
  });

  describe("safe replaceRows", () => {
    it("appends validated replacement rows before deleting existing rows so failed writes never leave an empty sheet", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      const callOrder: string[] = [];
      const existingRows = [
        createMockRow(makeSummary({ year: 2024, month: 1 }), 2),
        createMockRow(makeSummary({ year: 2024, month: 2 }), 3),
      ];
      const sheet = createMockSheet({
        getRows: vi.fn().mockImplementation(async () => {
          callOrder.push("getRows");
          return existingRows;
        }),
        addRows: vi.fn().mockImplementation(async () => {
          callOrder.push("addRows");
          return [];
        }),
        deleteRows: vi.fn().mockImplementation(async () => {
          callOrder.push("deleteRows");
        }),
      });
      const repo = createTrainingSummaryRepository(createMockDoc(sheet));
      const nextRows = [makeSummary({ year: 2025, month: 10 })];

      const result = await repo.replaceRows(nextRows);

      expect(result).toEqual(ok(undefined));
      expect(callOrder).toEqual(["getRows", "addRows", "deleteRows"]);
      expect(sheet.addRows).toHaveBeenCalledWith(nextRows);
      expect(sheet.deleteRows).toHaveBeenCalledWith(1, 3);
      expect(sheet.clearRows).not.toHaveBeenCalled();
    });

    it("does not clear or delete existing rows when replacement validation or addRows fails", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      const existingRows = [createMockRow(makeSummary())];
      const sheet = createMockSheet({
        getRows: vi.fn().mockResolvedValue(existingRows),
        addRows: vi.fn().mockRejectedValue(new Error("network blip")),
      });
      const repo = createTrainingSummaryRepository(createMockDoc(sheet));

      const invalidResult = await repo.replaceRows([makeSummary({ month: 99 })]);
      expect(invalidResult).toEqual(err("save-failed"));
      expect(sheet.getRows).not.toHaveBeenCalled();
      expect(sheet.addRows).not.toHaveBeenCalled();
      expect(sheet.clearRows).not.toHaveBeenCalled();
      expect(sheet.deleteRows).not.toHaveBeenCalled();

      const failedWriteResult = await repo.replaceRows([makeSummary()]);
      expect(failedWriteResult).toEqual(err("save-failed"));
      expect(sheet.clearRows).not.toHaveBeenCalled();
      expect(sheet.deleteRows).not.toHaveBeenCalled();
    });

    it("clears existing rows only when replacement list is empty and old rows exist", async () => {
      const sheetWithRows = createMockSheet({
        getRows: vi.fn().mockResolvedValue([createMockRow(makeSummary())]),
      });
      const repoWithRows = createTrainingSummaryRepository(createMockDoc(sheetWithRows));
      expect(await repoWithRows.replaceRows([])).toEqual(ok(undefined));
      expect(sheetWithRows.clearRows).toHaveBeenCalledTimes(1);

      const emptySheet = createMockSheet({
        getRows: vi.fn().mockResolvedValue([]),
      });
      const repoEmpty = createTrainingSummaryRepository(createMockDoc(emptySheet));
      expect(await repoEmpty.replaceRows([])).toEqual(ok(undefined));
      expect(emptySheet.clearRows).not.toHaveBeenCalled();
    });
  });
});
