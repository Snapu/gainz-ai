import type { GoogleSpreadsheet } from "google-spreadsheet";
import { err, ok, type Result } from "neverthrow";
import { z } from "zod";
import { parseData } from "./utils/parseData";

export const FitnessGoalSchema = z.enum([
  "build_muscle",
  "lose_fat",
  "improve_endurance",
  "increase_mobility",
  "general_fitness",
]);
export type FitnessGoal = z.infer<typeof FitnessGoalSchema>;

export const FitnessLevelSchema = z.enum(["beginner", "intermediate", "advanced"]);
export type FitnessLevel = z.infer<typeof FitnessLevelSchema>;

export const WorkoutLocationSchema = z.enum(["gym", "home", "both"]);
export type WorkoutLocation = z.infer<typeof WorkoutLocationSchema>;

export const EquipmentOptionSchema = z.enum([
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
]);
export type EquipmentOption = z.infer<typeof EquipmentOptionSchema>;

const optionalNumberSchema = z.preprocess((val) => {
  if (val === "" || val === null || val === undefined) return undefined;
  const num = typeof val === "string" ? parseFloat(val) : Number(val);
  return Number.isNaN(num) ? undefined : num;
}, z.number().optional());

const commaSeparatedArraySchema = <T extends z.ZodTypeAny>(enumSchema: T) =>
  z.preprocess((val) => {
    if (val === "" || val === null || val === undefined) return undefined;
    if (typeof val === "string") {
      return val
        .split(",")
        .map((item) => item.trim())
        .filter((item) => item.length > 0);
    }
    return val;
  }, z.array(enumSchema).optional());

const optionalEnumSchema = <T extends z.ZodTypeAny>(enumSchema: T) =>
  z.preprocess((val) => {
    if (val === "" || val === null || val === undefined) return undefined;
    return val;
  }, enumSchema.optional());

export const UserProfileSchema = z.object({
  age: optionalNumberSchema,
  heightCm: optionalNumberSchema,
  weightKg: optionalNumberSchema,
  fitnessGoal: commaSeparatedArraySchema(FitnessGoalSchema),
  fitnessLevel: optionalEnumSchema(FitnessLevelSchema),
  workoutDaysPerWeek: optionalNumberSchema,
  workoutLocation: optionalEnumSchema(WorkoutLocationSchema),
  equipmentAccess: commaSeparatedArraySchema(EquipmentOptionSchema),
  freeUserInput: z.preprocess((val) => (val === "" ? undefined : val), z.string().optional()),
});

export type UserProfile = z.infer<typeof UserProfileSchema>;
export type UserProfileWithApiKey = UserProfile & { apiKey?: string };

const SHEET_NAME = "UserProfile";
const getSheet = (doc: GoogleSpreadsheet) => doc.sheetsByTitle[SHEET_NAME];
const addSheet = (doc: GoogleSpreadsheet) =>
  doc.addSheet({
    title: SHEET_NAME,
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

function serializeForSheet(profile: UserProfile): Record<string, string> {
  return {
    age: profile.age?.toString() ?? "",
    heightCm: profile.heightCm?.toString() ?? "",
    weightKg: profile.weightKg?.toString() ?? "",
    fitnessGoal: (profile.fitnessGoal ?? []).join(","),
    fitnessLevel: profile.fitnessLevel ?? "",
    workoutDaysPerWeek: profile.workoutDaysPerWeek?.toString() ?? "",
    workoutLocation: profile.workoutLocation ?? "",
    equipmentAccess: (profile.equipmentAccess ?? []).join(","),
    freeUserInput: profile.freeUserInput ?? "",
  };
}

export async function loadUserProfile(
  doc: GoogleSpreadsheet,
): Promise<Result<UserProfile | null, "load-failed" | "parse-data-failed">> {
  const sheet = getSheet(doc) ?? (await addSheet(doc));
  try {
    const rows = await sheet.getRows();
    if (rows.length === 0) {
      return ok(null);
    }
    const result = await parseData(UserProfileSchema, rows[0]!.toObject());
    return result.isOk() ? ok(result.value) : err(result.error);
  } catch (error) {
    console.error("Failed to load user profile. Error:", error);
    return err("load-failed");
  }
}

export async function saveUserProfile(
  profile: UserProfile,
  doc: GoogleSpreadsheet,
): Promise<Result<void, "save-failed">> {
  try {
    const sheet = getSheet(doc) ?? (await addSheet(doc));
    const rows = await sheet.getRows();
    const serialized = serializeForSheet(profile);

    if (rows.length > 0) {
      rows[0]!.assign(serialized);
      await rows[0]!.save();
    } else {
      await sheet.addRow(serialized);
    }
    return ok();
  } catch (error) {
    console.error("Failed to save user profile. Error:", error);
    return err("save-failed");
  }
}

/**
 * Migrate user profile from old localStorage format to spreadsheet
 * Idempotent: safe to run multiple times (checks if already migrated)
 *
 * Migration steps:
 * 1. Check if spreadsheet already has data → skip (already migrated)
 * 2. Check for old localStorage key "userProfile"
 * 3. If data exists: extract apiKey, save profile to spreadsheet, clean up localStorage
 *
 * @returns "migrated" if data was migrated, "skipped" if already done, "no-data" if nothing to migrate
 */
export async function migrateFromLocalStorage(
  doc: GoogleSpreadsheet,
): Promise<Result<"migrated" | "skipped" | "no-data", "migration-failed">> {
  try {
    // Check if spreadsheet already has data (idempotency check)
    const loadResult = await loadUserProfile(doc);
    if (loadResult.isErr()) {
      return err("migration-failed");
    }

    if (loadResult.value !== null) {
      // Spreadsheet already has data, migration already done or user is new
      return ok("skipped");
    }

    // Check for old localStorage data
    const oldDataJson = localStorage.getItem("userProfile");
    if (!oldDataJson) {
      // No old data to migrate
      return ok("no-data");
    }

    // Parse old localStorage data
    let oldData: any;
    try {
      oldData = JSON.parse(oldDataJson);
    } catch (parseError) {
      console.error("Failed to parse old userProfile localStorage:", parseError);
      return err("migration-failed");
    }

    // Extract apiKey (if present) and profile data
    const { apiKey, ...profileData } = oldData;

    // Save apiKey to new localStorage key (if it exists)
    if (apiKey) {
      localStorage.setItem("userProfile:apiKey", apiKey);
    }

    // Save profile data (without apiKey) to spreadsheet
    const saveResult = await saveUserProfile(profileData, doc);
    if (saveResult.isErr()) {
      console.error("Failed to save migrated profile to spreadsheet");
      return err("migration-failed");
    }

    // Remove old localStorage key (migration complete)
    localStorage.removeItem("userProfile");

    console.log("User profile migrated from localStorage to spreadsheet");
    return ok("migrated");
  } catch (error) {
    console.error("Migration failed:", error);
    return err("migration-failed");
  }
}
