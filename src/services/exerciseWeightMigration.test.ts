import type { GoogleSpreadsheet } from "google-spreadsheet";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ExerciseLog } from "./exerciseLogs";
import {
  applyExerciseWeightMigrationDecision,
  buildExerciseWeightMigrationCandidates,
  loadExerciseWeightMigrationReviews,
  saveExerciseWeightMigrationReview,
  type ExerciseWeightMigrationReview,
} from "./exerciseWeightMigration";

const { rebuildTrainingSummaryMock } = vi.hoisted(() => ({
  rebuildTrainingSummaryMock: vi.fn().mockResolvedValue({
    isErr: () => false,
    isOk: () => true,
    value: [],
  }),
}));

vi.mock("./trainingSummary", () => ({
  rebuildTrainingSummary: rebuildTrainingSummaryMock,
}));

const createMockRow = (data: Record<string, string> = {}) => ({
  toObject: () => data,
  get: (key: string) => data[key] ?? "",
  assign: vi.fn((next: Record<string, string>) => {
    Object.assign(data, next);
  }),
  save: vi.fn().mockResolvedValue(undefined),
});

const createMockSheet = (rows: any[] = [], headerValues = ["exerciseName", "decision"]) => {
  const sheet: any = {
    headerValues,
    loadHeaderRow: vi.fn().mockResolvedValue(undefined),
    setHeaderRow: vi.fn().mockImplementation(async (headers: string[]) => {
      sheet.headerValues = headers;
    }),
    getRows: vi.fn().mockResolvedValue(rows),
    addRow: vi.fn().mockResolvedValue(undefined),
    addRows: vi.fn().mockResolvedValue(undefined),
    clearRows: vi.fn().mockResolvedValue(undefined),
  };
  return sheet;
};

const createMockDoc = (migrationSheet: any = null, logSheets: Record<string, any> = {}) =>
  ({
    sheetsByTitle: {
      ExerciseWeightMigration: migrationSheet,
      TrainingSummary: createMockSheet(),
      ...logSheets,
    },
    addSheet: vi.fn().mockImplementation(async ({ headerValues }: { headerValues?: string[] }) =>
      createMockSheet([], headerValues ?? []),
    ),
  }) as unknown as GoogleSpreadsheet;

function makeReview(
  overrides: Partial<ExerciseWeightMigrationReview> = {},
): ExerciseWeightMigrationReview {
  return {
    exerciseName: "Dumbbell Bench Press",
    decision: "convert_to_total",
    reviewedAt: "2026-05-07T12:00:00.000Z",
    affectedLogCount: 6,
    ...overrides,
  };
}

function createLog(exerciseName: string, loggedAt: string, weight?: number): ExerciseLog {
  return {
    id: crypto.randomUUID(),
    exerciseName,
    loggedAt: new Date(loggedAt),
    weight,
  };
}

beforeEach(() => {
  rebuildTrainingSummaryMock.mockClear();
});

