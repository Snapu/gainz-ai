import type { GoogleSpreadsheet } from "google-spreadsheet";
import { ok } from "neverthrow";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { type UserProfile, useUserProfileStore } from "./userProfile";

const createMockLocalStorage = () => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
};

const mockSpreadsheetStore = (doc: GoogleSpreadsheet | null) => ({ doc });

vi.mock("@/services/userProfile", () => ({
  loadUserProfile: vi.fn(),
  migrateFromLocalStorage: vi.fn(),
  saveUserProfile: vi.fn(),
}));

vi.mock("@/stores/spreadsheet", () => ({
  useSpreadsheetStore: vi.fn(),
}));

import { loadUserProfile, migrateFromLocalStorage, saveUserProfile } from "@/services/userProfile";
import { useSpreadsheetStore } from "@/stores/spreadsheet";

describe("useUserProfileStore", () => {
  let mockLocalStorage: ReturnType<typeof createMockLocalStorage>;
  let mockDoc: GoogleSpreadsheet;

  beforeEach(() => {
    mockLocalStorage = createMockLocalStorage();
    vi.stubGlobal("localStorage", mockLocalStorage);
    setActivePinia(createPinia());
    mockDoc = {} as GoogleSpreadsheet;
    vi.mocked(useSpreadsheetStore).mockReturnValue(
      mockSpreadsheetStore(mockDoc) as ReturnType<typeof useSpreadsheetStore>,
    );
    vi.clearAllMocks();
  });

  it("does not save the profile blob to localStorage", async () => {
    vi.mocked(migrateFromLocalStorage).mockResolvedValue(ok("no-data"));
    vi.mocked(loadUserProfile).mockResolvedValue(ok(null));

    const store = useUserProfileStore();
    store.updateProfile({ age: 25, heightCm: 180, fitnessLevel: "intermediate" });

    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(mockLocalStorage.getItem("userProfile")).toBeNull();
  });

  it("persists hasCompletedSetup after successful save", async () => {
    vi.mocked(migrateFromLocalStorage).mockResolvedValue(ok("no-data"));
    vi.mocked(loadUserProfile).mockResolvedValue(ok(null));
    vi.mocked(saveUserProfile).mockResolvedValue(ok(undefined));

    const store = useUserProfileStore();
    store.updateProfile({ age: 25 });

    await new Promise((resolve) => setTimeout(resolve, 2000));
    expect(store.hasCompletedSetup).toBe(true);
  });

  it("auto-detects setup completion from loaded profile data", async () => {
    vi.mocked(migrateFromLocalStorage).mockResolvedValue(ok("no-data"));
    const profileData: UserProfile = { age: 28, heightCm: 172, fitnessGoal: ["build_muscle"] };
    vi.mocked(loadUserProfile).mockResolvedValue(ok(profileData));

    const store = useUserProfileStore();
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(store.hasCompletedSetup).toBe(true);
  });

  it("keeps setup incomplete for empty profiles", async () => {
    vi.mocked(migrateFromLocalStorage).mockResolvedValue(ok("no-data"));
    vi.mocked(loadUserProfile).mockResolvedValue(ok({}));

    const store = useUserProfileStore();
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(store.hasCompletedSetup).toBe(false);
  });
});
