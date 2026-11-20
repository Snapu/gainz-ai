import type { GoogleSpreadsheet } from "google-spreadsheet";
import { errAsync, ResultAsync } from "neverthrow";
import { ZodError, z } from "zod";
import {
  ensureSheetHeaders,
  findSheet,
  getOrCreateSheet,
  isAuthExpiredError,
  isNonRetryableClientError,
} from "@/modules/platform/infrastructure";
import { parseRows } from "@/modules/sharedKernel/domain";
import type { ExerciseLogRepository } from "@/modules/trainingLogs/application";
import { type ExerciseLog, ExerciseLogSchema } from "../domain/exerciseLog";

class RowNotFoundError extends Error {}

function mapMutationError<TTransient extends string>(
  operation: string,
  transientError: TTransient,
  error: unknown,
): TTransient | "validation-failed" | "auth-failed" {
  if (isAuthExpiredError(error)) {
    console.error(`Auth failed during ${operation}. Error:`, error);
    return "auth-failed";
  }
  if (error instanceof ZodError || isNonRetryableClientError(error)) {
    console.error(`Validation failed during ${operation}. Error:`, error);
    if (error instanceof ZodError) console.error(z.prettifyError(error));
    return "validation-failed";
  }
  console.error(`Failed to ${operation} exercise log. Error:`, error);
  return transientError;
}

const LOGS_SHEET_PREFIX = "Logs";
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

  private sheetTitle(year: number) {
    return `${LOGS_SHEET_PREFIX}${year}`;
  }

  private getSheet(year: number) {
    return this.doc.sheetsByTitle[this.sheetTitle(year)];
  }

  private async migrateExistingLogs(year: number): Promise<void> {
    const sheet = this.getSheet(year);
    if (!sheet) return;

    await sheet.loadHeaderRow();
    const headers = sheet.headerValues;

    if (!headers.includes("id")) {
      console.log("Migrating exercise logs - adding UUIDs to existing data...");

      const rows = await sheet.getRows();
      const rowData = rows.map((row) => row.toObject());

      // Append "id" at the end so legacy columns stay aligned while old rows remain on disk.
      await sheet.setHeaderRow([...headers, "id"]);
      await sheet.loadHeaderRow();

      const rowsWithIds = rowData.map((row) => ({
        ...row,
        id: crypto.randomUUID(),
      }));

      if (rowsWithIds.length > 0) {
        try {
          // Append migrated rows before removing legacy rows so an interrupted write never wipes data.
          await sheet.addRows(rowsWithIds);
        } catch (error) {
          await sheet.setHeaderRow(headers).catch(() => {});
          throw error;
        }
        await sheet.deleteRows(1, 1 + rows.length);
      }
      console.log(`Migration complete - added UUIDs to ${rowsWithIds.length} existing logs`);
    }

    await ensureSheetHeaders(sheet, CANONICAL_HEADERS);
  }

  loadCurrentYear(): ResultAsync<
    ExerciseLog[],
    "load-failed" | "parse-data-failed" | "auth-failed"
  > {
    return ResultAsync.fromThrowable(
      async () => {
        const year = new Date().getFullYear();
        const sheet = await getOrCreateSheet(this.doc, this.sheetTitle(year), CANONICAL_HEADERS);
        await this.migrateExistingLogs(year);
        const rows = await sheet.getRows<ExerciseLog>();
        console.debug("Fetched rows", rows);
        return rows.map((row) => row.toObject());
      },
      (error) => {
        if (isAuthExpiredError(error)) {
          console.error("Auth failed during load. Error:", error);
          return "auth-failed" as const;
        }
        console.error("Failed to load exercise logs. Error:", error);
        return "load-failed" as const;
      },
    )().andThen((rows) => parseRows(ExerciseLogSchema, rows));
  }

  addLog(log: ExerciseLog): ResultAsync<void, "add-failed" | "validation-failed" | "auth-failed"> {
    return ResultAsync.fromThrowable(
      async () => {
        const parsedLog = ExerciseLogSchema.parse({
          ...log,
          id: log.id || crypto.randomUUID(),
        });
        const sheet = await getOrCreateSheet(
          this.doc,
          this.sheetTitle(parsedLog.loggedAt.getFullYear()),
          CANONICAL_HEADERS,
        );
        await sheet.addRow(parsedLog);
      },
      (error) => mapMutationError("add", "add-failed", error),
    )();
  }

  deleteLog(
    log: ExerciseLog,
  ): ResultAsync<void, "delete-failed" | "validation-failed" | "auth-failed"> {
    return ResultAsync.fromThrowable(
      async () => {
        const loggedAt = ExerciseLogSchema.shape.loggedAt.parse(log.loggedAt);
        const sheet = await findSheet(this.doc, this.sheetTitle(loggedAt.getFullYear()));
        if (!sheet) {
          throw new Error("Sheet does not exist.");
        }
        const rows = await sheet.getRows<ExerciseLog>();
        const rowToDelete = rows.find((row) => row.get("id") === log.id);
        console.debug("Deleting row:", rowToDelete);
        await rowToDelete?.delete();
      },
      (error) => mapMutationError("delete", "delete-failed", error),
    )();
  }

  updateLog(
    log: ExerciseLog,
  ): ResultAsync<void, "update-failed" | "validation-failed" | "not-found" | "auth-failed"> {
    return ResultAsync.fromThrowable(
      async () => {
        const parsedLog = ExerciseLogSchema.parse(log);
        const sheet = await findSheet(this.doc, this.sheetTitle(parsedLog.loggedAt.getFullYear()));
        if (!sheet) {
          throw new Error("Sheet does not exist.");
        }
        const rows = await sheet.getRows<ExerciseLog>();
        const rowToUpdate = rows.find((row) => row.get("id") === log.id);
        if (!rowToUpdate) {
          throw new RowNotFoundError("Row not found");
        }
        console.debug("Updating row:", rowToUpdate, "with new log:", log);
        rowToUpdate.assign(parsedLog);
        await rowToUpdate.save();
      },
      (error) =>
        error instanceof RowNotFoundError
          ? ("not-found" as const)
          : mapMutationError("update", "update-failed", error),
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
  ): ResultAsync<
    ExerciseLog[],
    "load-failed" | "parse-data-failed" | "sheet-not-found" | "auth-failed"
  > {
    const sheet = this.getSheet(year);

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
        if (isAuthExpiredError(error)) {
          console.error(`Auth failed during load logs from year ${year}. Error:`, error);
          return "auth-failed" as const;
        }
        console.error(`Failed to load logs from year ${year}. Error:`, error);
        return "load-failed" as const;
      },
    )().andThen((rows) => parseRows(ExerciseLogSchema, rows));
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
