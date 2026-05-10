import * as Sentry from "@sentry/vue";
import type { GoogleSpreadsheet } from "google-spreadsheet";
import { err, ok, type Result } from "neverthrow";
import type { UserProfileRepository } from "@/modules/profile/application";
import { parseData } from "@/modules/shared/domain";
import { isAuthError } from "@/modules/shared/infrastructure/utils/isAuthError";
import { type UserProfile, UserProfileSchema } from "../domain/types";

const SHEET_NAME = "UserProfile";
const USER_PROFILE_HEADERS = [
  "age",
  "heightCm",
  "weightKg",
  "fitnessGoal",
  "fitnessLevel",
  "workoutDaysPerWeek",
  "workoutLocation",
  "equipmentAccess",
  "freeUserInput",
] as const;

const getSheet = (doc: GoogleSpreadsheet) => doc.sheetsByTitle[SHEET_NAME];
const addSheet = (doc: GoogleSpreadsheet) =>
  doc.addSheet({
    title: SHEET_NAME,
    headerValues: [...USER_PROFILE_HEADERS],
  });

interface HeaderManagedSheet {
  loadHeaderRow: () => Promise<void>;
  setHeaderRow: (headers: string[]) => Promise<void>;
  headerValues?: string[];
}

async function ensureUserProfileHeaders(sheet: HeaderManagedSheet): Promise<void> {
  await sheet.loadHeaderRow();
  const currentHeaders: string[] = Array.isArray(sheet.headerValues) ? sheet.headerValues : [];
  const missingHeaders = USER_PROFILE_HEADERS.filter((h) => !currentHeaders.includes(h));
  if (missingHeaders.length === 0) return;
  await sheet.setHeaderRow([...currentHeaders, ...missingHeaders]);
  await sheet.loadHeaderRow();
}

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

export async function loadUserProfileInfra(
  doc: GoogleSpreadsheet,
): Promise<Result<UserProfile | null, "load-failed" | "parse-data-failed" | "auth-failed">> {
  const sheet = getSheet(doc) ?? (await addSheet(doc));
  try {
    await ensureUserProfileHeaders(sheet);
    const rows = await sheet.getRows();
    if (rows.length === 0) {
      return ok(null);
    }
    const result = parseData(UserProfileSchema, rows[0]?.toObject());
    return result.isOk() ? ok(result.value) : err(result.error);
  } catch (error) {
    if (isAuthError(error)) {
      console.error("Auth failed during loadUserProfile. Error:", error);
      return err("auth-failed");
    }
    console.error("Failed to load user profile. Error:", error);
    Sentry.captureException(error, {
      tags: { scope: "user-profile-service", feature: "load" },
    });
    return err("load-failed");
  }
}

export async function saveUserProfileInfra(
  profile: UserProfile,
  doc: GoogleSpreadsheet,
): Promise<Result<void, "save-failed" | "auth-failed">> {
  try {
    const sheet = getSheet(doc) ?? (await addSheet(doc));
    await ensureUserProfileHeaders(sheet);
    const rows = await sheet.getRows();
    const serialized = serializeForSheet(profile);

    if (rows.length > 0) {
      rows[0]?.assign(serialized);
      await rows[0]?.save();
    } else {
      await sheet.addRow(serialized);
    }
    return ok();
  } catch (error) {
    if (isAuthError(error)) {
      console.error("Auth failed during saveUserProfile. Error:", error);
      return err("auth-failed");
    }
    console.error("Failed to save user profile. Error:", error);
    Sentry.captureException(error, {
      tags: { scope: "user-profile-service", feature: "save" },
    });
    return err("save-failed");
  }
}

export async function migrateFromLocalStorageInfra(
  doc: GoogleSpreadsheet,
): Promise<Result<"migrated" | "skipped" | "no-data", "migration-failed">> {
  try {
    const loadResult = await loadUserProfileInfra(doc);
    if (loadResult.isErr()) {
      return err("migration-failed");
    }

    if (loadResult.value !== null) {
      return ok("skipped");
    }

    const oldDataJson = localStorage.getItem("userProfile");
    if (!oldDataJson) {
      return ok("no-data");
    }

    let oldData: unknown;
    try {
      oldData = JSON.parse(oldDataJson);
    } catch (parseError) {
      console.error("Failed to parse old userProfile localStorage:", parseError);
      Sentry.captureException(parseError, {
        tags: { scope: "user-profile-service", feature: "migration-parse" },
      });
      return err("migration-failed");
    }

    if (!oldData || typeof oldData !== "object") {
      return err("migration-failed");
    }

    const oldDataRecord = oldData as Record<string, unknown>;
    const apiKey =
      typeof oldDataRecord.apiKey === "string" && oldDataRecord.apiKey.length > 0
        ? oldDataRecord.apiKey
        : undefined;
    const { apiKey: _apiKey, ...profileData } = oldDataRecord;

    if (apiKey) {
      localStorage.setItem("userProfile:apiKey", apiKey);
    }

    const saveProfileResult = await saveUserProfileInfra(profileData as UserProfile, doc);
    if (saveProfileResult.isErr()) {
      console.error("Failed to save migrated profile to spreadsheet");
      Sentry.captureMessage("Failed to save migrated profile", {
        level: "error",
        tags: { scope: "user-profile-service", feature: "migration-save-profile" },
      });
      return err("migration-failed");
    }

    localStorage.removeItem("userProfile");

    console.log("User profile migrated from localStorage to spreadsheet");
    return ok("migrated");
  } catch (error) {
    console.error("Migration failed:", error);
    Sentry.captureException(error, {
      tags: { scope: "user-profile-service", feature: "migration" },
    });
    return err("migration-failed");
  }
}

export function createUserProfileRepository(doc: GoogleSpreadsheet): UserProfileRepository {
  return {
    load: () => loadUserProfileInfra(doc),
    save: (profile) => saveUserProfileInfra(profile, doc),
    migrateFromLocalStorage: () => migrateFromLocalStorageInfra(doc),
  };
}
