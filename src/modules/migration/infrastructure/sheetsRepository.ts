import * as Sentry from "@sentry/vue";
import type { GoogleSpreadsheet } from "google-spreadsheet";
import { errAsync, okAsync, Result, ResultAsync } from "neverthrow";
import type { ExerciseWeightMigrationRepository } from "@/modules/migration/application";
import { isAuthError } from "@/modules/platform/infrastructure";
import { cleanExerciseName, parseOptionalNumber } from "@/modules/sharedKernel/domain";
import type { ExerciseLog } from "@/modules/trainingLogs/domain";
import {
  aggregateLogsToSummary,
  type TrainingSummary,
} from "@/modules/trainingSummary/application";

import {
  type ApplyExerciseWeightMigrationResult,
  type ExerciseWeightMigrationDecision,
  type ExerciseWeightMigrationReview,
  type MigrationApplyError,
  type MigrationLoadError,
  type MigrationSaveError,
  normalizeExerciseName,
  parseMigrationReview,
  parseWeight,
  safeParseMigrationReviews,
} from "../domain/types";

const SHEET_NAME = "ExerciseWeightMigration";
const LOGS_SHEET_PREFIX = "Logs";
const HEADERS = ["exerciseName", "decision", "reviewedAt", "affectedLogCount"] as const;
const TRAINING_SUMMARY_SHEET_NAME = "TrainingSummary";
const TRAINING_SUMMARY_HEADERS = [
  "year",
  "month",
  "workoutDays",
  "exerciseName",
  "sets",
  "totalReps",
  "maxWeight",
  "totalVolume",
  "totalDistance",
  "totalDuration",
] as const;

type SheetRow = {
  get: (key: string) => unknown;
  toObject: () => Record<string, unknown>;
  assign: (next: Record<string, unknown>) => void;
  save: () => Promise<void>;
};

function getSheet(doc: GoogleSpreadsheet) {
  return doc.sheetsByTitle[SHEET_NAME];
}

function getLogSheets(doc: GoogleSpreadsheet) {
  return Object.entries(doc.sheetsByTitle)
    .filter(([title]) => title.startsWith(LOGS_SHEET_PREFIX))
    .sort(([leftTitle], [rightTitle]) => leftTitle.localeCompare(rightTitle))
    .map(([, sheet]) => sheet);
}

function getTrainingSummarySheet(doc: GoogleSpreadsheet) {
  return doc.sheetsByTitle[TRAINING_SUMMARY_SHEET_NAME];
}

async function ensureSheet(doc: GoogleSpreadsheet) {
  return getSheet(doc) ?? (await doc.addSheet({ title: SHEET_NAME, headerValues: [...HEADERS] }));
}

