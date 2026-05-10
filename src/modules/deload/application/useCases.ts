import type { Result } from "neverthrow";
import type { DeloadPhase } from "../domain/types";

export interface DeloadPhaseRepository {
  load: () => Promise<Result<DeloadPhase | null, "load-failed" | "auth-failed">>;
  save: (phase: DeloadPhase | null) => Promise<Result<void, "save-failed" | "auth-failed">>;
}

export function loadDeloadPhase(repository: DeloadPhaseRepository) {
  return repository.load();
}

export function saveDeloadPhase(phase: DeloadPhase | null, repository: DeloadPhaseRepository) {
  return repository.save(phase);
}
