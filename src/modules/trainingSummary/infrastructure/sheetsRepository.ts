import type { GoogleSpreadsheet } from "google-spreadsheet";
import { err, ok, type Result } from "neverthrow";
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

export async function loadTrainingSummaryInfra(
  doc: GoogleSpreadsheet,
): Promise<Result<TrainingSummary[], "load-failed" | "parse-data-failed">> {
  const sheet = await getOrCreateSheet(doc);

  try {
    const rows = await sheet.getRows<TrainingSummary>();
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth() + 1;

    return parseData(
      TrainingSummarySchema.array(),
      rows
        .map((row) => row.toObject())
        .filter((r) => !(Number(r.year) === currentYear && Number(r.month) === currentMonth)),
    );
  } catch (error) {
    console.error("Failed to load training summary. Error:", error);
    return err("load-failed");
  }
}

export async function saveTrainingSummaryRowsInfra(
  summaries: TrainingSummary[],
  doc: GoogleSpreadsheet,
): Promise<Result<void, "save-failed">> {
  const sheet = await getOrCreateSheet(doc);

  try {
    const validatedRows = summaries.map((summary) => TrainingSummarySchema.parse(summary));
    await sheet.addRows(validatedRows);
    return ok();
  } catch (error) {
    console.error("Failed to save training summary. Error:", error);
    return err("save-failed");
  }
}

export async function clearTrainingSummaryRowsInfra(
  doc: GoogleSpreadsheet,
): Promise<Result<void, "save-failed">> {
  const sheet = await getOrCreateSheet(doc);

  try {
    await sheet.clearRows();
    return ok();
  } catch (error) {
    console.error("Failed to clear training summary. Error:", error);
    return err("save-failed");
  }
}

export function createTrainingSummaryRepository(doc: GoogleSpreadsheet): TrainingSummaryRepository {
  return {
    load: () => loadTrainingSummaryInfra(doc),
    saveRows: (summaries) => saveTrainingSummaryRowsInfra(summaries, doc),
    clearRows: () => clearTrainingSummaryRowsInfra(doc),
  };
}
