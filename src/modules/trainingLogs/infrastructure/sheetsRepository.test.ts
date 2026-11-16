import { err, ok } from "neverthrow";
import { describe, expect, it, vi } from "vitest";
import { ExerciseLogsSheetsRepository } from "./sheetsRepository";

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

function createMockDocWithSheet(sheet: Record<string, unknown>) {
  const yearSheetName = `Logs${new Date().getFullYear()}`;
  return {
    sheetsByTitle: {
      [yearSheetName]: sheet,
    },
    addSheet: vi.fn(),
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
    const repository = new ExerciseLogsSheetsRepository(createMockDocWithSheet(sheet) as never);

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
    const repository = new ExerciseLogsSheetsRepository(createMockDocWithSheet(sheet) as never);

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
    const repository = new ExerciseLogsSheetsRepository(createMockDocWithSheet(sheet) as never);

    expect(await repository.updateLog(VALID_LOG)).toEqual(err("not-found"));
  });
});
