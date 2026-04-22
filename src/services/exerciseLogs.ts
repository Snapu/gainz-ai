import type { GoogleSpreadsheet } from "google-spreadsheet";
import { err, ok, type Result } from "neverthrow";
import { ZodError, z } from "zod";
import { ExerciseNameSchema } from "./exercises";
import { parseData } from "./utils/parseData";

const optionalNumberSchema = z.preprocess((val) => {
  if (val === "" || val === null || val === undefined) return undefined;
  // Spreadsheet locale is set to en_US, so values use period as decimal separator
  const num = typeof val === "string" ? parseFloat(val) : Number(val);
  return Number.isNaN(num) ? undefined : num;
}, z.number().optional());

export const ExerciseLogSchema = z.object({
  id: z.uuid(),
  exerciseName: ExerciseNameSchema,
  reps: optionalNumberSchema,
  weight: optionalNumberSchema,
  distance: optionalNumberSchema,
  duration: optionalNumberSchema,
  rpe: optionalNumberSchema,
  loggedAt: z.coerce.date(),
});

export type ExerciseLog = z.infer<typeof ExerciseLogSchema>;

const LOGS_SHEET_PREFIX = "Logs";
const SHEET_NAME = `${LOGS_SHEET_PREFIX}${new Date().getFullYear()}`;
const getSheet = (doc: GoogleSpreadsheet) => doc.sheetsByTitle[SHEET_NAME];
const addSheet = (doc: GoogleSpreadsheet) =>
  doc.addSheet({
    title: SHEET_NAME,
    headerValues: [
      "id",
      "exerciseName",
      "reps",
      "weight",
      "distance",
      "duration",
      "rpe",
      "loggedAt",
    ],
  });

async function migrateExistingLogs(doc: GoogleSpreadsheet): Promise<void> {
  const sheet = getSheet(doc);
  if (!sheet) return;

  // Load header info first
  await sheet.loadHeaderRow();
  const headers = sheet.headerValues;

  // Check if migration already done
  if (headers.includes("id")) return;

  console.log("Migrating exercise logs - adding UUIDs to existing data...");

  try {
    // Get all row data before changing headers
    const rows = await sheet.getRows();
    const rowData = rows.map((row) => row.toObject());

    // Add id column as first column
    await sheet.setHeaderRow(["id", ...headers]);

    // Reload sheet to get updated structure
    await sheet.loadHeaderRow();

    // Clear and re-add all rows with UUIDs
    await sheet.clearRows();

    const rowsWithIds = rowData.map((row) => ({
      id: crypto.randomUUID(),
      ...row,
    }));

    await sheet.addRows(rowsWithIds);

    console.log(`Migration complete - added UUIDs to ${rowsWithIds.length} existing logs`);
  } catch (error) {
    console.error("Migration failed:", error);
    throw error;
  }
}

export async function loadExerciseLogs(
  doc: GoogleSpreadsheet,
): Promise<Result<ExerciseLog[], "load-failed" | "parse-data-failed" | "auth-failed">> {
  const sheet = getSheet(doc) ?? (await addSheet(doc));

  // Run migration for existing data (only runs once)
  await migrateExistingLogs(doc);

  try {
    const rows = await sheet.getRows<ExerciseLog>();
    console.debug("Fetched rows", rows);
    return parseData(
      ExerciseLogSchema.array(),
      rows.map((row) => row.toObject()),
    );
  } catch (error) {
    // Check for auth errors from google-spreadsheet
    if (
      error &&
      typeof error === "object" &&
      "response" in error &&
      error.response &&
      typeof error.response === "object" &&
      "status" in error.response
    ) {
      const status = error.response.status;
      if (status === 401 || status === 403) {
        console.error("Auth failed during loadExerciseLogs. Error:", error);
        return err("auth-failed");
      }
    }
    console.error("Failed to load exercise logs. Error:", error);
    return err("load-failed");
  }
}

export async function addExerciseLog(
  exerciseLog: ExerciseLog,
  doc: GoogleSpreadsheet,
): Promise<Result<void, "add-failed" | "duplicate-name" | "auth-failed">> {
  try {
    const sheet = getSheet(doc) ?? (await addSheet(doc));

    // Ensure ID exists (defensive programming for migration edge cases)
    const logWithId = {
      ...exerciseLog,
      id: exerciseLog.id || crypto.randomUUID(),
    };

    await sheet.addRow(ExerciseLogSchema.parse(logWithId));
    return ok();
  } catch (error) {
    // Check for auth errors
    if (
      error &&
      typeof error === "object" &&
      "response" in error &&
      error.response &&
      typeof error.response === "object" &&
      "status" in error.response
    ) {
      const status = error.response.status;
      if (status === 401 || status === 403) {
        console.error("Auth failed during addExerciseLog. Error:", error);
        return err("auth-failed");
      }
    }
    console.error("failed to add exercise log. Error:", error);
    if (error instanceof ZodError) console.error(z.prettifyError(error));
    return err("add-failed");
  }
}

export async function deleteExerciseLog(
  exerciseLog: ExerciseLog,
  doc: GoogleSpreadsheet,
): Promise<Result<void, "delete-failed" | "auth-failed">> {
  const sheet = getSheet(doc);
  if (!sheet) {
    console.error("Failed to delete exercise log. Sheet does not exist.");
    return err("delete-failed");
  }
  try {
    const rows = await sheet.getRows<ExerciseLog>();
    const rowToDelete = await rows.find((row) => row.get("id") === exerciseLog.id);
    console.debug("Deleting row:", rowToDelete);
    await rowToDelete?.delete();
    return ok();
  } catch (error) {
    // Check for auth errors
    if (
      error &&
      typeof error === "object" &&
      "response" in error &&
      error.response &&
      typeof error.response === "object" &&
      "status" in error.response
    ) {
      const status = error.response.status;
      if (status === 401 || status === 403) {
        console.error("Auth failed during deleteExerciseLog. Error:", error);
        return err("auth-failed");
      }
    }
    console.error("Failed to delete exercise log. Error:", error);
    return err("delete-failed");
  }
}

export function findPastYearLogSheets(doc: GoogleSpreadsheet): number[] {
  const currentYear = new Date().getFullYear();
  const pastYears: number[] = [];

  for (const title of Object.keys(doc.sheetsByTitle)) {
    if (title.startsWith(LOGS_SHEET_PREFIX)) {
      const yearStr = title.slice(LOGS_SHEET_PREFIX.length);
      const year = Number(yearStr);
      if (!Number.isNaN(year) && year < currentYear) {
        pastYears.push(year);
      }
    }
  }

  return pastYears.sort((a, b) => a - b);
}

export async function loadLogsFromYear(
  year: number,
  doc: GoogleSpreadsheet,
): Promise<Result<ExerciseLog[], "load-failed" | "parse-data-failed" | "sheet-not-found">> {
  const sheetName = `${LOGS_SHEET_PREFIX}${year}`;
  const sheet = doc.sheetsByTitle[sheetName];

  if (!sheet) return err("sheet-not-found");

  try {
    const rows = await sheet.getRows<ExerciseLog>();
    // Add IDs to rows that don't have them (for legacy data migration)
    const rowsWithIds = rows.map((row) => {
      const obj = row.toObject();
      return {
        ...obj,
        id: obj.id || crypto.randomUUID(),
      };
    });
    return parseData(ExerciseLogSchema.array(), rowsWithIds);
  } catch (error) {
    console.error(`Failed to load logs from year ${year}. Error:`, error);
    return err("load-failed");
  }
}
