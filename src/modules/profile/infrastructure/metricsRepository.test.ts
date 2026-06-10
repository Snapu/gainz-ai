import type {
  GoogleSpreadsheet,
  GoogleSpreadsheetRow,
  GoogleSpreadsheetWorksheet,
} from "google-spreadsheet";
import { describe, expect, it, vi } from "vitest";
import { isAuthError } from "@/modules/platform/infrastructure";
import type { PhysiologicalMetricsMap } from "@/modules/profile/domain";
import { createMetricsRepository } from "./metricsRepository";

vi.mock("@sentry/vue");
vi.mock("@/modules/platform/infrastructure", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules/platform/infrastructure")>()),
  isAuthError: vi.fn(),
}));

function createMockRow(data: Record<string, string | number | boolean>): GoogleSpreadsheetRow {
  const row = {
    ...data,
    toObject: () => ({ ...data }),
    assign: vi.fn(),
    save: vi.fn().mockResolvedValue(undefined),
    get: (key: string) => data[key],
  } as unknown as GoogleSpreadsheetRow;
  return row;
}

function createMockSheet(rows: GoogleSpreadsheetRow[] = []): GoogleSpreadsheetWorksheet {
  return {
    loadHeaderRow: vi.fn().mockResolvedValue(undefined),
    setHeaderRow: vi.fn().mockResolvedValue(undefined),
    getRows: vi.fn().mockResolvedValue(rows),
    addRow: vi.fn().mockResolvedValue(undefined),
    headerValues: ["muscleGroup", "personalMAV", "personalMRV", "lastUpdated"],
  } as unknown as GoogleSpreadsheetWorksheet;
}

function createMockDoc(sheet: GoogleSpreadsheetWorksheet | null = null): GoogleSpreadsheet {
  const mockSheet = sheet ?? createMockSheet();
  return {
    sheetsByTitle: { "Physiological Metrics": mockSheet },
    addSheet: vi.fn().mockResolvedValue(mockSheet),
  } as unknown as GoogleSpreadsheet;
}

describe("metricsRepository", () => {
  describe("load", () => {
    it("loads physiological metrics successfully", async () => {
      const mockRows = [
        createMockRow({ muscleGroup: "Chest", personalMAV: "12", lastUpdated: "2024-01-01" }),
        createMockRow({ muscleGroup: "Lats", personalMRV: "20", lastUpdated: "2024-01-02" }),
      ];
      const doc = createMockDoc(createMockSheet(mockRows));
      const repo = createMetricsRepository(doc);

      const result = await repo.load();

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const metrics = result.value;
        expect(metrics["Chest"]).toEqual({
          muscleGroup: "Chest",
          personalMAV: 12,
          personalMRV: undefined,
          lastUpdated: "2024-01-01",
        });
        expect(metrics["Lats"]).toEqual({
          muscleGroup: "Lats",
          personalMAV: undefined,
          personalMRV: 20,
          lastUpdated: "2024-01-02",
        });
      }
    });

    it("ignores invalid muscle groups", async () => {
      const mockRows = [createMockRow({ muscleGroup: "InvalidMuscle", personalMAV: "10" })];
      const doc = createMockDoc(createMockSheet(mockRows));
      const repo = createMetricsRepository(doc);

      const result = await repo.load();

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(Object.keys(result.value).length).toBe(0);
      }
    });
  });

  describe("save", () => {
    it("saves new metrics by adding a row", async () => {
      const sheet = createMockSheet();
      const doc = createMockDoc(sheet);
      const repo = createMetricsRepository(doc);

      const metrics: PhysiologicalMetricsMap = {
        Chest: {
          muscleGroup: "Chest",
          personalMAV: 15,
          lastUpdated: "2024-01-01",
        },
      } as PhysiologicalMetricsMap;

      const result = await repo.save(metrics);

      expect(result.isOk()).toBe(true);
      expect(sheet.addRow).toHaveBeenCalledWith({
        muscleGroup: "Chest",
        personalMAV: "15",
        personalMRV: "",
        lastUpdated: "2024-01-01",
      });
    });

    it("updates existing metrics by assigning to row", async () => {
      const mockRow = createMockRow({ muscleGroup: "Chest", personalMAV: "10" });
      const sheet = createMockSheet([mockRow]);
      const doc = createMockDoc(sheet);
      const repo = createMetricsRepository(doc);

      const metrics: PhysiologicalMetricsMap = {
        Chest: {
          muscleGroup: "Chest",
          personalMAV: 18,
          lastUpdated: "2024-01-05",
        },
      } as PhysiologicalMetricsMap;

      const result = await repo.save(metrics);

      expect(result.isOk()).toBe(true);
      expect(mockRow.assign).toHaveBeenCalledWith({
        muscleGroup: "Chest",
        personalMAV: "18",
        personalMRV: "",
        lastUpdated: "2024-01-05",
      });
      expect(mockRow.save).toHaveBeenCalled();
      expect(sheet.addRow).not.toHaveBeenCalled();
    });
  });
});
