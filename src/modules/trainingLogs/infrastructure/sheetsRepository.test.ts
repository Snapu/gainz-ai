import { describe, expect, it, vi } from "vitest";
import { ExerciseLogsSheetsRepository } from "./sheetsRepository";

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
});
