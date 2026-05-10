import * as Sentry from "@sentry/vue";
import type { GoogleSpreadsheet } from "google-spreadsheet";
import { err, ok, type Result } from "neverthrow";
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

async function loadAllLogsForSummary(
  doc: GoogleSpreadsheet,
): Promise<Result<ExerciseLog[], "load-failed" | "auth-failed">> {
  try {
    const logs: ExerciseLog[] = [];

    for (const sheet of getLogSheets(doc)) {
      const rows = (await sheet.getRows()) as SheetRow[];
      for (const row of rows) {
        const log = rowToExerciseLog(row);
        if (log) logs.push(log);
      }
    }

    return ok(logs);
  } catch (error) {
    if (isAuthError(error)) return err("auth-failed");
    Sentry.captureException(error, {
      tags: { scope: "exercise-weight-migration", feature: "summary-rebuild-load" },
    });
    return err("load-failed");
  }
}

async function rebuildTrainingSummarySheet(
  doc: GoogleSpreadsheet,
): Promise<Result<TrainingSummary[], "load-failed" | "auth-failed" | "save-failed">> {
  const logsResult = await loadAllLogsForSummary(doc);
  if (logsResult.isErr()) return err(logsResult.error);

  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;
  const logsExcludingCurrentMonth = logsResult.value.filter(
    (log) =>
      !(log.loggedAt.getFullYear() === currentYear && log.loggedAt.getMonth() + 1 === currentMonth),
  );

  const summaries = aggregateLogsToSummary(logsExcludingCurrentMonth);

  try {
    const sheet = await ensureTrainingSummarySheet(doc);
    await sheet.clearRows();
    if (summaries.length > 0) {
      await sheet.addRows(summaries);
    }
    return ok(summaries);
  } catch (error) {
    if (isAuthError(error)) return err("auth-failed");
    Sentry.captureException(error, {
      tags: { scope: "exercise-weight-migration", feature: "summary-rebuild-save" },
    });
    return err("save-failed");
  }
}

export async function loadExerciseWeightMigrationReviewsInfra(
  doc: GoogleSpreadsheet,
): Promise<Result<ExerciseWeightMigrationReview[], MigrationLoadError>> {
  try {
    const sheet = getSheet(doc) ?? (await ensureSheet(doc));
    await ensureHeaders(sheet);
    const rows = await sheet.getRows();
    const parsed = safeParseMigrationReviews(rows.map((row) => row.toObject()));

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

export async function saveExerciseWeightMigrationReviewInfra(
  review: ExerciseWeightMigrationReview,
  doc: GoogleSpreadsheet,
): Promise<Result<void, MigrationSaveError>> {
  try {
    const sheet = await ensureSheet(doc);
    await ensureHeaders(sheet);
    const normalizedReview = parseMigrationReview(review);
    const rows = (await sheet.getRows()) as SheetRow[];
    const existingRow = rows.find((row) => {
      const rawExerciseName = row.get("exerciseName");
      if (!rawExerciseName) return false;

      try {
        return normalizeExerciseName(String(rawExerciseName)) === normalizedReview.exerciseName;
      } catch {
        return false;
      }
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

export async function applyExerciseWeightMigrationDecisionInfra(
  exerciseName: string,
  decision: ExerciseWeightMigrationDecision,
  doc: GoogleSpreadsheet,
): Promise<Result<ApplyExerciseWeightMigrationResult, MigrationApplyError>> {
  const normalizedExerciseName = normalizeExerciseName(exerciseName);
  const reviewsResult = await loadExerciseWeightMigrationReviewsInfra(doc);
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

    const saveResult = await saveExerciseWeightMigrationReviewInfra(review, doc);
    if (saveResult.isErr()) return err(saveResult.error);

    const summaryResult = await rebuildTrainingSummarySheet(doc);
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
