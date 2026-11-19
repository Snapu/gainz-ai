import type { GoogleSpreadsheet } from "google-spreadsheet";
import { ResultAsync } from "neverthrow";
import { isAuthError } from "@/modules/platform/infrastructure";
import { parseData } from "@/modules/sharedKernel/domain";
import type { TrainingSummaryRepository } from "@/modules/trainingSummary/application";
import { type TrainingSummary, TrainingSummarySchema } from "@/modules/trainingSummary/domain";

const SHEET_NAME = "TrainingSummary";
const HEADER_VALUES = [
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
];

const getSheet = (doc: GoogleSpreadsheet) => doc.sheetsByTitle[SHEET_NAME];
const addSheet = (doc: GoogleSpreadsheet) =>
  doc.addSheet({ title: SHEET_NAME, headerValues: HEADER_VALUES });

async function getOrCreateSheet(doc: GoogleSpreadsheet) {
  return getSheet(doc) ?? (await addSheet(doc));
}

function mapSaveError(action: string, error: unknown): "save-failed" | "auth-failed" {
  if (isAuthError(error)) return "auth-failed";
  console.error(`Failed to ${action} training summary. Error:`, error);
  return "save-failed";
}

function loadTrainingSummaryInfra(
  doc: GoogleSpreadsheet,
): ResultAsync<TrainingSummary[], "load-failed" | "parse-data-failed" | "auth-failed"> {
  return ResultAsync.fromThrowable(
    async () => {
      const sheet = await getOrCreateSheet(doc);
      const rows = await sheet.getRows<TrainingSummary>();
      const currentYear = new Date().getFullYear();
      const currentMonth = new Date().getMonth() + 1;

      return rows
        .map((row) => row.toObject())
        .filter((r) => !(Number(r.year) === currentYear && Number(r.month) === currentMonth));
    },
    (error) => {
      if (isAuthError(error)) return "auth-failed" as const;
      console.error("Failed to load training summary. Error:", error);
      return "load-failed" as const;
    },
  )().andThen((rows) => parseData(TrainingSummarySchema.array(), rows));
}

function saveTrainingSummaryRowsInfra(
  summaries: TrainingSummary[],
  doc: GoogleSpreadsheet,
): ResultAsync<void, "save-failed" | "auth-failed"> {
  return ResultAsync.fromThrowable(
    async () => {
      const validatedRows = summaries.map((summary) => TrainingSummarySchema.parse(summary));
      if (validatedRows.length === 0) return;
      const sheet = await getOrCreateSheet(doc);
      await sheet.addRows(validatedRows);
    },
    (error) => mapSaveError("save", error),
  )();
}

function replaceTrainingSummaryRowsInfra(
  summaries: TrainingSummary[],
  doc: GoogleSpreadsheet,
): ResultAsync<void, "save-failed" | "auth-failed"> {
  return ResultAsync.fromThrowable(
    async () => {
      const validatedRows = summaries.map((summary) => TrainingSummarySchema.parse(summary));
      const sheet = await getOrCreateSheet(doc);
      const existingRows = await sheet.getRows();

      if (validatedRows.length === 0) {
        if (existingRows.length > 0) {
          await sheet.clearRows();
        }
        return;
      }

      // Append before removing old rows so a failed write or expired token never leaves the sheet blank.
      await sheet.addRows(validatedRows);

      if (existingRows.length > 0) {
        await sheet.deleteRows(1, 1 + existingRows.length);
      }
    },
    (error) => mapSaveError("replace", error),
  )();
}

export function createTrainingSummaryRepository(doc: GoogleSpreadsheet): TrainingSummaryRepository {
  return {
    load: () => loadTrainingSummaryInfra(doc),
    saveRows: (summaries) => saveTrainingSummaryRowsInfra(summaries, doc),
    replaceRows: (summaries) => replaceTrainingSummaryRowsInfra(summaries, doc),
  };
}
