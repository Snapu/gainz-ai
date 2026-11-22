import type { GoogleSpreadsheet } from "google-spreadsheet";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  loadUserProfile,
  migrateFromLocalStorage,
  saveUserProfile,
} from "@/modules/profile/application";
import { type UserProfile, UserProfileSchema } from "@/modules/profile/domain";
import { createUserProfileRepository, purgeLegacyApiKeys } from "@/modules/profile/infrastructure";

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
      "workoutDurationMinutes",
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
        workoutDurationMinutes: "45",
        workoutLocation: "gym",
        equipmentAccess: "dumbbells,barbell_rack",
        freeUserInput: "test notes",
      };

      const result = UserProfileSchema.safeParse(row);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.fitnessGoal).toEqual(["build_muscle", "lose_fat"]);
        expect(result.data.equipmentAccess).toEqual(["dumbbells", "barbell_rack"]);
        expect(result.data.workoutDurationMinutes).toBe(45);
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
        workoutDurationMinutes: "",
        workoutLocation: "",
        equipmentAccess: "",
        freeUserInput: "",
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.age).toBeUndefined();
        expect(result.data.fitnessGoal).toBeUndefined();
        expect(result.data.workoutDurationMinutes).toBeUndefined();
        expect(result.data.freeUserInput).toBeUndefined();
      }
    });

    it("parses mixed preset and custom equipment CSV", () => {
      const result = UserProfileSchema.safeParse({
        equipmentAccess: "dumbbells,Smith Machine,Leg Press",
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.equipmentAccess).toEqual(["dumbbells", "Smith Machine", "Leg Press"]);
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
        workoutDurationMinutes: "60",
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
          workoutDurationMinutes: 60,
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
          "workoutDurationMinutes",
          "workoutLocation",
          "equipmentAccess",
          "freeUserInput",
        ],
      });
      expect(result.isOk()).toBe(true);
    });

    it("appends workoutDurationMinutes header on legacy sheets without failing load", async () => {
      const legacyHeaders = [
        "age",
        "heightCm",
        "weightKg",
        "fitnessGoal",
        "fitnessLevel",
        "workoutDaysPerWeek",
        "workoutLocation",
        "equipmentAccess",
        "freeUserInput",
      ];
      const row = createMockRow({ age: "31", workoutDaysPerWeek: "4" });
      const legacySheet = createMockSheet([row], legacyHeaders);

      const result = await loadUserProfile(createUserProfileRepository(createMockDoc(legacySheet)));

      expect(legacySheet.setHeaderRow).toHaveBeenCalledWith([
        ...legacyHeaders,
        "workoutDurationMinutes",
      ]);
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toMatchObject({
          age: 31,
          workoutDaysPerWeek: 4,
        });
        expect(result.value?.workoutDurationMinutes).toBeUndefined();
      }
    });

    it.each(["0", 0, "-30", -15, "abc", "45min", "Infinity", Infinity, true, "   "])(
      "rejects invalid workoutDurationMinutes cell (%p) as undefined without failing load",
      async (invalidCell) => {
        const row = createMockRow({
          age: "30",
          workoutDaysPerWeek: "4",
          workoutDurationMinutes: invalidCell as string,
        });

        const result = await loadUserProfile(
          createUserProfileRepository(createMockDoc(createMockSheet([row]))),
        );

        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
          expect(result.value?.age).toBe(30);
          expect(result.value?.workoutDaysPerWeek).toBe(4);
          expect(result.value?.workoutDurationMinutes).toBeUndefined();
        }
      },
    );
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
        workoutDurationMinutes: 45,
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
        workoutDurationMinutes: "45",
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
        workoutDurationMinutes: "",
        workoutLocation: "",
        equipmentAccess: "",
        freeUserInput: "",
      });
    });

    it("round-trips workoutDurationMinutes across save, update, and reload", async () => {
      const storedRows: {
        toObject: () => Record<string, string | undefined>;
        assign: (next: Record<string, string>) => void;
        save: () => Promise<void>;
      }[] = [];
      const statefulSheet = {
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
        loadHeaderRow: vi.fn().mockResolvedValue(undefined),
        setHeaderRow: vi.fn().mockImplementation(async (headers: string[]) => {
          statefulSheet.headerValues = headers;
        }),
        getRows: vi.fn().mockImplementation(async () => storedRows),
        addRow: vi.fn().mockImplementation(async (data: Record<string, string>) => {
          const cellData: Record<string, string> = {};
          const write = (incoming: Record<string, string>) => {
            for (const header of statefulSheet.headerValues) {
              if (header in incoming) cellData[header] = incoming[header] ?? "";
            }
          };
          write(data);
          const row = {
            toObject: () =>
              Object.fromEntries(statefulSheet.headerValues.map((h) => [h, cellData[h]])),
            assign: vi.fn((next: Record<string, string>) => write(next)),
            save: vi.fn().mockResolvedValue(undefined),
          };
          storedRows.push(row);
          return row;
        }),
      };
      const repository = createUserProfileRepository(createMockDoc(statefulSheet));

      const saveResult = await saveUserProfile(
        { workoutDaysPerWeek: 4, workoutDurationMinutes: 45 },
        repository,
      );
      expect(saveResult.isOk()).toBe(true);

      const loadResult = await loadUserProfile(repository);
      expect(loadResult.isOk()).toBe(true);
      if (loadResult.isOk()) {
        expect(loadResult.value?.workoutDaysPerWeek).toBe(4);
        expect(loadResult.value?.workoutDurationMinutes).toBe(45);
      }

      const updateResult = await saveUserProfile(
        { workoutDaysPerWeek: 4, workoutDurationMinutes: 90 },
        repository,
      );
      expect(updateResult.isOk()).toBe(true);

      const reloadedAfterUpdate = await loadUserProfile(repository);
      expect(reloadedAfterUpdate.isOk()).toBe(true);
      if (reloadedAfterUpdate.isOk()) {
        expect(reloadedAfterUpdate.value?.workoutDurationMinutes).toBe(90);
      }
    });

    it("writes empty string when saving non-positive or non-finite workoutDurationMinutes", async () => {
      const mockSheet = createMockSheet([]);
      await saveUserProfile(
        { workoutDurationMinutes: -20 },
        createUserProfileRepository(createMockDoc(mockSheet)),
      );
      expect(mockSheet.addRow).toHaveBeenCalledWith(
        expect.objectContaining({ workoutDurationMinutes: "" }),
      );
    });

    it("normalizes equipmentAccess before writing to sheet", async () => {
      const mockSheet = createMockSheet([]);
      await saveUserProfile(
        { equipmentAccess: ["  Smith   Machine  ", "Dumbbells"] },
        createUserProfileRepository(createMockDoc(mockSheet)),
      );
      expect(mockSheet.addRow).toHaveBeenCalledWith(
        expect.objectContaining({ equipmentAccess: "Smith Machine,dumbbells" }),
      );
    });

    it("round-trips custom equipment across save, reload, and removal", async () => {
      const storedRows: {
        toObject: () => Record<string, string | undefined>;
        assign: (next: Record<string, string>) => void;
        save: () => Promise<void>;
      }[] = [];
      const headers = [
        "age",
        "heightCm",
        "weightKg",
        "fitnessGoal",
        "fitnessLevel",
        "workoutDaysPerWeek",
        "workoutDurationMinutes",
        "workoutLocation",
        "equipmentAccess",
        "freeUserInput",
      ];
      const statefulSheet = {
        headerValues: headers,
        loadHeaderRow: vi.fn().mockResolvedValue(undefined),
        setHeaderRow: vi.fn().mockResolvedValue(undefined),
        getRows: vi.fn().mockImplementation(async () => storedRows),
        addRow: vi.fn().mockImplementation(async (data: Record<string, string>) => {
          const cellData: Record<string, string> = {};
          const write = (incoming: Record<string, string>) => {
            for (const header of statefulSheet.headerValues) {
              if (header in incoming) cellData[header] = incoming[header] ?? "";
            }
          };
          write(data);
          const row = {
            toObject: () =>
              Object.fromEntries(statefulSheet.headerValues.map((h) => [h, cellData[h]])),
            assign: vi.fn((next: Record<string, string>) => write(next)),
            save: vi.fn().mockResolvedValue(undefined),
          };
          storedRows.push(row);
          return row;
        }),
      };
      const repository = createUserProfileRepository(createMockDoc(statefulSheet));

      await saveUserProfile(
        { equipmentAccess: ["dumbbells", "Smith Machine", "Leg Press"] },
        repository,
      );

      const loaded = await loadUserProfile(repository);
      expect(loaded.isOk()).toBe(true);
      if (loaded.isOk()) {
        expect(loaded.value?.equipmentAccess).toEqual(["dumbbells", "Smith Machine", "Leg Press"]);
      }

      await saveUserProfile({ equipmentAccess: ["dumbbells", "Leg Press"] }, repository);

      const reloaded = await loadUserProfile(repository);
      expect(reloaded.isOk()).toBe(true);
      if (reloaded.isOk()) {
        expect(reloaded.value?.equipmentAccess).toEqual(["dumbbells", "Leg Press"]);
      }
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
        }),
      );

      const mockSheet = createMockSheet([]);
      const result = await migrateFromLocalStorage(
        createUserProfileRepository(createMockDoc(mockSheet)),
      );

      expect(result.isOk()).toBe(true);
      if (result.isOk()) expect(result.value).toBe("migrated");
      expect(mockSheet.addRow).toHaveBeenCalled();
      expect(mockLocalStorage.getItem("userProfile")).toBeNull();
    });

    it("purges legacy api key entries from localStorage", () => {
      mockLocalStorage.setItem("userProfile:apiKey", "gemini-key-1");
      mockLocalStorage.setItem("apiKey", "gemini-key-2");
      mockLocalStorage.setItem("profile:apiKey", "gemini-key-3");

      purgeLegacyApiKeys();

      expect(mockLocalStorage.getItem("userProfile:apiKey")).toBeNull();
      expect(mockLocalStorage.getItem("apiKey")).toBeNull();
      expect(mockLocalStorage.getItem("profile:apiKey")).toBeNull();
    });
  });
});
