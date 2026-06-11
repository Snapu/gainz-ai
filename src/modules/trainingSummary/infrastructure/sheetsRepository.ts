import type { GoogleSpreadsheet } from "google-spreadsheet";
import { ResultAsync } from "neverthrow";
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

function loadTrainingSummaryInfra(
  doc: GoogleSpreadsheet,
): ResultAsync<TrainingSummary[], "load-failed" | "parse-data-failed"> {
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
      console.error("Failed to load training summary. Error:", error);
      return "load-failed" as const;
    },
  )().andThen((rows) => parseData(TrainingSummarySchema.array(), rows));
}

function saveTrainingSummaryRowsInfra(
  summaries: TrainingSummary[],
  doc: GoogleSpreadsheet,
): ResultAsync<void, "save-failed"> {
  return ResultAsync.fromThrowable(
    async () => {
      const sheet = await getOrCreateSheet(doc);
      const validatedRows = summaries.map((summary) => TrainingSummarySchema.parse(summary));
      await sheet.addRows(validatedRows);
    },
    (error) => {
      console.error("Failed to save training summary. Error:", error);
      return "save-failed" as const;
    },
  )();
}

function clearTrainingSummaryRowsInfra(doc: GoogleSpreadsheet): ResultAsync<void, "save-failed"> {
  return ResultAsync.fromThrowable(
    async () => {
      const sheet = await getOrCreateSheet(doc);
      await sheet.clearRows();
    },
    (error) => {
      console.error("Failed to clear training summary. Error:", error);
      return "save-failed" as const;
    },
  )();
}

export function createTrainingSummaryRepository(doc: GoogleSpreadsheet): TrainingSummaryRepository {
  return {
    load: () => loadTrainingSummaryInfra(doc),
    saveRows: (summaries) => saveTrainingSummaryRowsInfra(summaries, doc),
    clearRows: () => clearTrainingSummaryRowsInfra(doc),
  };
}
