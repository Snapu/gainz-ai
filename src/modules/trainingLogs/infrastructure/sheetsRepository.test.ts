import { err, ok } from "neverthrow";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ExerciseLogsSheetsRepository } from "./sheetsRepository";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function makeHttpError(status: number): Error & { response: { status: number } } {
  const error = new Error(`HTTP ${status}`) as Error & { response: { status: number } };
  error.response = { status };
  return error;
}

const VALID_LOG = {
  id: "11111111-1111-4111-8111-111111111111",
  exerciseName: "Bench Press",
  weight: 80,
  reps: 8,
  loggedAt: new Date("2026-11-16T10:00:00Z"),
};

function createMockDocWithSheet(sheet: Record<string, unknown>, year = new Date().getFullYear()) {
  const yearSheetName = `Logs${year}`;
  return {
    sheetsByTitle: {
      [yearSheetName]: sheet,
    },
    addSheet: vi.fn(),
    loadInfo: vi.fn().mockResolvedValue(undefined),
  };
}

describe("ExerciseLogsSheetsRepository.loadCurrentYear", () => {
  it("returns load-failed when migration row read throws", async () => {
    const sheet = {
      headerValues: ["exerciseName", "reps", "loggedAt"],
      loadHeaderRow: vi.fn().mockResolvedValue(undefined),
      getRows: vi.fn().mockRejectedValue(new Error("migration read failed")),
      setHeaderRow: vi.fn(),
      clearRows: vi.fn(),
      addRows: vi.fn(),
    };

    const repository = new ExerciseLogsSheetsRepository(createMockDocWithSheet(sheet) as never);

    const result = await repository.loadCurrentYear();

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toBe("load-failed");
    }
  });

  it("returns auth-failed when migration row read throws auth error", async () => {
    const authError = new Error("unauthorized") as Error & {
      response?: { status: number };
    };
    authError.response = { status: 401 };

    const sheet = {
      headerValues: ["exerciseName", "reps", "loggedAt"],
      loadHeaderRow: vi.fn().mockResolvedValue(undefined),
      getRows: vi.fn().mockRejectedValue(authError),
      setHeaderRow: vi.fn(),
      clearRows: vi.fn(),
      addRows: vi.fn(),
    };

    const repository = new ExerciseLogsSheetsRepository(createMockDocWithSheet(sheet) as never);

    const result = await repository.loadCurrentYear();

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toBe("auth-failed");
    }
  });

  it("returns auth-failed when loadYear throws auth error", async () => {
    const authError = new Error("unauthorized") as Error & {
      response?: { status: number };
    };
    authError.response = { status: 401 };

    const pastYearSheet = {
      getRows: vi.fn().mockRejectedValue(authError),
    };
    const doc = {
      sheetsByTitle: {
        Logs2025: pastYearSheet,
      },
    };

    const repository = new ExerciseLogsSheetsRepository(doc as never);
    const result = await repository.loadYear(2025);

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toBe("auth-failed");
    }
  });
});

