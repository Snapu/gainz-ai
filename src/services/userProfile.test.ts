import type { GoogleSpreadsheet } from "google-spreadsheet";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  loadUserProfile,
  migrateFromLocalStorage,
  saveUserProfile,
  UserProfileSchema,
  type UserProfile,
} from "./userProfile";

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

const createMockSheet = (rows: any[] = []) => {
  return {
    loadHeaderRow: vi.fn().mockResolvedValue(undefined),
    getRows: vi.fn().mockResolvedValue(rows),
    addRow: vi.fn().mockResolvedValue({}),
  };
};

const createMockDoc = (sheet: any = null) => {
  return {
    sheetsByTitle: { UserProfile: sheet },
    addSheet: vi.fn().mockResolvedValue(createMockSheet()),
  } as unknown as GoogleSpreadsheet;
};

const createMockRow = (data: Record<string, string>) => {
  return {
    toObject: () => data,
    assign: vi.fn(),
    save: vi.fn().mockResolvedValue(undefined),
  };
};

describe("userProfile service", () => {
  describe("UserProfileSchema", () => {
    it("should parse valid profile from spreadsheet row", () => {
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
        expect(result.data.age).toBe(25);
        expect(result.data.heightCm).toBe(180);
        expect(result.data.weightKg).toBe(75);
        expect(result.data.fitnessGoal).toEqual(["build_muscle", "lose_fat"]);
        expect(result.data.fitnessLevel).toBe("intermediate");
        expect(result.data.workoutDaysPerWeek).toBe(4);
        expect(result.data.workoutLocation).toBe("gym");
        expect(result.data.equipmentAccess).toEqual(["dumbbells", "barbell_rack"]);
        expect(result.data.freeUserInput).toBe("test notes");
      }
    });

    it("should handle empty fields gracefully", () => {
      const row = {
        age: "",
        heightCm: "",
        weightKg: "",
        fitnessGoal: "",
        fitnessLevel: "",
        workoutDaysPerWeek: "",
        workoutLocation: "",
        equipmentAccess: "",
        freeUserInput: "",
      };

      const result = UserProfileSchema.safeParse(row);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.age).toBeUndefined();
        expect(result.data.heightCm).toBeUndefined();
        expect(result.data.weightKg).toBeUndefined();
        expect(result.data.fitnessGoal).toBeUndefined();
        expect(result.data.fitnessLevel).toBeUndefined();
        expect(result.data.workoutDaysPerWeek).toBeUndefined();
        expect(result.data.workoutLocation).toBeUndefined();
        expect(result.data.equipmentAccess).toBeUndefined();
        expect(result.data.freeUserInput).toBeUndefined();
      }
    });

    it("should parse numbers from strings", () => {
      const row = {
        age: "30",
        heightCm: "175.5",
        weightKg: "82.3",
        workoutDaysPerWeek: "5",
        fitnessGoal: "",
        fitnessLevel: "",
        workoutLocation: "",
        equipmentAccess: "",
        freeUserInput: "",
      };

      const result = UserProfileSchema.safeParse(row);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.age).toBe(30);
        expect(result.data.heightCm).toBe(175.5);
        expect(result.data.weightKg).toBe(82.3);
        expect(result.data.workoutDaysPerWeek).toBe(5);
      }
    });

    it("should handle comma-separated arrays with whitespace", () => {
      const row = {
        age: "",
        heightCm: "",
        weightKg: "",
        fitnessGoal: " build_muscle , lose_fat , general_fitness ",
        fitnessLevel: "",
        workoutDaysPerWeek: "",
        workoutLocation: "",
        equipmentAccess: " dumbbells , barbell_rack , bench ",
        freeUserInput: "",
      };

      const result = UserProfileSchema.safeParse(row);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.fitnessGoal).toEqual(["build_muscle", "lose_fat", "general_fitness"]);
        expect(result.data.equipmentAccess).toEqual(["dumbbells", "barbell_rack", "bench"]);
      }
    });

    it("should handle single item in comma-separated field", () => {
      const row = {
        age: "",
        heightCm: "",
        weightKg: "",
        fitnessGoal: "build_muscle",
        fitnessLevel: "",
        workoutDaysPerWeek: "",
        workoutLocation: "",
        equipmentAccess: "bodyweight",
        freeUserInput: "",
      };

      const result = UserProfileSchema.safeParse(row);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.fitnessGoal).toEqual(["build_muscle"]);
        expect(result.data.equipmentAccess).toEqual(["bodyweight"]);
      }
    });

    it("should handle invalid number strings as undefined", () => {
      const row = {
        age: "not-a-number",
        heightCm: "",
        weightKg: "",
        fitnessGoal: "",
        fitnessLevel: "",
        workoutDaysPerWeek: "abc",
        workoutLocation: "",
        equipmentAccess: "",
        freeUserInput: "",
      };

      const result = UserProfileSchema.safeParse(row);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.age).toBeUndefined();
        expect(result.data.workoutDaysPerWeek).toBeUndefined();
      }
    });

    it("should accept all valid fitness goals", () => {
      const goals = [
        "build_muscle",
        "lose_fat",
        "improve_endurance",
        "increase_mobility",
        "general_fitness",
      ];

      for (const goal of goals) {
        const row = {
          age: "",
          heightCm: "",
          weightKg: "",
          fitnessGoal: goal,
          fitnessLevel: "",
          workoutDaysPerWeek: "",
          workoutLocation: "",
          equipmentAccess: "",
          freeUserInput: "",
        };

        const result = UserProfileSchema.safeParse(row);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.fitnessGoal).toEqual([goal]);
        }
      }
    });

    it("should accept all valid fitness levels", () => {
      const levels = ["beginner", "intermediate", "advanced"];

      for (const level of levels) {
        const row = {
          age: "",
          heightCm: "",
          weightKg: "",
          fitnessGoal: "",
          fitnessLevel: level,
          workoutDaysPerWeek: "",
          workoutLocation: "",
          equipmentAccess: "",
          freeUserInput: "",
        };

        const result = UserProfileSchema.safeParse(row);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.fitnessLevel).toBe(level);
        }
      }
    });

    it("should accept all valid workout locations", () => {
      const locations = ["gym", "home", "both"];

      for (const location of locations) {
        const row = {
          age: "",
          heightCm: "",
          weightKg: "",
          fitnessGoal: "",
          fitnessLevel: "",
          workoutDaysPerWeek: "",
          workoutLocation: location,
          equipmentAccess: "",
          freeUserInput: "",
        };

        const result = UserProfileSchema.safeParse(row);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.workoutLocation).toBe(location);
        }
      }
    });

    it("should accept all valid equipment options", () => {
      const equipment = [
        "bodyweight",
        "dumbbells",
        "barbell_rack",
        "resistance_bands",
        "kettlebells",
        "pull_up_bar",
        "dip_bar",
        "gymnastic_rings",
        "cable_machine",
        "cardio_machine",
        "suspension_trainer",
        "medicine_ball",
        "bench",
      ];

      const row = {
        age: "",
        heightCm: "",
        weightKg: "",
        fitnessGoal: "",
        fitnessLevel: "",
        workoutDaysPerWeek: "",
        workoutLocation: "",
        equipmentAccess: equipment.join(","),
        freeUserInput: "",
      };

      const result = UserProfileSchema.safeParse(row);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.equipmentAccess).toEqual(equipment);
      }
    });
  });

  describe("loadUserProfile", () => {
    it("should return null for empty sheet", async () => {
      const mockSheet = createMockSheet([]);
      const mockDoc = createMockDoc(mockSheet);

      const result = await loadUserProfile(mockDoc);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toBeNull();
      }
      expect(mockSheet.getRows).toHaveBeenCalled();
    });

    it("should load and parse existing profile", async () => {
      const rowData = {
        age: "30",
        heightCm: "175",
        weightKg: "80",
        fitnessGoal: "build_muscle",
        fitnessLevel: "advanced",
        workoutDaysPerWeek: "5",
        workoutLocation: "gym",
        equipmentAccess: "dumbbells,barbell_rack,bench",
        freeUserInput: "notes",
      };
      const mockRow = createMockRow(rowData);
      const mockSheet = createMockSheet([mockRow]);
      const mockDoc = createMockDoc(mockSheet);

      const result = await loadUserProfile(mockDoc);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toMatchObject({
          age: 30,
          heightCm: 175,
          weightKg: 80,
          fitnessGoal: ["build_muscle"],
          fitnessLevel: "advanced",
          workoutDaysPerWeek: 5,
          workoutLocation: "gym",
          equipmentAccess: ["dumbbells", "barbell_rack", "bench"],
          freeUserInput: "notes",
        });
      }
    });

    it("should create sheet if it does not exist", async () => {
      const mockDoc = createMockDoc(null);

      const result = await loadUserProfile(mockDoc);

      expect(mockDoc.addSheet).toHaveBeenCalledWith({
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

    it("should return error on spreadsheet access failure", async () => {
      const mockSheet = createMockSheet();
      mockSheet.getRows.mockRejectedValue(new Error("Network error"));
      const mockDoc = createMockDoc(mockSheet);

      const result = await loadUserProfile(mockDoc);

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error).toBe("load-failed");
      }
    });

    it("should return error on invalid data parse", async () => {
      const invalidRow = createMockRow({
        age: "25",
        heightCm: "180",
        weightKg: "75",
        fitnessGoal: "invalid_goal",
        fitnessLevel: "intermediate",
        workoutDaysPerWeek: "4",
        workoutLocation: "gym",
        equipmentAccess: "dumbbells",
        freeUserInput: "",
      });
      const mockSheet = createMockSheet([invalidRow]);
      const mockDoc = createMockDoc(mockSheet);

      const result = await loadUserProfile(mockDoc);

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error).toBe("parse-data-failed");
      }
    });
  });

  describe("saveUserProfile", () => {
    it("should create new row in empty sheet", async () => {
      const mockSheet = createMockSheet([]);
      const mockDoc = createMockDoc(mockSheet);
      const profile: UserProfile = {
        age: 25,
        heightCm: 180,
        weightKg: 75,
        fitnessGoal: ["build_muscle"],
        fitnessLevel: "intermediate" as const,
        workoutDaysPerWeek: 4,
        workoutLocation: "gym" as const,
        equipmentAccess: ["dumbbells"],
        freeUserInput: "test",
      };

      const result = await saveUserProfile(profile, mockDoc);

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

    it("should update existing row", async () => {
      const existingRow = createMockRow({
        age: "20",
        heightCm: "170",
        weightKg: "65",
        fitnessGoal: "lose_fat",
        fitnessLevel: "beginner",
        workoutDaysPerWeek: "3",
        workoutLocation: "home",
        equipmentAccess: "bodyweight",
        freeUserInput: "old",
      });
      const mockSheet = createMockSheet([existingRow]);
      const mockDoc = createMockDoc(mockSheet);
      const profile: UserProfile = {
        age: 25,
        heightCm: 180,
        weightKg: 75,
        fitnessGoal: ["build_muscle"],
        fitnessLevel: "intermediate" as const,
        workoutDaysPerWeek: 4,
        workoutLocation: "gym" as const,
        equipmentAccess: ["dumbbells"],
        freeUserInput: "updated",
      };

      const result = await saveUserProfile(profile, mockDoc);

      expect(result.isOk()).toBe(true);
      expect(existingRow.assign).toHaveBeenCalledWith({
        age: "25",
        heightCm: "180",
        weightKg: "75",
        fitnessGoal: "build_muscle",
        fitnessLevel: "intermediate",
        workoutDaysPerWeek: "4",
        workoutLocation: "gym",
        equipmentAccess: "dumbbells",
        freeUserInput: "updated",
      });
      expect(existingRow.save).toHaveBeenCalled();
    });

    it("should create sheet if it does not exist", async () => {
      const mockDoc = createMockDoc(null);
      const profile = {
        age: 25,
        fitnessGoal: [],
        equipmentAccess: [],
      };

      const result = await saveUserProfile(profile, mockDoc);

      expect(mockDoc.addSheet).toHaveBeenCalled();
      expect(result.isOk()).toBe(true);
    });

    it("should return error on save failure", async () => {
      const mockSheet = createMockSheet([]);
      mockSheet.addRow.mockRejectedValue(new Error("Save error"));
      const mockDoc = createMockDoc(mockSheet);
      const profile = {
        age: 25,
        fitnessGoal: [],
        equipmentAccess: [],
      };

      const result = await saveUserProfile(profile, mockDoc);

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error).toBe("save-failed");
      }
    });
  });

  describe("migrateFromLocalStorage", () => {
    let mockLocalStorage: ReturnType<typeof createMockLocalStorage>;

    beforeEach(() => {
      mockLocalStorage = createMockLocalStorage();
      // @ts-expect-error - Replace global localStorage with mock
      global.localStorage = mockLocalStorage;
    });

    it("should migrate localStorage profile to spreadsheet", async () => {
      const oldProfile = {
        age: 30,
        heightCm: 175,
        weightKg: 80,
        fitnessGoal: ["build_muscle"],
        fitnessLevel: "advanced",
        workoutDaysPerWeek: 5,
        workoutLocation: "gym",
        equipmentAccess: ["dumbbells", "barbell_rack"],
        freeUserInput: "notes",
        apiKey: "secret-api-key",
      };
      mockLocalStorage.setItem("userProfile", JSON.stringify(oldProfile));

      const mockSheet = createMockSheet([]);
      const mockDoc = createMockDoc(mockSheet);

      const result = await migrateFromLocalStorage(mockDoc);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toBe("migrated");
      }
      expect(mockLocalStorage.getItem("userProfile:apiKey")).toBe("secret-api-key");
      expect(mockLocalStorage.getItem("userProfile")).toBeNull();
      expect(mockSheet.addRow).toHaveBeenCalled();
    });

    it("should skip migration when spreadsheet already has data", async () => {
      mockLocalStorage.setItem("userProfile", JSON.stringify({ age: 25 }));

      const existingRow = createMockRow({
        age: "30",
        heightCm: "175",
        weightKg: "80",
        fitnessGoal: "build_muscle",
        fitnessLevel: "advanced",
        workoutDaysPerWeek: "5",
        workoutLocation: "gym",
        equipmentAccess: "dumbbells",
        freeUserInput: "",
      });
      const mockSheet = createMockSheet([existingRow]);
      const mockDoc = createMockDoc(mockSheet);

      const result = await migrateFromLocalStorage(mockDoc);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toBe("skipped");
      }
      expect(mockLocalStorage.getItem("userProfile")).not.toBeNull();
      expect(mockSheet.addRow).not.toHaveBeenCalled();
    });

    it("should return no-data when no localStorage data exists", async () => {
      const mockSheet = createMockSheet([]);
      const mockDoc = createMockDoc(mockSheet);

      const result = await migrateFromLocalStorage(mockDoc);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toBe("no-data");
      }
      expect(mockSheet.addRow).not.toHaveBeenCalled();
    });

    it("should handle profile without apiKey", async () => {
      const oldProfile = {
        age: 25,
        heightCm: 180,
        weightKg: 75,
        fitnessGoal: ["build_muscle"],
      };
      mockLocalStorage.setItem("userProfile", JSON.stringify(oldProfile));

      const mockSheet = createMockSheet([]);
      const mockDoc = createMockDoc(mockSheet);

      const result = await migrateFromLocalStorage(mockDoc);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toBe("migrated");
      }
      expect(mockLocalStorage.getItem("userProfile:apiKey")).toBeNull();
      expect(mockLocalStorage.getItem("userProfile")).toBeNull();
    });

    it("should return error on invalid JSON in localStorage", async () => {
      mockLocalStorage.setItem("userProfile", "invalid-json{");

      const mockSheet = createMockSheet([]);
      const mockDoc = createMockDoc(mockSheet);

      const result = await migrateFromLocalStorage(mockDoc);

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error).toBe("migration-failed");
      }
    });

    it("should return error when save to spreadsheet fails during migration", async () => {
      mockLocalStorage.setItem("userProfile", JSON.stringify({ age: 25 }));

      const mockSheet = createMockSheet([]);
      mockSheet.addRow.mockRejectedValue(new Error("Save error"));
      const mockDoc = createMockDoc(mockSheet);

      const result = await migrateFromLocalStorage(mockDoc);

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error).toBe("migration-failed");
      }
    });

    it("should be idempotent - safe to run multiple times", async () => {
      const oldProfile = { age: 30, apiKey: "key123" };
      mockLocalStorage.setItem("userProfile", JSON.stringify(oldProfile));

      const mockSheet = createMockSheet([]);
      const mockDoc = createMockDoc(mockSheet);

      const result1 = await migrateFromLocalStorage(mockDoc);
      expect(result1.isOk()).toBe(true);
      if (result1.isOk()) {
        expect(result1.value).toBe("migrated");
      }

      const existingRow = createMockRow({
        age: "30",
        heightCm: "",
        weightKg: "",
        fitnessGoal: "",
        fitnessLevel: "",
        workoutDaysPerWeek: "",
        workoutLocation: "",
        equipmentAccess: "",
        freeUserInput: "",
      });
      const mockSheet2 = createMockSheet([existingRow]);
      const mockDoc2 = createMockDoc(mockSheet2);

      const result2 = await migrateFromLocalStorage(mockDoc2);
      expect(result2.isOk()).toBe(true);
      if (result2.isOk()) {
        expect(result2.value).toBe("skipped");
      }
    });
  });
});
