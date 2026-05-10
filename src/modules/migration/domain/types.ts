import { z } from "zod";
import { cleanExerciseName, parseOptionalNumber } from "@/modules/shared/domain";
import type { ExerciseLog } from "@/modules/trainingLogs/domain";

export const DEFAULT_PREVIEW_LOG_COUNT = 5;

const ExerciseNameSchema = z.string().trim().min(1).transform(cleanExerciseName);

const ExerciseWeightMigrationDecisionSchema = z.enum(["keep_as_is", "convert_to_total"]);

export type ExerciseWeightMigrationDecision = z.infer<typeof ExerciseWeightMigrationDecisionSchema>;

const ExerciseWeightMigrationReviewSchema = z.object({
  exerciseName: ExerciseNameSchema,
  decision: ExerciseWeightMigrationDecisionSchema,
  reviewedAt: z.string().datetime(),
  affectedLogCount: z.coerce.number().int().nonnegative().optional(),
});

export type ExerciseWeightMigrationReview = z.infer<typeof ExerciseWeightMigrationReviewSchema>;

interface ExerciseWeightMigrationPreviewLog {
  weight: number;
  loggedAt: Date;
}

export interface ExerciseWeightMigrationCandidate {
  exerciseName: string;
  affectedLogCount: number;
  latestLoggedAt: Date;
  latestWeight: number;
  recentLogs: ExerciseWeightMigrationPreviewLog[];
  spansMultipleYears: boolean;
}

export interface ApplyExerciseWeightMigrationResult {
  review: ExerciseWeightMigrationReview;
  updatedLogCount: number;
}

export type MigrationLoadError = "load-failed" | "auth-failed" | "parse-data-failed";
export type MigrationSaveError = "save-failed" | "auth-failed";
export type MigrationApplyError =
  | MigrationLoadError
  | MigrationSaveError
  | "already-reviewed"
  | "summary-rebuild-failed";

export function normalizeExerciseName(exerciseName: string): string {
  return ExerciseNameSchema.parse(exerciseName);
}

export function parseWeight(value: unknown): number | undefined {
  return parseOptionalNumber(value);
}

export function parseMigrationReview(input: unknown): ExerciseWeightMigrationReview {
  return ExerciseWeightMigrationReviewSchema.parse(input);
}

export function safeParseMigrationReviews(input: unknown) {
  return ExerciseWeightMigrationReviewSchema.array().safeParse(input);
}

export function buildExerciseWeightMigrationCandidates(
  logs: ExerciseLog[],
  reviews: ExerciseWeightMigrationReview[],
  previewLogCount = DEFAULT_PREVIEW_LOG_COUNT,
): ExerciseWeightMigrationCandidate[] {
  const reviewedExercises = new Set(
    reviews.map((review) => normalizeExerciseName(review.exerciseName)),
  );
  const logsByExercise = new Map<string, ExerciseLog[]>();

  for (const log of logs) {
    if (typeof log.weight !== "number") continue;
    const exerciseName = normalizeExerciseName(log.exerciseName);
    if (reviewedExercises.has(exerciseName)) continue;
    const existingLogs = logsByExercise.get(exerciseName) ?? [];
    existingLogs.push({ ...log, exerciseName });
    logsByExercise.set(exerciseName, existingLogs);
  }

  return Array.from(logsByExercise.entries())
    .map(([exerciseName, exerciseLogs]) => {
      const sortedLogs = [...exerciseLogs].sort(
        (left, right) => right.loggedAt.getTime() - left.loggedAt.getTime(),
      );
      const latestLog = sortedLogs[0];
      const years = new Set(sortedLogs.map((log) => log.loggedAt.getFullYear()));

      return {
        exerciseName,
        affectedLogCount: sortedLogs.length,
        latestLoggedAt: latestLog!.loggedAt,
        latestWeight: latestLog!.weight!,
        recentLogs: sortedLogs.slice(0, previewLogCount).map((log) => ({
          weight: log.weight!,
          loggedAt: log.loggedAt,
        })),
        spansMultipleYears: years.size > 1,
      } satisfies ExerciseWeightMigrationCandidate;
    })
    .sort((left, right) => {
      const byLatest = right.latestLoggedAt.getTime() - left.latestLoggedAt.getTime();
      return byLatest !== 0 ? byLatest : left.exerciseName.localeCompare(right.exerciseName);
    });
}
