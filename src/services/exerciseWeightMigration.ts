import * as Sentry from "@sentry/vue";
import type { GoogleSpreadsheet } from "google-spreadsheet";
import { err, ok, type Result } from "neverthrow";
import { z } from "zod";
import type { ExerciseLog } from "./exerciseLogs";
import { rebuildTrainingSummary } from "./trainingSummary";
import { isAuthError } from "./utils/isAuthError";

const SHEET_NAME = "ExerciseWeightMigration";
const LOGS_SHEET_PREFIX = "Logs";
const HEADERS = ["exerciseName", "decision", "reviewedAt", "affectedLogCount"] as const;
const DEFAULT_PREVIEW_LOG_COUNT = 5;

const ExerciseNameSchema = z
  .string()
  .trim()
  .min(1)
  .transform((value) => value.replace(/\s+/g, " "));

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

type LoadError = "load-failed" | "auth-failed" | "parse-data-failed";
type SaveError = "save-failed" | "auth-failed";
type ApplyError = LoadError | SaveError | "already-reviewed" | "summary-rebuild-failed";

function getSheet(doc: GoogleSpreadsheet) {
  return doc.sheetsByTitle[SHEET_NAME];
}

function normalizeExerciseName(exerciseName: string): string {
  return ExerciseNameSchema.parse(exerciseName);
}

function getLogSheets(doc: GoogleSpreadsheet) {
  return Object.entries(doc.sheetsByTitle)
    .filter(([title]) => title.startsWith(LOGS_SHEET_PREFIX))
    .sort(([leftTitle], [rightTitle]) => leftTitle.localeCompare(rightTitle))
    .map(([, sheet]) => sheet);
}

async function ensureSheet(doc: GoogleSpreadsheet) {
  return getSheet(doc) ?? (await doc.addSheet({ title: SHEET_NAME, headerValues: [...HEADERS] }));
}

async function ensureHeaders(sheet: {
  loadHeaderRow: () => Promise<void>;
  setHeaderRow: (headers: string[]) => Promise<void>;
  headerValues?: string[];
}): Promise<void> {
  await sheet.loadHeaderRow();
  const currentHeaders = Array.isArray(sheet.headerValues) ? sheet.headerValues : [];
  const missingHeaders = HEADERS.filter((header) => !currentHeaders.includes(header));
  if (missingHeaders.length === 0) return;
  await sheet.setHeaderRow([...currentHeaders, ...missingHeaders]);
  await sheet.loadHeaderRow();
}

function parseWeight(value: unknown): number | undefined {
  if (value === "" || value === null || value === undefined) return undefined;
  const weight = typeof value === "string" ? parseFloat(value) : Number(value);
  return Number.isNaN(weight) ? undefined : weight;
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

export async function loadExerciseWeightMigrationReviews(
  doc: GoogleSpreadsheet,
): Promise<Result<ExerciseWeightMigrationReview[], LoadError>> {
  try {
    const sheet = getSheet(doc) ?? (await ensureSheet(doc));
    await ensureHeaders(sheet);
    const rows = await sheet.getRows();
    const parsed = ExerciseWeightMigrationReviewSchema.array().safeParse(
      rows.map((row) => row.toObject()),
    );

    if (!parsed.success) {
      Sentry.captureMessage("Failed to parse exercise migration reviews", {
        level: "error",
        tags: { scope: "exercise-weight-migration", feature: "load-parse" },
        extra: { issues: parsed.error.issues },
      });
      return err("parse-data-failed");
    }

    return ok(parsed.data);
  } catch (error) {
    if (isAuthError(error)) return err("auth-failed");
    Sentry.captureException(error, {
      tags: { scope: "exercise-weight-migration", feature: "load" },
    });
    return err("load-failed");
  }
}

export async function saveExerciseWeightMigrationReview(
  review: ExerciseWeightMigrationReview,
  doc: GoogleSpreadsheet,
): Promise<Result<void, SaveError>> {
  try {
    const sheet = await ensureSheet(doc);
    await ensureHeaders(sheet);
    const normalizedReview = ExerciseWeightMigrationReviewSchema.parse(review);
    const rows = await sheet.getRows();
    const existingRow = rows.find((row) => {
      const parsedExerciseName = ExerciseNameSchema.safeParse(row.get("exerciseName"));
      return (
        parsedExerciseName.success && parsedExerciseName.data === normalizedReview.exerciseName
      );
    });

    if (existingRow) {
      existingRow.assign(normalizedReview);
      await existingRow.save();
    } else {
      await sheet.addRow(normalizedReview);
    }

    return ok(undefined);
  } catch (error) {
    if (isAuthError(error)) return err("auth-failed");
    Sentry.captureException(error, {
      tags: { scope: "exercise-weight-migration", feature: "save" },
    });
    return err("save-failed");
  }
}

export async function applyExerciseWeightMigrationDecision(
  exerciseName: string,
  decision: ExerciseWeightMigrationDecision,
  doc: GoogleSpreadsheet,
): Promise<Result<ApplyExerciseWeightMigrationResult, ApplyError>> {
  const normalizedExerciseName = normalizeExerciseName(exerciseName);
  const reviewsResult = await loadExerciseWeightMigrationReviews(doc);
  if (reviewsResult.isErr()) return err(reviewsResult.error);
  if (
    reviewsResult.value.some(
      (review) => normalizeExerciseName(review.exerciseName) === normalizedExerciseName,
    )
  ) {
    return err("already-reviewed");
  }

  try {
    let updatedLogCount = 0;

    if (decision === "convert_to_total") {
      for (const sheet of getLogSheets(doc)) {
        const rows = await sheet.getRows();
        for (const row of rows) {
          const rawExerciseName = String(row.get("exerciseName") ?? "").trim();
          if (!rawExerciseName) continue;
          const rowExerciseName = normalizeExerciseName(rawExerciseName);
          if (rowExerciseName !== normalizedExerciseName) continue;

          const weight = parseWeight(row.get("weight"));
          if (weight === undefined) continue;

          row.assign({ weight: String(weight * 2) });
          await row.save();
          updatedLogCount += 1;
        }
      }
    } else {
      for (const sheet of getLogSheets(doc)) {
        const rows = await sheet.getRows();
        for (const row of rows) {
          const rawExerciseName = String(row.get("exerciseName") ?? "").trim();
          if (!rawExerciseName) continue;
          const rowExerciseName = normalizeExerciseName(rawExerciseName);
          if (rowExerciseName !== normalizedExerciseName) continue;
          if (parseWeight(row.get("weight")) === undefined) continue;
          updatedLogCount += 1;
        }
      }
    }

    const review = ExerciseWeightMigrationReviewSchema.parse({
      exerciseName: normalizedExerciseName,
      decision,
      reviewedAt: new Date().toISOString(),
      affectedLogCount: updatedLogCount,
    });

    const saveResult = await saveExerciseWeightMigrationReview(review, doc);
    if (saveResult.isErr()) return err(saveResult.error);

    const summaryResult = await rebuildTrainingSummary(doc);
    if (summaryResult.isErr()) return err("summary-rebuild-failed");

    return ok({ review, updatedLogCount });
  } catch (error) {
    if (isAuthError(error)) return err("auth-failed");
    Sentry.captureException(error, {
      tags: { scope: "exercise-weight-migration", feature: "apply" },
    });
    return err("save-failed");
  }
}