describe("exerciseWeightMigration service", () => {
  it("creates the sheet if it is missing", async () => {
    const doc = createMockDoc(null);

    const result = await loadExerciseWeightMigrationReviews(doc);

    expect(result.isOk()).toBe(true);
    expect(doc.addSheet).toHaveBeenCalledWith({
      title: "ExerciseWeightMigration",
      headerValues: ["exerciseName", "decision", "reviewedAt", "affectedLogCount"],
    });
  });

  it("appends missing headers before loading", async () => {
    const sheet = createMockSheet([createMockRow(makeReview() as unknown as Record<string, string>)]);

    const result = await loadExerciseWeightMigrationReviews(createMockDoc(sheet));

    expect(result.isOk()).toBe(true);
    expect(sheet.setHeaderRow).toHaveBeenCalledWith([
      "exerciseName",
      "decision",
      "reviewedAt",
      "affectedLogCount",
    ]);
  });

  it("loads and parses migration reviews", async () => {
    const row = createMockRow(makeReview() as unknown as Record<string, string>);
    const sheet = createMockSheet([row], [
      "exerciseName",
      "decision",
      "reviewedAt",
      "affectedLogCount",
    ]);

    const result = await loadExerciseWeightMigrationReviews(createMockDoc(sheet));

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual([makeReview()]);
    }
  });

  it("updates an existing review row", async () => {
    const row = createMockRow({
      exerciseName: "Dumbbell Bench Press",
      decision: "keep_as_is",
      reviewedAt: "2026-05-06T12:00:00.000Z",
      affectedLogCount: "4",
    });
    const sheet = createMockSheet([row], [
      "exerciseName",
      "decision",
      "reviewedAt",
      "affectedLogCount",
    ]);

    const result = await saveExerciseWeightMigrationReview(makeReview(), createMockDoc(sheet));

    expect(result.isOk()).toBe(true);
    expect(row.assign).toHaveBeenCalledWith(makeReview());
    expect(row.save).toHaveBeenCalled();
    expect(sheet.addRow).not.toHaveBeenCalled();
  });

  it("adds a new review row when none exists", async () => {
    const sheet = createMockSheet([], [
      "exerciseName",
      "decision",
      "reviewedAt",
      "affectedLogCount",
    ]);

    const result = await saveExerciseWeightMigrationReview(makeReview(), createMockDoc(sheet));

    expect(result.isOk()).toBe(true);
    expect(sheet.addRow).toHaveBeenCalledWith(makeReview());
  });

  it("builds pending review candidates from weighted logs", () => {
    const candidates = buildExerciseWeightMigrationCandidates(
      [
        createLog("Dumbbell Bench Press", "2026-05-07T10:00:00.000Z", 20),
        createLog("Dumbbell Bench Press", "2026-05-06T10:00:00.000Z", 18),
        createLog("Dumbbell Bench Press", "2026-05-05T10:00:00.000Z", 16),
        createLog("Dumbbell Bench Press", "2025-12-28T10:00:00.000Z", 14),
        createLog("Dumbbell Bench Press", "2025-12-21T10:00:00.000Z", 12),
        createLog("Dumbbell Bench Press", "2025-12-14T10:00:00.000Z", 10),
        createLog("Pull-ups", "2026-05-07T11:00:00.000Z"),
      ],
      [],
    );

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      exerciseName: "Dumbbell Bench Press",
      affectedLogCount: 6,
      latestWeight: 20,
      spansMultipleYears: true,
    });
    expect(candidates[0]?.recentLogs.map((log) => log.weight)).toEqual([20, 18, 16, 14, 12]);
  });

  it("excludes already reviewed exercises from pending candidates", () => {
    const candidates = buildExerciseWeightMigrationCandidates(
      [createLog("Dumbbell Bench Press", "2026-05-07T10:00:00.000Z", 20)],
      [makeReview({ exerciseName: "  Dumbbell   Bench Press  " })],
    );

    expect(candidates).toEqual([]);
  });

  it("converts matching weighted logs across log sheets and rebuilds summaries", async () => {
    const currentYearRow = createMockRow({
      exerciseName: "Dumbbell Bench Press",
      weight: "20",
      loggedAt: "2026-05-07T10:00:00.000Z",
    });
    const previousYearRow = createMockRow({
      exerciseName: "Dumbbell Bench Press",
      weight: "18",
      loggedAt: "2025-12-21T10:00:00.000Z",
    });
    const untouchedRow = createMockRow({
      exerciseName: "Barbell Bench Press",
      weight: "80",
      loggedAt: "2026-05-07T10:00:00.000Z",
    });
    const migrationSheet = createMockSheet([], [
      "exerciseName",
      "decision",
      "reviewedAt",
      "affectedLogCount",
    ]);
    const doc = createMockDoc(migrationSheet, {
      Logs2025: createMockSheet([previousYearRow]),
      Logs2026: createMockSheet([currentYearRow, untouchedRow]),
    });

    const result = await applyExerciseWeightMigrationDecision(
      "Dumbbell Bench Press",
      "convert_to_total",
      doc,
    );

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.updatedLogCount).toBe(2);
      expect(result.value.review.decision).toBe("convert_to_total");
    }
    expect(currentYearRow.assign).toHaveBeenCalledWith({ weight: "40" });
    expect(previousYearRow.assign).toHaveBeenCalledWith({ weight: "36" });
    expect(untouchedRow.assign).not.toHaveBeenCalled();
    expect(migrationSheet.addRow).toHaveBeenCalledTimes(1);
    expect(rebuildTrainingSummaryMock).toHaveBeenCalledWith(doc);
  });

  it("marks keep-as-is reviews without changing existing log rows", async () => {
    const currentYearRow = createMockRow({
      exerciseName: "Dumbbell Bench Press",
      weight: "20",
      loggedAt: "2026-05-07T10:00:00.000Z",
    });
    const migrationSheet = createMockSheet([], [
      "exerciseName",
      "decision",
      "reviewedAt",
      "affectedLogCount",
    ]);
    const doc = createMockDoc(migrationSheet, {
      Logs2026: createMockSheet([currentYearRow]),
    });

    const result = await applyExerciseWeightMigrationDecision(
      "Dumbbell Bench Press",
      "keep_as_is",
      doc,
    );

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.updatedLogCount).toBe(1);
      expect(result.value.review.decision).toBe("keep_as_is");
    }
    expect(currentYearRow.assign).not.toHaveBeenCalledWith({ weight: expect.any(String) });
    expect(rebuildTrainingSummaryMock).toHaveBeenCalledWith(doc);
  });
});
