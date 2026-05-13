import type { ResultAsync } from "neverthrow";
import type { UserProfile } from "../domain/types";

export type UserProfileLoadError = "load-failed" | "parse-data-failed" | "auth-failed";
export type UserProfileSaveError = "save-failed" | "auth-failed";
export type UserProfileMigrationResult = "migrated" | "skipped" | "no-data";
export type UserProfileMigrationError = "migration-failed";

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
