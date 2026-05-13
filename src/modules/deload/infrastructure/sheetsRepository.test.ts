import { err, ok } from "neverthrow";
import { describe, expect, it, vi } from "vitest";

const captureExceptionMock = vi.hoisted(() => vi.fn());

vi.mock("@sentry/vue", () => ({
  captureException: captureExceptionMock,
}));

import {
  createDeloadPhaseRepository,
  loadDeloadPhaseInfra,
  saveDeloadPhaseInfra,
} from "./sheetsRepository";

type MockRow = {
  assign: ReturnType<typeof vi.fn>;
  save: ReturnType<typeof vi.fn>;
  toObject: ReturnType<typeof vi.fn>;
};

type MockSheet = {
  loadHeaderRow: ReturnType<typeof vi.fn>;
  setHeaderRow: ReturnType<typeof vi.fn>;
  getRows: ReturnType<typeof vi.fn>;
  addRow: ReturnType<typeof vi.fn>;
  headerValues: string[];
};

function createSheet(rows: MockRow[] = []): MockSheet {
  const sheet: MockSheet = {
    loadHeaderRow: vi.fn(async () => undefined),
    setHeaderRow: vi.fn(async (headers: string[]) => {
      sheet.headerValues = headers;
    }),
    getRows: vi.fn(async () => rows),
    addRow: vi.fn(async () => undefined),
    headerValues: ["startedAt", "endsAt", "fatigueRiskScore", "triggeredBy", "canceledAt"],
  };

  return sheet;
}

function createDoc(sheet?: MockSheet) {
  const fallbackSheet = createSheet();
  const sheetsByTitle = sheet ? { DeloadPhase: sheet } : {};

  return {
    sheetsByTitle,
    addSheet: vi.fn(async () => fallbackSheet),
  };
}

describe("deload sheets repository", () => {
  it("loads null when no rows exist", async () => {
    const sheet = createSheet([]);
    const doc = createDoc(sheet);

    const result = await loadDeloadPhaseInfra(doc as never);

    expect(result).toEqual(ok(null));
    expect(sheet.getRows).toHaveBeenCalledOnce();
  });

  it("saves by updating the first row when one exists", async () => {
    const row: MockRow = {
      assign: vi.fn(),
      save: vi.fn(async () => undefined),
      toObject: vi.fn(() => ({})),
    };
    const sheet = createSheet([row]);
    const doc = createDoc(sheet);

    const result = await saveDeloadPhaseInfra(
      {
        startedAt: "2026-01-01T00:00:00.000Z",
        endsAt: "2026-01-08T00:00:00.000Z",
        fatigueRiskScore: 4,
        triggeredBy: ["volumeSpike"],
      },
      doc as never,
    );

    expect(result).toEqual(ok(undefined));
    expect(row.assign).toHaveBeenCalledOnce();
    expect(row.save).toHaveBeenCalledOnce();
  });

  it("returns auth-failed when sheet access throws auth errors", async () => {
    const sheet = createSheet([]);
    sheet.getRows.mockRejectedValue({ response: { status: 401 } });
    const doc = createDoc(sheet);

    const result = await loadDeloadPhaseInfra(doc as never);

    expect(result).toEqual(err("auth-failed"));
    expect(captureExceptionMock).not.toHaveBeenCalled();
  });

  it("creates repository delegating to infra functions", async () => {
    const sheet = createSheet([]);
    const doc = createDoc(sheet);
    const repository = createDeloadPhaseRepository(doc as never);

    const loadResult = await repository.load();
    const saveResult = await repository.save(null);

    expect(loadResult).toEqual(ok(null));
    expect(saveResult).toEqual(ok(undefined));
  });
});
