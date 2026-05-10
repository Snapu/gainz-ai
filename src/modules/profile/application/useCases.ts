import type { Result } from "neverthrow";
import type { UserProfile } from "../domain/types";

export interface UserProfileRepository {
  load: () => Promise<
    Result<UserProfile | null, "load-failed" | "parse-data-failed" | "auth-failed">
  >;
  save: (profile: UserProfile) => Promise<Result<void, "save-failed" | "auth-failed">>;
  migrateFromLocalStorage: () => Promise<
    Result<"migrated" | "skipped" | "no-data", "migration-failed">
  >;
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
