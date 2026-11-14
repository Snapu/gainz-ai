import type { GoogleSpreadsheet } from "google-spreadsheet";
import { okAsync } from "neverthrow";
import { createPinia, type Pinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick, ref } from "vue";
import { useMetricsStore } from "./metricsStore";

const reactiveDoc = ref<GoogleSpreadsheet | null>(null);

vi.mock("@/modules/auth/presentation/composables/useAuthErrorHandler", () => ({
  useAuthErrorHandler: () => ({
    handleAuthError: vi.fn(async () => false),
  }),
}));

vi.mock("@/modules/profile/application", () => ({
  loadMetrics: vi.fn(),
  saveMetrics: vi.fn(),
}));

vi.mock("@/modules/platform/presentation", () => ({
  useSpreadsheetRepositoryFactory: vi.fn(() => ({
    getDoc: () => reactiveDoc.value,
    createRepository: (doc?: GoogleSpreadsheet) => ((doc ?? reactiveDoc.value) ? {} : null),
  })),
}));

import { loadMetrics } from "@/modules/profile/application";

describe("useMetricsStore", () => {
  let pinia: Pinia;

  beforeEach(() => {
    pinia = createPinia();
    setActivePinia(pinia);
    vi.clearAllMocks();
    reactiveDoc.value = null;
  });

  afterEach(() => {
    (pinia as unknown as { _e?: { stop?: () => void } })._e?.stop?.();
  });

  it("loads metrics on login and clears stale metrics on logout", async () => {
    vi.mocked(loadMetrics).mockReturnValueOnce(
      okAsync({
        Chest: { muscleGroup: "Chest", personalMAV: 14, lastUpdated: "2026-11-13T10:00:00Z" },
      } as never),
    );

    const store = useMetricsStore();
    reactiveDoc.value = {} as GoogleSpreadsheet;
    await vi.waitFor(() => expect(store.metrics.Chest?.personalMAV).toBe(14));

    reactiveDoc.value = null;
    await nextTick();

    expect(store.metrics).toEqual({});
    expect(store.isLoading).toBe(false);
  });
});
