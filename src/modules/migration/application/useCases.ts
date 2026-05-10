import { err, ok, type Result } from "neverthrow";
import {
  findPastYearLogSheets,
  loadExerciseLogs,
  loadLogsFromYear,
  type TrainingLogsRepository,
} from "@/modules/trainingLogs/application";
import type { ExerciseLog } from "@/modules/trainingLogs/domain";

import {
  type ApplyExerciseWeightMigrationResult,
  buildExerciseWeightMigrationCandidates,
  type ExerciseWeightMigrationDecision,
  type ExerciseWeightMigrationReview,
  type MigrationApplyError,
  type MigrationLoadError,
  type MigrationSaveError,
} from "../domain/types";

export {
  type ApplyExerciseWeightMigrationResult,
  buildExerciseWeightMigrationCandidates,
  type ExerciseWeightMigrationCandidate,
  type ExerciseWeightMigrationDecision,
  type ExerciseWeightMigrationReview,
  type MigrationApplyError,
  type MigrationLoadError,
  type MigrationSaveError,
} from "../domain/types";

export interface ExerciseWeightMigrationRepository {
  loadReviews(): Promise<Result<ExerciseWeightMigrationReview[], MigrationLoadError>>;
  saveReview(review: ExerciseWeightMigrationReview): Promise<Result<void, MigrationSaveError>>;
  applyDecision(
    exerciseName: string,
    decision: ExerciseWeightMigrationDecision,
  ): Promise<Result<ApplyExerciseWeightMigrationResult, MigrationApplyError>>;
}

export function loadExerciseWeightMigrationReviews(
  repository: ExerciseWeightMigrationRepository,
): Promise<Result<ExerciseWeightMigrationReview[], MigrationLoadError>> {
  return repository.loadReviews();
}

export function saveExerciseWeightMigrationReview(
  review: ExerciseWeightMigrationReview,
  repository: ExerciseWeightMigrationRepository,
): Promise<Result<void, MigrationSaveError>> {
  return repository.saveReview(review);
}

export function applyExerciseWeightMigrationDecision(
  exerciseName: string,
  decision: ExerciseWeightMigrationDecision,
  repository: ExerciseWeightMigrationRepository,
): Promise<Result<ApplyExerciseWeightMigrationResult, MigrationApplyError>> {
  return repository.applyDecision(exerciseName, decision);
}

export async function loadAllLogsForMigration(
  logsRepository: TrainingLogsRepository,
): Promise<
  Result<ExerciseLog[], "load-failed" | "parse-data-failed" | "sheet-not-found" | "auth-failed">
> {
  const currentYearLogsResult = await loadExerciseLogs(logsRepository);
  if (currentYearLogsResult.isErr()) return err(currentYearLogsResult.error);

  const logs = [...currentYearLogsResult.value];
  for (const year of findPastYearLogSheets(logsRepository)) {
    const yearLogsResult = await loadLogsFromYear(year, logsRepository);
    if (yearLogsResult.isErr()) return err(yearLogsResult.error);
    logs.push(...yearLogsResult.value);
  }

  return ok(logs);
}

export function buildPendingExerciseMigrationCandidates(
  logs: ExerciseLog[],
  reviews: ExerciseWeightMigrationReview[],
) {
  return buildExerciseWeightMigrationCandidates(logs, reviews);
}