describe("ExerciseLogsSheetsRepository mutation error classification", () => {
  it("distinguishes non-retryable 4xx/Zod validation errors, 401 auth errors, and transient failures on addLog", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const sheet = {
      addRow: vi
        .fn()
        .mockRejectedValueOnce(makeHttpError(400))
        .mockRejectedValueOnce(makeHttpError(403))
        .mockRejectedValueOnce(makeHttpError(401))
        .mockRejectedValueOnce(makeHttpError(500))
        .mockRejectedValueOnce(new TypeError("Failed to fetch"))
        .mockResolvedValueOnce(undefined),
    };
    const repository = new ExerciseLogsSheetsRepository(
      createMockDocWithSheet(sheet, VALID_LOG.loggedAt.getFullYear()) as never,
    );

    expect(await repository.addLog({ ...VALID_LOG, id: "not-a-uuid" })).toEqual(
      err("validation-failed"),
    );
    expect(await repository.addLog(VALID_LOG)).toEqual(err("validation-failed"));
    expect(await repository.addLog(VALID_LOG)).toEqual(err("validation-failed"));
    expect(await repository.addLog(VALID_LOG)).toEqual(err("auth-failed"));
    expect(await repository.addLog(VALID_LOG)).toEqual(err("add-failed"));
    expect(await repository.addLog(VALID_LOG)).toEqual(err("add-failed"));
    expect(await repository.addLog(VALID_LOG)).toEqual(ok(undefined));
  });

  it("distinguishes validation-failed, auth-failed, and transient errors on updateLog and deleteLog", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const mockRow = {
      get: vi.fn((key: string) => (key === "id" ? VALID_LOG.id : undefined)),
      assign: vi.fn(),
      save: vi
        .fn()
        .mockRejectedValueOnce(makeHttpError(400))
        .mockRejectedValueOnce(makeHttpError(401))
        .mockRejectedValueOnce(makeHttpError(503)),
      delete: vi
        .fn()
        .mockRejectedValueOnce(makeHttpError(404))
        .mockRejectedValueOnce(makeHttpError(401))
        .mockRejectedValueOnce(makeHttpError(429)),
    };
    const sheet = {
      getRows: vi.fn().mockResolvedValue([mockRow]),
    };
    const repository = new ExerciseLogsSheetsRepository(
      createMockDocWithSheet(sheet, VALID_LOG.loggedAt.getFullYear()) as never,
    );

    expect(await repository.updateLog(VALID_LOG)).toEqual(err("validation-failed"));
    expect(await repository.updateLog(VALID_LOG)).toEqual(err("auth-failed"));
    expect(await repository.updateLog(VALID_LOG)).toEqual(err("update-failed"));

    expect(await repository.deleteLog(VALID_LOG)).toEqual(err("validation-failed"));
    expect(await repository.deleteLog(VALID_LOG)).toEqual(err("auth-failed"));
    expect(await repository.deleteLog(VALID_LOG)).toEqual(err("delete-failed"));
  });

  it("returns not-found when updateLog targets a row deleted from the sheet", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const sheet = {
      getRows: vi.fn().mockResolvedValue([]),
    };
    const repository = new ExerciseLogsSheetsRepository(
      createMockDocWithSheet(sheet, VALID_LOG.loggedAt.getFullYear()) as never,
    );

    expect(await repository.updateLog(VALID_LOG)).toEqual(err("not-found"));
  });
});

