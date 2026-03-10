import type { GoogleSpreadsheet } from "google-spreadsheet";
import { err, ok, type Result } from "neverthrow";
import { z } from "zod";
import type {
  EquipmentOption,
  FitnessGoal,
  FitnessLevel,
  UserProfile,
  WorkoutLocation,
} from "@/stores/userProfile";

/**
 * Transform: Parse empty string, null, or undefined to undefined,
 * otherwise parse string as float
 */
const optionalNumberSchema = z.preprocess((val) => {
  if (val === "" || val === null || val === undefined) return undefined;
  const num = typeof val === "string" ? parseFloat(val) : Number(val);
  return Number.isNaN(num) ? undefined : num;
}, z.number().optional());

/**
 * Transform: Parse comma-separated string to typed array
 * Handles empty strings, trims whitespace, filters empty items
 */
const commaSeparatedArraySchema = <T extends string>(enumSchema: z.ZodType<T>) =>
  z.preprocess((val) => {
    if (val === "" || val === null || val === undefined) return [];
    if (typeof val === "string") {
      return val
        .split(",")
        .map((item) => item.trim())
        .filter((item) => item.length > 0);
    }
    return val;
  }, z.array(enumSchema));

/**
 * Zod schema for UserProfile data parsed from spreadsheet
 * Transforms string cell values to typed UserProfile
 * Note: apiKey excluded (stays in localStorage only)
 */
const optionalEnumSchema = <T extends string>(enumSchema: z.ZodType<T>) =>
  z.preprocess((val) => {
    if (val === "" || val === null || val === undefined) return undefined;
    return val;
  }, enumSchema.optional());

export const UserProfileSchema = z.object({
  age: optionalNumberSchema,
  heightCm: optionalNumberSchema,
  weightKg: optionalNumberSchema,
  fitnessGoal: commaSeparatedArraySchema(
    z.enum([
      "build_muscle",
      "lose_fat",
      "improve_endurance",
      "increase_mobility",
      "general_fitness",
    ]),
  ),
  fitnessLevel: optionalEnumSchema(z.enum(["beginner", "intermediate", "advanced"])),
  workoutDaysPerWeek: optionalNumberSchema,
  workoutLocation: optionalEnumSchema(z.enum(["gym", "home", "both"])),
  equipmentAccess: commaSeparatedArraySchema(
    z.enum([
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
    ]),
  ),
  freeUserInput: z.preprocess((val) => (val === "" ? undefined : val), z.string().optional()),
});

/**
 * Type: UserProfile without apiKey (for spreadsheet storage)
 */
export type UserProfileForSheet = Omit<UserProfile, "apiKey">;

/**
 * Serialize UserProfile to sheet row format
 * Converts arrays to comma-separated strings, numbers to strings
 */
export function serializeForSheet(profile: UserProfileForSheet): Record<string, string> {
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

/**
 * Load user profile from spreadsheet
 * Returns null if no profile exists (empty sheet)
 * Returns error if spreadsheet access fails or data is invalid
 */
export async function loadUserProfile(
  doc: GoogleSpreadsheet,
): Promise<Result<UserProfile | null, "spreadsheet-load-failed" | "spreadsheet-parse-failed">> {
  try {
    let sheet = getSheet(doc);
    if (!sheet) sheet = await addSheet(doc);

    await sheet.loadHeaderRow();
    const rows = await sheet.getRows();

    if (rows.length === 0) {
      return ok(null);
    }

    const rowData = rows[0]!.toObject();
    const parseResult = UserProfileSchema.safeParse(rowData);

    if (!parseResult.success) {
      console.error("Failed to parse user profile:", parseResult.error);
      return err("spreadsheet-parse-failed");
    }

    return ok(parseResult.data);
  } catch (error) {
    console.error("Failed to load user profile:", error);
    return err("spreadsheet-load-failed");
  }
}

/**
 * Save user profile to spreadsheet
 * Updates existing profile row if present, creates new row if empty
 */
export async function saveUserProfile(
  profile: UserProfileForSheet,
  doc: GoogleSpreadsheet,
): Promise<Result<void, "spreadsheet-save-failed">> {
  try {
    let sheet = getSheet(doc);
    if (!sheet) sheet = await addSheet(doc);

    await sheet.loadHeaderRow();
    const rows = await sheet.getRows();

    const serialized = serializeForSheet(profile);

    if (rows.length > 0) {
      const existingRow = rows[0]!;
      existingRow.assign(serialized);
      await existingRow.save();
    } else {
      await sheet.addRow(serialized);
    }

    return ok(undefined);
  } catch (error) {
    console.error("Failed to save user profile:", error);
    return err("spreadsheet-save-failed");
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
