import { err, ok } from "neverthrow";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  loadDeloadPhaseMock,
  saveDeloadPhaseMock,
  createRepositoryMock,
  getDocMock,
  handleAuthErrorMock,
} = vi.hoisted(() => ({
  loadDeloadPhaseMock: vi.fn(),
  saveDeloadPhaseMock: vi.fn(),
  createRepositoryMock: vi.fn(),
  getDocMock: vi.fn(),
  handleAuthErrorMock: vi.fn(),
}));

vi.mock("@vueuse/core", () => ({
  useDebounceFn: (fn: (...args: unknown[]) => unknown) => fn,
}));

vi.mock("@/modules/deload/application", () => ({
  loadDeloadPhase: loadDeloadPhaseMock,
  saveDeloadPhase: saveDeloadPhaseMock,
}));

vi.mock("@/modules/platform/presentation", () => ({
  useSpreadsheetRepositoryFactory: vi.fn(() => ({
    createRepository: createRepositoryMock,
    getDoc: getDocMock,
  })),
}));

vi.mock("@/shared/presentation/composables/useAuthErrorHandler", () => ({
  useAuthErrorHandler: vi.fn(() => ({
    handleAuthError: handleAuthErrorMock,
  })),
}));

import { useDeloadStore } from "./deloadStore";

describe("useDeloadStore", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    saveDeloadPhaseMock.mockResolvedValue(ok(undefined));
  });

  it("sets loading false when no spreadsheet doc is available", async () => {
    getDocMock.mockReturnValue(null);

    const store = useDeloadStore();
    await store.load();

    expect(store.isLoading).toBe(false);
    expect(loadDeloadPhaseMock).not.toHaveBeenCalled();
  });

  it("loads phase and maps auth errors through handler", async () => {
    const doc = { id: "doc" };
    const repository = { id: "repo" };
    createRepositoryMock.mockReturnValue(repository);

    // Prevent automatic load during store creation by mocking getDoc to return null initially
    getDocMock.mockReturnValue(null);
    const store = useDeloadStore();

    // Now set up getDoc and load mock for the manual load test
    getDocMock.mockReturnValue(doc);
    loadDeloadPhaseMock.mockResolvedValueOnce(
      ok({
        startedAt: "2026-01-01T00:00:00.000Z",
        endsAt: "2026-01-08T00:00:00.000Z",
        fatigueRiskScore: 3,
        triggeredBy: ["volumeSpike"],
      }),
    );

    await store.load();

    expect(loadDeloadPhaseMock).toHaveBeenCalledWith(repository);
    expect(store.phase?.startedAt).toBe("2026-01-01T00:00:00.000Z");
    expect(saveDeloadPhaseMock).not.toHaveBeenCalled();

    loadDeloadPhaseMock.mockResolvedValueOnce(err("auth-failed"));
    await store.load();

    expect(handleAuthErrorMock).toHaveBeenCalledWith("deload-phase-load");
  });
});
