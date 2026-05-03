import type { GoogleSpreadsheet } from "google-spreadsheet";
import { describe, expect, it, vi } from "vitest";
import { loadDeloadLifecycle, saveDeloadLifecycle } from "./deloadLifecycleSheet";

const createMockSheet = (rows: any[] = [], headerValues?: string[]) => {
  const sheet: any = {
    headerValues: headerValues ?? ["data"],
    loadHeaderRow: vi.fn().mockResolvedValue(undefined),
    getRows: vi.fn().mockResolvedValue(rows),
    addRow: vi.fn().mockResolvedValue({}),
    setHeaderRow: vi.fn().mockImplementation(async (headers: string[]) => {
      sheet.headerValues = headers;
    }),
  };
  return sheet;
};

const createMockRow = (data: Record<string, string>) => ({
  toObject: () => data,
  assign: vi.fn(),
  save: vi.fn().mockResolvedValue(undefined),
});

function createMockDoc(sheetsByTitle: Record<string, any>): GoogleSpreadsheet {
  return {
    sheetsByTitle,
    addSheet: vi.fn().mockResolvedValue(createMockSheet()),
  } as unknown as GoogleSpreadsheet;
}

describe("deloadLifecycleSheet service", () => {
  it("loads lifecycle from dedicated sheet", async () => {
    const sheet = createMockSheet([
      createMockRow({ data: JSON.stringify({ status: "active", endsAtIso: "2026-05-09T10:00:00.000Z" }) }),
    ]);
    const result = await loadDeloadLifecycle(createMockDoc({ DeloadLifecycle: sheet }));
    expect(result.isOk()).toBe(true);
    if (result.isOk()) expect(result.value?.status).toBe("active");
  });

  it("falls back to legacy user profile field", async () => {
    const legacySheet = createMockSheet([
      createMockRow({ deloadLifecycle: JSON.stringify({ status: "inactive", lastEndedAtIso: "2026-05-01T10:00:00.000Z" }) }),
    ]);
    const result = await loadDeloadLifecycle(createMockDoc({ UserProfile: legacySheet }));
    expect(result.isOk()).toBe(true);
    if (result.isOk()) expect(result.value?.lastEndedAtIso).toBe("2026-05-01T10:00:00.000Z");
  });

  it("saves lifecycle into dedicated sheet", async () => {
    const sheet = createMockSheet([]);
    const result = await saveDeloadLifecycle({ status: "active", endsAtIso: "2026-05-09T10:00:00.000Z" }, createMockDoc({ DeloadLifecycle: sheet }));
    expect(result.isOk()).toBe(true);
    expect(sheet.addRow).toHaveBeenCalledWith({
      data: JSON.stringify({ status: "active", endsAtIso: "2026-05-09T10:00:00.000Z" }),
    });
  });
});
