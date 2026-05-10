import type { GoogleSpreadsheet } from "google-spreadsheet";
import { err, ok, type Result } from "neverthrow";
import { ZodError, z } from "zod";
import { parseData } from "@/modules/shared/domain";
import { isAuthError } from "@/modules/shared/infrastructure/utils/isAuthError";
import type { TrainingLogsRepository } from "@/modules/trainingLogs/application";
import { type ExerciseLog, ExerciseLogSchema } from "../domain/exerciseLog";

const LOGS_SHEET_PREFIX = "Logs";
const SHEET_NAME = `${LOGS_SHEET_PREFIX}${new Date().getFullYear()}`;
const CANONICAL_HEADERS = [
  "id",
  "exerciseName",
  "reps",
  "weight",
  "distance",
  "duration",
  "rpe",
  "loggedAt",
];

/**
 * Google Sheets repository adapter for exercise logs.
 * Encapsulates all sheet operations and persistence logic.
 */
export class ExerciseLogsSheetsRepository {
  constructor(private doc: GoogleSpreadsheet) {}

  private getSheet() {
    return this.doc.sheetsByTitle[SHEET_NAME];
  }

  private async addSheet() {
    return this.doc.addSheet({
      title: SHEET_NAME,
      headerValues: CANONICAL_HEADERS,
    });
  }

  private async migrateExistingLogs(): Promise<void> {
    const sheet = this.getSheet();
    if (!sheet) return;

    await sheet.loadHeaderRow();
    const headers = sheet.headerValues;

    if (!headers.includes("id")) {
      console.log("Migrating exercise logs - adding UUIDs to existing data...");

      try {
        const rows = await sheet.getRows();
        const rowData = rows.map((row) => row.toObject());

        await sheet.setHeaderRow(["id", ...headers]);
        await sheet.loadHeaderRow();
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

    await sheet.loadHeaderRow();
    const currentHeaders = sheet.headerValues;
    const missingHeaders = CANONICAL_HEADERS.filter((h) => !currentHeaders.includes(h));
    if (missingHeaders.length > 0) {
      console.log("Adding missing columns to exercise logs sheet:", missingHeaders);
      await sheet.setHeaderRow([...currentHeaders, ...missingHeaders]);
    }
  }

  async loadCurrentYear(): Promise<
    Result<ExerciseLog[], "load-failed" | "parse-data-failed" | "auth-failed">
  > {
    const sheet = this.getSheet() ?? (await this.addSheet());

    await this.migrateExistingLogs();

    try {
      const rows = await sheet.getRows<ExerciseLog>();
      console.debug("Fetched rows", rows);
      return parseData(
        ExerciseLogSchema.array(),
        rows.map((row) => row.toObject()),
      );
    } catch (error) {
      if (isAuthError(error)) {
        console.error("Auth failed during load. Error:", error);
        return err("auth-failed");
      }
      console.error("Failed to load exercise logs. Error:", error);
      return err("load-failed");
    }
  }

  async addLog(log: ExerciseLog): Promise<Result<void, "add-failed" | "auth-failed">> {
    try {
      const sheet = this.getSheet() ?? (await this.addSheet());

      const logWithId = {
        ...log,
        id: log.id || crypto.randomUUID(),
      };

      await sheet.addRow(ExerciseLogSchema.parse(logWithId));
      return ok();
    } catch (error) {
      if (isAuthError(error)) {
        console.error("Auth failed during add. Error:", error);
        return err("auth-failed");
      }
      console.error("Failed to add exercise log. Error:", error);
      if (error instanceof ZodError) console.error(z.prettifyError(error));
      return err("add-failed");
    }
  }

  async deleteLog(log: ExerciseLog): Promise<Result<void, "delete-failed" | "auth-failed">> {
    const sheet = this.getSheet();
    if (!sheet) {
      console.error("Failed to delete exercise log. Sheet does not exist.");
      return err("delete-failed");
    }
    try {
      const rows = await sheet.getRows<ExerciseLog>();
      const rowToDelete = rows.find((row) => row.get("id") === log.id);
      console.debug("Deleting row:", rowToDelete);
      await rowToDelete?.delete();
      return ok();
    } catch (error) {
      if (isAuthError(error)) {
        console.error("Auth failed during delete. Error:", error);
        return err("auth-failed");
      }
      console.error("Failed to delete exercise log. Error:", error);
      return err("delete-failed");
    }
  }

  findPastYearSheets(): number[] {
    const currentYear = new Date().getFullYear();
    const pastYears: number[] = [];

    for (const title of Object.keys(this.doc.sheetsByTitle)) {
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

  async loadYear(
    year: number,
  ): Promise<Result<ExerciseLog[], "load-failed" | "parse-data-failed" | "sheet-not-found">> {
    const sheetName = `${LOGS_SHEET_PREFIX}${year}`;
    const sheet = this.doc.sheetsByTitle[sheetName];

    if (!sheet) return err("sheet-not-found");

    try {
      const rows = await sheet.getRows<ExerciseLog>();
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
}

export function createTrainingLogsRepository(doc: GoogleSpreadsheet): TrainingLogsRepository {
  const repository = new ExerciseLogsSheetsRepository(doc);

  return {
    loadCurrentYear: () => repository.loadCurrentYear(),
    addLog: (log) => repository.addLog(log),
    deleteLog: (log) => repository.deleteLog(log),
    findPastYearSheets: () => repository.findPastYearSheets(),
    loadYear: (year) => repository.loadYear(year),
  };
}