describe("ExerciseLogsSheetsRepository dynamic year rollover", () => {
  it("routes reads and writes dynamically across Dec 31 -> Jan 1 rollover without module reload", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 11, 31, 23, 59, 0));

    const dec31Log = {
      ...VALID_LOG,
      id: "22222222-2222-4222-8222-222222222222",
      loggedAt: new Date(2026, 11, 31, 23, 55, 0),
    };
    const jan1Log = {
      ...VALID_LOG,
      id: "33333333-3333-4333-8333-333333333333",
      loggedAt: new Date(2027, 0, 1, 0, 1, 0),
    };

    const dec31Row = {
      get: vi.fn((key: string) => (key === "id" ? dec31Log.id : undefined)),
      assign: vi.fn(),
      save: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
      toObject: () => dec31Log,
    };
    const sheet2026 = {
      headerValues: [
        "id",
        "exerciseName",
        "reps",
        "weight",
        "distance",
        "duration",
        "rpe",
        "loggedAt",
      ],
      loadHeaderRow: vi.fn().mockResolvedValue(undefined),
      getRows: vi.fn().mockResolvedValue([dec31Row]),
      addRow: vi.fn().mockResolvedValue(undefined),
    };
    const sheet2027 = {
      headerValues: [
        "id",
        "exerciseName",
        "reps",
        "weight",
        "distance",
        "duration",
        "rpe",
        "loggedAt",
      ],
      loadHeaderRow: vi.fn().mockResolvedValue(undefined),
      getRows: vi.fn().mockResolvedValue([]),
      addRow: vi.fn().mockResolvedValue(undefined),
    };

    const sheetsByTitle: Record<string, Record<string, unknown>> = {
      Logs2026: sheet2026,
    };
    const doc = {
      sheetsByTitle,
      loadInfo: vi.fn().mockResolvedValue(undefined),
      addSheet: vi.fn(async ({ title }: { title: string }) => {
        if (title === "Logs2027") {
          sheetsByTitle.Logs2027 = sheet2027;
          return sheet2027;
        }
        throw new Error(`Unexpected sheet creation: ${title}`);
      }),
    };

    const repository = new ExerciseLogsSheetsRepository(doc as never);

    expect((await repository.loadCurrentYear())._unsafeUnwrap()).toEqual([dec31Log]);
    expect(await repository.addLog(dec31Log)).toEqual(ok(undefined));
    expect(sheet2026.addRow).toHaveBeenCalledTimes(1);
    expect(doc.addSheet).not.toHaveBeenCalled();

    // Cross midnight into the new year on the same repository instance
    vi.setSystemTime(new Date(2027, 0, 1, 0, 1, 0));

    expect((await repository.loadCurrentYear())._unsafeUnwrap()).toEqual([]);
    expect(doc.addSheet).toHaveBeenCalledWith(expect.objectContaining({ title: "Logs2027" }));
    expect(repository.findPastYearSheets()).toEqual([2026]);

    expect(await repository.addLog(jan1Log)).toEqual(ok(undefined));
    expect(sheet2027.addRow).toHaveBeenCalledTimes(1);

    // Mutations for a 2026 log still target Logs2026 after rollover
    expect(await repository.addLog(dec31Log)).toEqual(ok(undefined));
    expect(sheet2026.addRow).toHaveBeenCalledTimes(2);
    expect(sheet2027.addRow).toHaveBeenCalledTimes(1);

    expect(await repository.updateLog({ ...dec31Log, weight: 85 })).toEqual(ok(undefined));
    expect(dec31Row.assign).toHaveBeenCalledWith(expect.objectContaining({ weight: 85 }));
    expect(dec31Row.save).toHaveBeenCalledTimes(1);

    expect(await repository.deleteLog(dec31Log)).toEqual(ok(undefined));
    expect(dec31Row.delete).toHaveBeenCalledTimes(1);
  });

  it("refreshes stale sheetsByTitle via loadInfo before creating a new year sheet", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2027, 0, 1, 0, 1, 0));

    const jan1Log = {
      ...VALID_LOG,
      id: "44444444-4444-4444-8444-444444444444",
      loggedAt: new Date(2027, 0, 1, 0, 1, 0),
    };
    const sheet2027 = {
      headerValues: [
        "id",
        "exerciseName",
        "reps",
        "weight",
        "distance",
        "duration",
        "rpe",
        "loggedAt",
      ],
      loadHeaderRow: vi.fn().mockResolvedValue(undefined),
      getRows: vi.fn().mockResolvedValue([{ toObject: () => jan1Log }]),
      addRow: vi.fn().mockResolvedValue(undefined),
    };
    const sheetsByTitle: Record<string, Record<string, unknown>> = {};
    const doc = {
      sheetsByTitle,
      loadInfo: vi.fn(async () => {
        sheetsByTitle.Logs2027 = sheet2027;
      }),
      addSheet: vi.fn(),
    };
    const repository = new ExerciseLogsSheetsRepository(doc as never);

    expect((await repository.loadCurrentYear())._unsafeUnwrap()).toEqual([jan1Log]);
    expect(doc.loadInfo).toHaveBeenCalledTimes(1);
    expect(doc.addSheet).not.toHaveBeenCalled();

    delete sheetsByTitle.Logs2027;
    expect(await repository.addLog(jan1Log)).toEqual(ok(undefined));
    expect(doc.loadInfo).toHaveBeenCalledTimes(2);
    expect(doc.addSheet).not.toHaveBeenCalled();
    expect(sheet2027.addRow).toHaveBeenCalledTimes(1);
  });

  it("recovers when concurrent addSheet throws HTTP 400, and returns validation-failed if sheet remains absent", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2027, 0, 1, 0, 1, 0));

    const jan1Log = {
      ...VALID_LOG,
      id: "55555555-5555-4555-8555-555555555555",
      loggedAt: new Date(2027, 0, 1, 0, 1, 0),
    };
    const sheet2027 = {
      headerValues: [
        "id",
        "exerciseName",
        "reps",
        "weight",
        "distance",
        "duration",
        "rpe",
        "loggedAt",
      ],
      loadHeaderRow: vi.fn().mockResolvedValue(undefined),
      getRows: vi.fn().mockResolvedValue([]),
      addRow: vi.fn().mockResolvedValue(undefined),
    };

    const raceSheets: Record<string, Record<string, unknown>> = {};
    let loadCount = 0;
    const raceDoc = {
      sheetsByTitle: raceSheets,
      loadInfo: vi.fn(async () => {
        loadCount += 1;
        if (loadCount === 2 || loadCount === 4) {
          raceSheets.Logs2027 = sheet2027;
        }
      }),
      addSheet: vi.fn().mockRejectedValue(makeHttpError(400)),
    };
    const raceRepo = new ExerciseLogsSheetsRepository(raceDoc as never);

    expect(await raceRepo.addLog(jan1Log)).toEqual(ok(undefined));
    expect(sheet2027.addRow).toHaveBeenCalledTimes(1);

    delete raceSheets.Logs2027;
    expect((await raceRepo.loadCurrentYear())._unsafeUnwrap()).toEqual([]);
    expect(raceDoc.addSheet).toHaveBeenCalledTimes(2);

    const failDoc = {
      sheetsByTitle: {},
      loadInfo: vi.fn().mockResolvedValue(undefined),
      addSheet: vi.fn().mockRejectedValue(makeHttpError(400)),
    };
    const failRepo = new ExerciseLogsSheetsRepository(failDoc as never);

    expect(await failRepo.addLog(jan1Log)).toEqual(err("validation-failed"));
    expect(failDoc.loadInfo).toHaveBeenCalledTimes(2);
  });

  it("refreshes stale sheetsByTitle via loadInfo on updateLog and deleteLog", async () => {
    const jan1Log = {
      ...VALID_LOG,
      id: "66666666-6666-4666-8666-666666666666",
      loggedAt: new Date(2027, 0, 1, 0, 1, 0),
    };
    const row = {
      get: vi.fn((key: string) => (key === "id" ? jan1Log.id : undefined)),
      assign: vi.fn(),
      save: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
    };
    const sheet2027 = {
      getRows: vi.fn().mockResolvedValue([row]),
    };
    const sheetsByTitle: Record<string, Record<string, unknown>> = {};
    const doc = {
      sheetsByTitle,
      loadInfo: vi.fn(async () => {
        sheetsByTitle.Logs2027 = sheet2027;
      }),
    };
    const repository = new ExerciseLogsSheetsRepository(doc as never);

    expect(await repository.updateLog({ ...jan1Log, weight: 90 })).toEqual(ok(undefined));
    expect(row.save).toHaveBeenCalledTimes(1);

    delete sheetsByTitle.Logs2027;
    expect(await repository.deleteLog(jan1Log)).toEqual(ok(undefined));
    expect(row.delete).toHaveBeenCalledTimes(1);
    expect(doc.loadInfo).toHaveBeenCalledTimes(2);
  });

  it("returns validation-failed asynchronously in deleteLog when loggedAt is invalid", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const loadInfo = vi.fn().mockResolvedValue(undefined);
    const repository = new ExerciseLogsSheetsRepository({
      sheetsByTitle: {},
      loadInfo,
    } as never);

    expect(await repository.deleteLog({ ...VALID_LOG, loggedAt: new Date("invalid") })).toEqual(
      err("validation-failed"),
    );
    expect(await repository.deleteLog({ ...VALID_LOG, loggedAt: "not-a-date" as never })).toEqual(
      err("validation-failed"),
    );
    expect(loadInfo).not.toHaveBeenCalled();
  });
});
