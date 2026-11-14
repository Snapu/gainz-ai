import { okAsync, type ResultAsync } from "neverthrow";
import type { ExerciseLogHistoryReader } from "@/modules/trainingLogs/application";
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
  loadReviews(): ResultAsync<ExerciseWeightMigrationReview[], MigrationLoadError>;
  saveReview(review: ExerciseWeightMigrationReview): ResultAsync<void, MigrationSaveError>;
  applyWeightMultiplier(
    exerciseName: string,
    multiplier: number,
  ): ResultAsync<number, MigrationApplyError>;
}

export function loadExerciseWeightMigrationReviews(
  repository: ExerciseWeightMigrationRepository,
): ResultAsync<ExerciseWeightMigrationReview[], MigrationLoadError> {
  return repository.loadReviews();
}

export function saveExerciseWeightMigrationReview(
  review: ExerciseWeightMigrationReview,
  repository: ExerciseWeightMigrationRepository,
): ResultAsync<void, MigrationSaveError> {
  return repository.saveReview(review);
}

export function applyExerciseWeightMigrationDecision(
  exerciseName: string,
  decision: ExerciseWeightMigrationDecision,
  repository: ExerciseWeightMigrationRepository,
): ResultAsync<ApplyExerciseWeightMigrationResult, MigrationApplyError> {
  const multiplier = decision === "convert_to_total" ? 2 : 1;

  return repository.applyWeightMultiplier(exerciseName, multiplier).andThen((updatedLogCount) => {
    const review: ExerciseWeightMigrationReview = {
      exerciseName,
      decision,
      reviewedAt: new Date().toISOString(),
      affectedLogCount: updatedLogCount,
    };

    return repository.saveReview(review).map(() => ({ review, updatedLogCount }));
  });
}

export function loadAllLogsForMigration(
  logsReader: ExerciseLogHistoryReader,
): ResultAsync<
  ExerciseLog[],
  "load-failed" | "parse-data-failed" | "sheet-not-found" | "auth-failed"
> {
  return logsReader.loadCurrentYearLogs().andThen((currentYearLogs) => {
    const years = logsReader.findPastYears();
    return years.reduce<
      ResultAsync<
        ExerciseLog[],
        "load-failed" | "parse-data-failed" | "sheet-not-found" | "auth-failed"
      >
    >(
      (allLogsResult, year) =>
        allLogsResult.andThen((logs) =>
          logsReader.loadYearLogs(year).map((yearLogs) => [...logs, ...yearLogs]),
        ),
      okAsync([...currentYearLogs]),
    );
  });
}

export function buildPendingExerciseMigrationCandidates(
  logs: ExerciseLog[],
  reviews: ExerciseWeightMigrationReview[],
) {
  return buildExerciseWeightMigrationCandidates(logs, reviews);
}
