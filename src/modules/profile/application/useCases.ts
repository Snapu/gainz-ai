import type { ResultAsync } from "neverthrow";
import type { UserProfile } from "../domain/types";

type UserProfileLoadError = "load-failed" | "parse-data-failed" | "auth-failed";
type UserProfileSaveError = "save-failed" | "auth-failed";
type UserProfileMigrationResult = "migrated" | "skipped" | "no-data";
type UserProfileMigrationError = "migration-failed";

export interface UserProfileRepository {
  load: () => ResultAsync<UserProfile | null, UserProfileLoadError>;
  save: (profile: UserProfile) => ResultAsync<void, UserProfileSaveError>;
  migrateFromLocalStorage: () => ResultAsync<UserProfileMigrationResult, UserProfileMigrationError>;
}

export function loadUserProfile(repository: UserProfileRepository) {
  return repository.load();
}

export function saveUserProfile(profile: UserProfile, repository: UserProfileRepository) {
  return repository.save(profile);
}

export function migrateFromLocalStorage(repository: UserProfileRepository) {
  return repository.migrateFromLocalStorage();
}
