import * as Sentry from "@sentry/vue";
import type { GoogleSpreadsheet } from "google-spreadsheet";
import { errAsync, okAsync, Result, ResultAsync } from "neverthrow";
import { isAuthError } from "@/modules/platform/infrastructure";
import type { UserProfileRepository } from "@/modules/profile/application";
import { parseData } from "@/modules/sharedKernel/domain";
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

function loadUserProfileInfra(
  doc: GoogleSpreadsheet,
): ResultAsync<UserProfile | null, "load-failed" | "parse-data-failed" | "auth-failed"> {
  const mapLoadError = (error: unknown): "load-failed" | "auth-failed" => {
    if (isAuthError(error)) {
      console.error("Auth failed during loadUserProfile. Error:", error);
      return "auth-failed";
    }
    console.error("Failed to load user profile. Error:", error);
    Sentry.captureException(error, {
      tags: { scope: "user-profile-service", feature: "load" },
    });
    return "load-failed";
  };

  return ResultAsync.fromThrowable(async () => {
    const sheet = getSheet(doc) ?? (await addSheet(doc));
    await ensureUserProfileHeaders(sheet);
    const rows = await sheet.getRows();
    if (rows.length === 0) {
      return null;
    }
    return rows[0]?.toObject() ?? null;
  }, mapLoadError)().andThen((row) => {
    if (!row) return okAsync(null);
    return parseData(UserProfileSchema, row);
  });
}

function saveUserProfileInfra(
  profile: UserProfile,
  doc: GoogleSpreadsheet,
): ResultAsync<void, "save-failed" | "auth-failed"> {
  const mapSaveError = (error: unknown): "save-failed" | "auth-failed" => {
    if (isAuthError(error)) {
      console.error("Auth failed during saveUserProfile. Error:", error);
      return "auth-failed";
    }
    console.error("Failed to save user profile. Error:", error);
    Sentry.captureException(error, {
      tags: { scope: "user-profile-service", feature: "save" },
    });
    return "save-failed";
  };

  return ResultAsync.fromThrowable(async () => {
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
  }, mapSaveError)();
}

function migrateFromLocalStorageInfra(
  doc: GoogleSpreadsheet,
): ResultAsync<"migrated" | "skipped" | "no-data", "migration-failed"> {
  const mapMigrationError = (error: unknown): "migration-failed" => {
    console.error("Migration failed:", error);
    Sentry.captureException(error, {
      tags: { scope: "user-profile-service", feature: "migration" },
    });
    return "migration-failed";
  };

  return loadUserProfileInfra(doc)
    .mapErr(mapMigrationError)
    .andThen((existingProfile) => {
      if (existingProfile !== null) {
        return okAsync<"migrated" | "skipped" | "no-data", "migration-failed">("skipped");
      }

      const oldDataJson = localStorage.getItem("userProfile");
      if (!oldDataJson) {
        return okAsync<"migrated" | "skipped" | "no-data", "migration-failed">("no-data");
      }

      const parseOldDataResult = Result.fromThrowable(
        () => JSON.parse(oldDataJson),
        (parseError) => {
          console.error("Failed to parse old userProfile localStorage:", parseError);
          Sentry.captureException(parseError, {
            tags: { scope: "user-profile-service", feature: "migration-parse" },
          });
          return "migration-failed" as const;
        },
      )();

      if (parseOldDataResult.isErr()) {
        return errAsync(parseOldDataResult.error);
      }

      const oldData = parseOldDataResult.value;
      if (!oldData || typeof oldData !== "object") {
        return errAsync("migration-failed" as const);
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

      return saveUserProfileInfra(profileData as UserProfile, doc)
        .mapErr((error) => {
          console.error("Failed to save migrated profile to spreadsheet", error);
          Sentry.captureMessage("Failed to save migrated profile", {
            level: "error",
            tags: { scope: "user-profile-service", feature: "migration-save-profile" },
          });
          return "migration-failed" as const;
        })
        .map(() => {
          localStorage.removeItem("userProfile");
          console.log("User profile migrated from localStorage to spreadsheet");
          return "migrated" as const;
        });
    });
}

export function createUserProfileRepository(doc: GoogleSpreadsheet): UserProfileRepository {
  return {
    load: () => loadUserProfileInfra(doc),
    save: (profile) => saveUserProfileInfra(profile, doc),
    migrateFromLocalStorage: () => migrateFromLocalStorageInfra(doc),
  };
}