async function ensureTrainingSummarySheet(doc: GoogleSpreadsheet) {
  return (
    getTrainingSummarySheet(doc) ??
    (await doc.addSheet({
      title: TRAINING_SUMMARY_SHEET_NAME,
      headerValues: [...TRAINING_SUMMARY_HEADERS],
    }))
  );
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

function rowToExerciseLog(row: Pick<SheetRow, "get">): ExerciseLog | undefined {
  const rawExerciseName = String(row.get("exerciseName") ?? "");
  const exerciseName = cleanExerciseName(rawExerciseName);
  if (!exerciseName) return undefined;

  const rawLoggedAt = row.get("loggedAt");
  if (!rawLoggedAt) return undefined;

  const loggedAt = new Date(String(rawLoggedAt));
  if (Number.isNaN(loggedAt.getTime())) return undefined;

  return {
    id: String(row.get("id") ?? crypto.randomUUID()),
    exerciseName,
    reps: parseOptionalNumber(row.get("reps")),
    weight: parseOptionalNumber(row.get("weight")),
    distance: parseOptionalNumber(row.get("distance")),
    duration: parseOptionalNumber(row.get("duration")),
    rpe: parseOptionalNumber(row.get("rpe")),
    loggedAt,
  };
}

function mapSummaryLoadError(error: unknown): "load-failed" | "auth-failed" {
  if (isAuthError(error)) return "auth-failed";
  Sentry.captureException(error, {
    tags: { scope: "exercise-weight-migration", feature: "summary-rebuild-load" },
  });
  return "load-failed";
}

function loadAllLogsForSummary(
  doc: GoogleSpreadsheet,
): ResultAsync<ExerciseLog[], "load-failed" | "auth-failed"> {
  return ResultAsync.fromThrowable(async () => {
    const logs: ExerciseLog[] = [];

    for (const sheet of getLogSheets(doc)) {
      const rows = (await sheet.getRows()) as SheetRow[];
      for (const row of rows) {
        const log = rowToExerciseLog(row);
        if (log) logs.push(log);
      }
    }

    return logs;
  }, mapSummaryLoadError)();
}

function mapSummarySaveError(error: unknown): "save-failed" | "auth-failed" {
  if (isAuthError(error)) return "auth-failed";
  Sentry.captureException(error, {
    tags: { scope: "exercise-weight-migration", feature: "summary-rebuild-save" },
  });
  return "save-failed";
}

function rebuildTrainingSummarySheet(
  doc: GoogleSpreadsheet,
): ResultAsync<TrainingSummary[], "load-failed" | "auth-failed" | "save-failed"> {
  return loadAllLogsForSummary(doc).andThen((logs) => {
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth() + 1;
    const logsExcludingCurrentMonth = logs.filter(
      (log) =>
        !(
          log.loggedAt.getFullYear() === currentYear && log.loggedAt.getMonth() + 1 === currentMonth
        ),
    );

    const summaries = aggregateLogsToSummary(logsExcludingCurrentMonth);

    return ResultAsync.fromThrowable(async () => {
      const sheet = await ensureTrainingSummarySheet(doc);
      await sheet.clearRows();
      if (summaries.length > 0) {
        await sheet.addRows(summaries);
      }
      return summaries;
    }, mapSummarySaveError)();
  });
}

export function loadExerciseWeightMigrationReviewsInfra(
  doc: GoogleSpreadsheet,
): ResultAsync<ExerciseWeightMigrationReview[], MigrationLoadError> {
  return ResultAsync.fromThrowable(
    async () => {
      const sheet = getSheet(doc) ?? (await ensureSheet(doc));
      await ensureHeaders(sheet);
      const rows = await sheet.getRows();
      return rows.map((row) => row.toObject());
    },
    (error) => {
      if (isAuthError(error)) return "auth-failed" as const;
      Sentry.captureException(error, {
        tags: { scope: "exercise-weight-migration", feature: "load" },
      });
      return "load-failed" as const;
    },
  )().andThen((rows) => {
    const parsed = safeParseMigrationReviews(rows);

    if (!parsed.success) {
      Sentry.captureMessage("Failed to parse exercise migration reviews", {
        level: "error",
        tags: { scope: "exercise-weight-migration", feature: "load-parse" },
        extra: { issues: parsed.error.issues },
      });
      return errAsync<ExerciseWeightMigrationReview[], MigrationLoadError>("parse-data-failed");
    }

    return okAsync(parsed.data);
  });
}

export function saveExerciseWeightMigrationReviewInfra(
  review: ExerciseWeightMigrationReview,
  doc: GoogleSpreadsheet,
): ResultAsync<void, MigrationSaveError> {
  return ResultAsync.fromThrowable(
    async () => {
      const sheet = await ensureSheet(doc);
      await ensureHeaders(sheet);
      const normalizedReview = parseMigrationReview(review);
      const rows = (await sheet.getRows()) as SheetRow[];
      const existingRow = rows.find((row) => {
        const rawExerciseName = row.get("exerciseName");
        if (!rawExerciseName) return false;

        const normalizedRowExerciseName = Result.fromThrowable(
          () => normalizeExerciseName(String(rawExerciseName)),
          () => null,
        )();

        return (
          normalizedRowExerciseName.isOk() &&
          normalizedRowExerciseName.value === normalizedReview.exerciseName
        );
      });

      if (existingRow) {
        existingRow.assign(normalizedReview);
        await existingRow.save();
      } else {
        await sheet.addRow(normalizedReview);
      }
    },
    (error) => {
      if (isAuthError(error)) return "auth-failed" as const;
      Sentry.captureException(error, {
        tags: { scope: "exercise-weight-migration", feature: "save" },
      });
      return "save-failed" as const;
    },
  )();
}

export function applyExerciseWeightMigrationDecisionInfra(
  exerciseName: string,
  decision: ExerciseWeightMigrationDecision,
  doc: GoogleSpreadsheet,
): ResultAsync<ApplyExerciseWeightMigrationResult, MigrationApplyError> {
  const normalizedExerciseName = normalizeExerciseName(exerciseName);
  return loadExerciseWeightMigrationReviewsInfra(doc).andThen((reviews) => {
    if (
      reviews.some(
        (review) => normalizeExerciseName(review.exerciseName) === normalizedExerciseName,
      )
    ) {
      return errAsync<ApplyExerciseWeightMigrationResult, MigrationApplyError>("already-reviewed");
    }

    return ResultAsync.fromThrowable(
      async () => {
        let updatedLogCount = 0;

        if (decision === "convert_to_total") {
          for (const sheet of getLogSheets(doc)) {
            const rows = (await sheet.getRows()) as SheetRow[];
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
            const rows = (await sheet.getRows()) as SheetRow[];
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

        const review = parseMigrationReview({
          exerciseName: normalizedExerciseName,
          decision,
          reviewedAt: new Date().toISOString(),
          affectedLogCount: updatedLogCount,
        });

        return { review, updatedLogCount };
      },
      (error) => {
        if (isAuthError(error)) return "auth-failed" as const;
        Sentry.captureException(error, {
          tags: { scope: "exercise-weight-migration", feature: "apply" },
        });
        return "save-failed" as const;
      },
    )().andThen(({ review, updatedLogCount }) =>
      saveExerciseWeightMigrationReviewInfra(review, doc).andThen(() =>
        rebuildTrainingSummarySheet(doc)
          .map(() => ({ review, updatedLogCount }))
          .mapErr(() => "summary-rebuild-failed" as const),
      ),
    );
  });
}

export function createExerciseWeightMigrationRepository(
  doc: GoogleSpreadsheet,
): ExerciseWeightMigrationRepository {
  return {
    loadReviews: () => loadExerciseWeightMigrationReviewsInfra(doc),
    saveReview: (review) => saveExerciseWeightMigrationReviewInfra(review, doc),
    applyDecision: (exerciseName, decision) =>
      applyExerciseWeightMigrationDecisionInfra(exerciseName, decision, doc),
  };
}
