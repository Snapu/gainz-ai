import type { ResultAsync } from "neverthrow";
import type { DeloadPhase } from "../domain/types";

export interface DeloadPhaseRepository {
  load: () => ResultAsync<DeloadPhase | null, "load-failed" | "auth-failed">;
  save: (phase: DeloadPhase | null) => ResultAsync<void, "save-failed" | "auth-failed">;
}

export function loadDeloadPhase(
  repository: DeloadPhaseRepository,
): ResultAsync<DeloadPhase | null, "load-failed" | "auth-failed"> {
  return repository.load();
}

export function saveDeloadPhase(
  phase: DeloadPhase | null,
  repository: DeloadPhaseRepository,
): ResultAsync<void, "save-failed" | "auth-failed"> {
  return repository.save(phase);
}
