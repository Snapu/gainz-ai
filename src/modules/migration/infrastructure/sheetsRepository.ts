import * as Sentry from "@sentry/vue";
import type { GoogleSpreadsheet } from "google-spreadsheet";
import { errAsync, okAsync, Result, ResultAsync } from "neverthrow";
import type { ExerciseWeightMigrationRepository } from "@/modules/migration/application";
import { isAuthError } from "@/modules/platform/infrastructure";

import {
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

function loadExerciseWeightMigrationReviewsInfra(
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

function saveExerciseWeightMigrationReviewInfra(
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

function applyWeightMultiplierInfra(
  exerciseName: string,
  multiplier: number,
  doc: GoogleSpreadsheet,
): ResultAsync<number, MigrationApplyError> {
  const normalizedExerciseName = normalizeExerciseName(exerciseName);
  return loadExerciseWeightMigrationReviewsInfra(doc).andThen((reviews) => {
    if (
      reviews.some(
        (review) => normalizeExerciseName(review.exerciseName) === normalizedExerciseName,
      )
    ) {
      return errAsync<number, MigrationApplyError>("already-reviewed");
    }

    return ResultAsync.fromThrowable(
      async () => {
        let updatedLogCount = 0;

        for (const sheet of getLogSheets(doc)) {
          const rows = (await sheet.getRows()) as SheetRow[];
          for (const row of rows) {
            const rawExerciseName = String(row.get("exerciseName") ?? "").trim();
            if (!rawExerciseName) continue;
            const rowExerciseName = normalizeExerciseName(rawExerciseName);
            if (rowExerciseName !== normalizedExerciseName) continue;

            const weight = parseWeight(row.get("weight"));
            if (weight === undefined) continue;

            if (multiplier !== 1) {
              row.assign({ weight: String(weight * multiplier) });
              await row.save();
            }
            updatedLogCount += 1;
          }
        }

        return updatedLogCount;
      },
      (error) => {
        if (isAuthError(error)) return "auth-failed" as const;
        Sentry.captureException(error, {
          tags: { scope: "exercise-weight-migration", feature: "apply-multiplier" },
        });
        return "save-failed" as const;
      },
    )();
  });
}

export function createExerciseWeightMigrationRepository(
  doc: GoogleSpreadsheet,
): ExerciseWeightMigrationRepository {
  return {
    loadReviews: () => loadExerciseWeightMigrationReviewsInfra(doc),
    saveReview: (review: ExerciseWeightMigrationReview) =>
      saveExerciseWeightMigrationReviewInfra(review, doc),
    applyWeightMultiplier: (exerciseName: string, multiplier: number) =>
      applyWeightMultiplierInfra(exerciseName, multiplier, doc),
  };
}
