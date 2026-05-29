import type { GoogleSpreadsheet } from "google-spreadsheet";
import { errAsync, ResultAsync } from "neverthrow";
import { ZodError, z } from "zod";
import { isAuthError } from "@/modules/platform/infrastructure";
import { parseData } from "@/modules/sharedKernel/domain";
import type { ExerciseLogRepository } from "@/modules/trainingLogs/application";
import { type ExerciseLog, ExerciseLogSchema } from "../domain/exerciseLog";

const LOGS_SHEET_PREFIX = "Logs";
const SHEET_NAME = LOGS_SHEET_PREFIX + new Date().getFullYear();
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
      console.log("Migration complete - added UUIDs to " + rowsWithIds.length + " existing logs");
    }

    await sheet.loadHeaderRow();
    const currentHeaders = sheet.headerValues;
    const missingHeaders = CANONICAL_HEADERS.filter((h) => !currentHeaders.includes(h));
    if (missingHeaders.length > 0) {
      console.log("Adding missing columns to exercise logs sheet:", missingHeaders);
      await sheet.setHeaderRow([...currentHeaders, ...missingHeaders]);
    }
  }

  loadCurrentYear(): ResultAsync<
    ExerciseLog[],
    "load-failed" | "parse-data-failed" | "auth-failed"
  > {
    return ResultAsync.fromThrowable(
      async () => {
        const sheet = this.getSheet() ?? (await this.addSheet());
        await this.migrateExistingLogs();
        const rows = await sheet.getRows<ExerciseLog>();
        console.debug("Fetched rows", rows);
        return rows.map((row) => row.toObject());
      },
      (error) => {
        if (isAuthError(error)) {
          console.error("Auth failed during load. Error:", error);
          return "auth-failed" as const;
        }
        console.error("Failed to load exercise logs. Error:", error);
        return "load-failed" as const;
      },
    )().andThen((rows) => parseData(ExerciseLogSchema.array(), rows));
  }

  addLog(log: ExerciseLog): ResultAsync<void, "add-failed" | "auth-failed"> {
    return ResultAsync.fromThrowable(
      async () => {
        const sheet = this.getSheet() ?? (await this.addSheet());

        const logWithId = {
          ...log,
          id: log.id || crypto.randomUUID(),
        };

        await sheet.addRow(ExerciseLogSchema.parse(logWithId));
      },
      (error) => {
        if (isAuthError(error)) {
          console.error("Auth failed during add. Error:", error);
          return "auth-failed" as const;
        }
        console.error("Failed to add exercise log. Error:", error);
        if (error instanceof ZodError) console.error(z.prettifyError(error));
        return "add-failed" as const;
      },
    )();
  }

  deleteLog(log: ExerciseLog): ResultAsync<void, "delete-failed" | "auth-failed"> {
    const sheet = this.getSheet();
    if (!sheet) {
      console.error("Failed to delete exercise log. Sheet does not exist.");
      return errAsync("delete-failed" as const);
    }
    return ResultAsync.fromThrowable(
      async () => {
        const rows = await sheet.getRows<ExerciseLog>();
        const rowToDelete = rows.find((row) => row.get("id") === log.id);
        console.debug("Deleting row:", rowToDelete);
        await rowToDelete?.delete();
      },
      (error) => {
        if (isAuthError(error)) {
          console.error("Auth failed during delete. Error:", error);
          return "auth-failed" as const;
        }
        console.error("Failed to delete exercise log. Error:", error);
        return "delete-failed" as const;
      },
    )();
  }

  updateLog(log: ExerciseLog): ResultAsync<void, "update-failed" | "auth-failed"> {
    const sheet = this.getSheet();
    if (!sheet) {
      console.error("Failed to update exercise log. Sheet does not exist.");
      return errAsync("update-failed" as const);
    }
    return ResultAsync.fromThrowable(
      async () => {
        const rows = await sheet.getRows<ExerciseLog>();
        const rowToUpdate = rows.find((row) => row.get("id") === log.id);
        if (!rowToUpdate) {
          throw new Error("Row not found");
        }
        console.debug("Updating row:", rowToUpdate, "with new log:", log);
        rowToUpdate.assign(ExerciseLogSchema.parse(log));
        await rowToUpdate.save();
      },
      (error) => {
        if (isAuthError(error)) {
          console.error("Auth failed during update. Error:", error);
          return "auth-failed" as const;
        }
        console.error("Failed to update exercise log. Error:", error);
        if (error instanceof ZodError) console.error(z.prettifyError(error));
        return "update-failed" as const;
      },
    )();
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

  loadYear(
    year: number,
  ): ResultAsync<ExerciseLog[], "load-failed" | "parse-data-failed" | "sheet-not-found"> {
    const sheetName = LOGS_SHEET_PREFIX + year;
    const sheet = this.doc.sheetsByTitle[sheetName];

    if (!sheet) return errAsync("sheet-not-found" as const);

    return ResultAsync.fromThrowable(
      async () => {
        const rows = await sheet.getRows<ExerciseLog>();
        return rows.map((row) => {
          const obj = row.toObject();
          return {
            ...obj,
            id: obj.id || crypto.randomUUID(),
          };
        });
      },
      (error) => {
        console.error("Failed to load logs from year " + year + ". Error:", error);
        return "load-failed" as const;
      },
    )().andThen((rows) => parseData(ExerciseLogSchema.array(), rows));
  }
}

export function createExerciseLogRepository(doc: GoogleSpreadsheet): ExerciseLogRepository {
  const repository = new ExerciseLogsSheetsRepository(doc);

  return {
    loadCurrentYear: () => repository.loadCurrentYear(),
    addLog: (log) => repository.addLog(log),
    updateLog: (log) => repository.updateLog(log),
    deleteLog: (log) => repository.deleteLog(log),
    findPastYearSheets: () => repository.findPastYearSheets(),
    loadYear: (year) => repository.loadYear(year),
  };
}
