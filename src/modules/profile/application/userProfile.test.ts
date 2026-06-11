import type { GoogleSpreadsheet } from "google-spreadsheet";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  loadUserProfile,
  migrateFromLocalStorage,
  saveUserProfile,
} from "@/modules/profile/application";
import { type UserProfile, UserProfileSchema } from "@/modules/profile/domain";
import { createUserProfileRepository } from "@/modules/profile/infrastructure";

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

const createMockSheet = (rows: unknown[] = [], headerValues?: string[]) => {
  const sheet = {
    headerValues: headerValues ?? [
      "age",
      "heightCm",
      "weightKg",
      "fitnessGoal",
      "fitnessLevel",
      "workoutDaysPerWeek",
      "workoutLocation",
      "equipmentAccess",
      "freeUserInput",
    ],
    loadHeaderRow: vi.fn().mockResolvedValue(undefined),
    getRows: vi.fn().mockResolvedValue(rows),
    addRow: vi.fn().mockResolvedValue({}),
    setHeaderRow: vi.fn().mockImplementation(async (headers: string[]) => {
      sheet.headerValues = headers;
    }),
  };
  return sheet;
};

const createMockDoc = (sheet: unknown = null) => {
  return {
    sheetsByTitle: { UserProfile: sheet },
    addSheet: vi.fn().mockResolvedValue(createMockSheet()),
  } as unknown as GoogleSpreadsheet;
};

const createMockRow = (data: Record<string, string>) => ({
  toObject: () => data,
  assign: vi.fn(),
  save: vi.fn().mockResolvedValue(undefined),
});

describe("userProfile service", () => {
  describe("UserProfileSchema", () => {
    it("parses valid profile rows", () => {
      const row = {
        age: "25",
        heightCm: "180",
        weightKg: "75",
        fitnessGoal: "build_muscle,lose_fat",
        fitnessLevel: "intermediate",
        workoutDaysPerWeek: "4",
        workoutLocation: "gym",
        equipmentAccess: "dumbbells,barbell_rack",
        freeUserInput: "test notes",
      };

      const result = UserProfileSchema.safeParse(row);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.fitnessGoal).toEqual(["build_muscle", "lose_fat"]);
        expect(result.data.equipmentAccess).toEqual(["dumbbells", "barbell_rack"]);
      }
    });

    it("handles empty fields gracefully", () => {
      const result = UserProfileSchema.safeParse({
        age: "",
        heightCm: "",
        weightKg: "",
        fitnessGoal: "",
        fitnessLevel: "",
        workoutDaysPerWeek: "",
        workoutLocation: "",
        equipmentAccess: "",
        freeUserInput: "",
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.age).toBeUndefined();
        expect(result.data.fitnessGoal).toBeUndefined();
        expect(result.data.freeUserInput).toBeUndefined();
      }
    });
  });

  describe("loadUserProfile", () => {
    it("returns null for empty sheet", async () => {
      const result = await loadUserProfile(
        createUserProfileRepository(createMockDoc(createMockSheet([]))),
      );
      expect(result.isOk()).toBe(true);
      if (result.isOk()) expect(result.value).toBeNull();
    });

    it("loads existing profile", async () => {
      const row = createMockRow({
        age: "30",
        heightCm: "175",
        weightKg: "80",
        fitnessGoal: "build_muscle",
        fitnessLevel: "advanced",
        workoutDaysPerWeek: "5",
        workoutLocation: "gym",
        equipmentAccess: "dumbbells,barbell_rack,bench",
        freeUserInput: "notes",
      });
      const result = await loadUserProfile(
        createUserProfileRepository(createMockDoc(createMockSheet([row]))),
      );
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toMatchObject({
          age: 30,
          weightKg: 80,
          fitnessGoal: ["build_muscle"],
          freeUserInput: "notes",
        });
      }
    });

    it("creates the sheet if missing", async () => {
      const doc = createMockDoc(null);
      const result = await loadUserProfile(createUserProfileRepository(doc));
      expect(doc.addSheet).toHaveBeenCalledWith({
        title: "UserProfile",
        headerValues: [
          "age",
          "heightCm",
          "weightKg",
          "fitnessGoal",
          "fitnessLevel",
          "workoutDaysPerWeek",
          "workoutLocation",
          "equipmentAccess",
          "freeUserInput",
        ],
      });
      expect(result.isOk()).toBe(true);
    });
  });

  describe("saveUserProfile", () => {
    it("creates a row in an empty sheet", async () => {
      const mockSheet = createMockSheet([]);
      const profile: UserProfile = {
        age: 25,
        heightCm: 180,
        weightKg: 75,
        fitnessGoal: ["build_muscle"],
        fitnessLevel: "intermediate",
        workoutDaysPerWeek: 4,
        workoutLocation: "gym",
        equipmentAccess: ["dumbbells"],
        freeUserInput: "test",
      };

      const result = await saveUserProfile(
        profile,
        createUserProfileRepository(createMockDoc(mockSheet)),
      );
      expect(result.isOk()).toBe(true);
      expect(mockSheet.addRow).toHaveBeenCalledWith({
        age: "25",
        heightCm: "180",
        weightKg: "75",
        fitnessGoal: "build_muscle",
        fitnessLevel: "intermediate",
        workoutDaysPerWeek: "4",
        workoutLocation: "gym",
        equipmentAccess: "dumbbells",
        freeUserInput: "test",
      });
    });

    it("updates existing row", async () => {
      const existingRow = createMockRow({ age: "20" });
      const mockSheet = createMockSheet([existingRow]);
      const result = await saveUserProfile(
        { age: 25 },
        createUserProfileRepository(createMockDoc(mockSheet)),
      );
      expect(result.isOk()).toBe(true);
      expect(existingRow.assign).toHaveBeenCalledWith({
        age: "25",
        heightCm: "",
        weightKg: "",
        fitnessGoal: "",
        fitnessLevel: "",
        workoutDaysPerWeek: "",
        workoutLocation: "",
        equipmentAccess: "",
        freeUserInput: "",
      });
    });
  });

  describe("migrateFromLocalStorage", () => {
    let mockLocalStorage: ReturnType<typeof createMockLocalStorage>;

    beforeEach(() => {
      mockLocalStorage = createMockLocalStorage();
      vi.stubGlobal("localStorage", mockLocalStorage);
    });

    it("migrates profile + lifecycle out of localStorage", async () => {
      mockLocalStorage.setItem(
        "userProfile",
        JSON.stringify({
          age: 30,
          fitnessGoal: ["build_muscle"],
          deloadLifecycle: { status: "active", endsAtIso: "2026-05-09T10:00:00.000Z" },
          apiKey: "secret-api-key",
        }),
      );

      const mockSheet = createMockSheet([]);
      const result = await migrateFromLocalStorage(
        createUserProfileRepository(createMockDoc(mockSheet)),
      );

      expect(result.isOk()).toBe(true);
      if (result.isOk()) expect(result.value).toBe("migrated");
      expect(mockSheet.addRow).toHaveBeenCalled();
      expect(mockLocalStorage.getItem("userProfile:apiKey")).toBe("secret-api-key");
      expect(mockLocalStorage.getItem("userProfile")).toBeNull();
    });
  });
});
