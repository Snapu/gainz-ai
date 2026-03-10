import type { GoogleSpreadsheet } from "google-spreadsheet";
import { err, ok } from "neverthrow";
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

const mockSpreadsheetStore = (doc: GoogleSpreadsheet | null) => ({
  doc,
});

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

  describe("Profile data NOT saved to localStorage", () => {
    it("should not save userProfile ref to localStorage", async () => {
      vi.mocked(migrateFromLocalStorage).mockResolvedValue(ok("no-data"));
      vi.mocked(loadUserProfile).mockResolvedValue(ok(null));

      const store = useUserProfileStore();

      store.updateProfile({
        age: 25,
        heightCm: 180,
        fitnessLevel: "intermediate",
      });

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(mockLocalStorage.getItem("userProfile")).toBeNull();
    });
  });

  describe("hasCompletedSetup flag IS saved to localStorage", () => {
    it("should save hasCompletedSetup to localStorage", async () => {
      vi.mocked(migrateFromLocalStorage).mockResolvedValue(ok("no-data"));
      vi.mocked(loadUserProfile).mockResolvedValue(ok(null));

      const store = useUserProfileStore();

      store.hasCompletedSetup = true;

      await new Promise((resolve) => setTimeout(resolve, 50));

      const stored = mockLocalStorage.getItem("hasCompletedSetup");
      expect(stored).toBe("true");
    });

    it("should persist hasCompletedSetup across store recreations", async () => {
      vi.mocked(migrateFromLocalStorage).mockResolvedValue(ok("no-data"));
      vi.mocked(loadUserProfile).mockResolvedValue(ok(null));

      const store1 = useUserProfileStore();
      store1.hasCompletedSetup = true;
      await new Promise((resolve) => setTimeout(resolve, 50));

      setActivePinia(createPinia());
      vi.mocked(useSpreadsheetStore).mockReturnValue(
        mockSpreadsheetStore(mockDoc) as ReturnType<typeof useSpreadsheetStore>,
      );
      vi.mocked(migrateFromLocalStorage).mockResolvedValue(ok("no-data"));
      vi.mocked(loadUserProfile).mockResolvedValue(ok(null));

      const store2 = useUserProfileStore();

      expect(store2.hasCompletedSetup).toBe(true);
    });
  });

  describe("completeSetup() sets flag on success", () => {
    it("should set hasCompletedSetup to true on successful save", async () => {
      vi.mocked(migrateFromLocalStorage).mockResolvedValue(ok("no-data"));
      vi.mocked(loadUserProfile).mockResolvedValue(ok(null));
      vi.mocked(saveUserProfile).mockResolvedValue(ok(undefined));

      const store = useUserProfileStore();
      store.updateProfile({ age: 25 });

      const result = await store.completeSetup();

      expect(result.isOk()).toBe(true);
      expect(store.hasCompletedSetup).toBe(true);
      expect(mockLocalStorage.getItem("hasCompletedSetup")).toBe("true");
    });

    it("should call saveUserProfile with current profile data", async () => {
      vi.mocked(migrateFromLocalStorage).mockResolvedValue(ok("no-data"));
      vi.mocked(loadUserProfile).mockResolvedValue(ok(null));
      vi.mocked(saveUserProfile).mockResolvedValue(ok(undefined));

      const store = useUserProfileStore();
      const profileData = {
        age: 30,
        heightCm: 175,
        fitnessLevel: "advanced" as const,
      };
      store.updateProfile(profileData);

      await store.completeSetup();

      expect(saveUserProfile).toHaveBeenCalledWith(expect.objectContaining(profileData), mockDoc);
    });
  });

  describe("completeSetup() does NOT set flag on failure", () => {
    it("should not set hasCompletedSetup on save failure", async () => {
      vi.mocked(migrateFromLocalStorage).mockResolvedValue(ok("no-data"));
      vi.mocked(loadUserProfile).mockResolvedValue(ok(null));
      vi.mocked(saveUserProfile).mockResolvedValue(err("spreadsheet-save-failed"));

      const store = useUserProfileStore();
      store.updateProfile({ age: 25 });

      const result = await store.completeSetup();

      expect(result.isErr()).toBe(true);
      expect(store.hasCompletedSetup).toBe(false);
      expect(mockLocalStorage.getItem("hasCompletedSetup")).toBe("false");
    });

    it("should return error when no spreadsheet document available", async () => {
      vi.mocked(useSpreadsheetStore).mockReturnValue(
        mockSpreadsheetStore(null) as ReturnType<typeof useSpreadsheetStore>,
      );

      setActivePinia(createPinia());
      const store = useUserProfileStore();
      store.updateProfile({ age: 25 });

      const result = await store.completeSetup();

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error).toBe("no-spreadsheet-document");
      }
      expect(store.hasCompletedSetup).toBe(false);
    });
  });

  describe("Auto-detection sets flag when profile has data", () => {
    it("should auto-set hasCompletedSetup when profile data loaded from spreadsheet", async () => {
      vi.mocked(migrateFromLocalStorage).mockResolvedValue(ok("no-data"));
      const profileData: UserProfile = {
        age: 28,
        heightCm: 172,
        fitnessGoal: ["build_muscle"],
        fitnessLevel: "intermediate",
      };
      vi.mocked(loadUserProfile).mockResolvedValue(ok(profileData));

      setActivePinia(createPinia());
      vi.mocked(useSpreadsheetStore).mockReturnValue(
        mockSpreadsheetStore(mockDoc) as ReturnType<typeof useSpreadsheetStore>,
      );

      const store = useUserProfileStore();

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(store.hasCompletedSetup).toBe(true);
    });

    it("should detect various profile fields as data", async () => {
      vi.mocked(migrateFromLocalStorage).mockResolvedValue(ok("no-data"));

      vi.mocked(loadUserProfile).mockResolvedValue(ok({ age: 25 }));
      setActivePinia(createPinia());
      vi.mocked(useSpreadsheetStore).mockReturnValue(
        mockSpreadsheetStore(mockDoc) as ReturnType<typeof useSpreadsheetStore>,
      );
      let store = useUserProfileStore();
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(store.hasCompletedSetup).toBe(true);

      setActivePinia(createPinia());
      vi.mocked(useSpreadsheetStore).mockReturnValue(
        mockSpreadsheetStore(mockDoc) as ReturnType<typeof useSpreadsheetStore>,
      );
      vi.mocked(loadUserProfile).mockResolvedValue(ok({ fitnessGoal: ["build_muscle"] }));
      store = useUserProfileStore();
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(store.hasCompletedSetup).toBe(true);

      setActivePinia(createPinia());
      vi.mocked(useSpreadsheetStore).mockReturnValue(
        mockSpreadsheetStore(mockDoc) as ReturnType<typeof useSpreadsheetStore>,
      );
      vi.mocked(loadUserProfile).mockResolvedValue(ok({ workoutLocation: "gym" }));
      store = useUserProfileStore();
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(store.hasCompletedSetup).toBe(true);
    });
  });

  describe("Auto-detection skips when profile is empty", () => {
    it("should NOT set hasCompletedSetup when profile is empty", async () => {
      vi.mocked(migrateFromLocalStorage).mockResolvedValue(ok("no-data"));
      vi.mocked(loadUserProfile).mockResolvedValue(ok({}));

      setActivePinia(createPinia());
      vi.mocked(useSpreadsheetStore).mockReturnValue(
        mockSpreadsheetStore(mockDoc) as ReturnType<typeof useSpreadsheetStore>,
      );

      const store = useUserProfileStore();

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(store.hasCompletedSetup).toBe(false);
    });

    it("should NOT set hasCompletedSetup when profile returns null", async () => {
      vi.mocked(migrateFromLocalStorage).mockResolvedValue(ok("no-data"));
      vi.mocked(loadUserProfile).mockResolvedValue(ok(null));

      setActivePinia(createPinia());
      vi.mocked(useSpreadsheetStore).mockReturnValue(
        mockSpreadsheetStore(mockDoc) as ReturnType<typeof useSpreadsheetStore>,
      );

      const store = useUserProfileStore();

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(store.hasCompletedSetup).toBe(false);
    });

    it("should NOT set flag when profile has only empty arrays", async () => {
      vi.mocked(migrateFromLocalStorage).mockResolvedValue(ok("no-data"));
      vi.mocked(loadUserProfile).mockResolvedValue(
        ok({
          fitnessGoal: [],
          equipmentAccess: [],
          freeUserInput: undefined,
        }),
      );

      setActivePinia(createPinia());
      vi.mocked(useSpreadsheetStore).mockReturnValue(
        mockSpreadsheetStore(mockDoc) as ReturnType<typeof useSpreadsheetStore>,
      );

      const store = useUserProfileStore();

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(store.hasCompletedSetup).toBe(false);
    });
  });
});
