import type { GoogleSpreadsheet } from "google-spreadsheet";
import { err, ok, type Result } from "neverthrow";
import { z } from "zod";
import {
  type ExerciseLog,
  findPastYearLogSheets,
  loadExerciseLogs,
  loadLogsFromYear,
} from "./exerciseLogs";
import { parseData } from "./utils/parseData";

const TrainingSummarySchema = z.object({
  year: z.coerce.number(),
  month: z.coerce.number().min(1).max(12),
  workoutDays: z.coerce.number(),
  exerciseName: z.string(),
  sets: z.coerce.number(),
  totalReps: z.coerce.number().optional(),
  maxWeight: z.coerce.number().optional(),
  totalVolume: z.coerce.number().optional(),
  totalDistance: z.coerce.number().optional(),
  totalDuration: z.coerce.number().optional(),
});

export type TrainingSummary = z.infer<typeof TrainingSummarySchema>;

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

export async function loadTrainingSummary(
  doc: GoogleSpreadsheet,
): Promise<Result<TrainingSummary[], "load-failed" | "parse-data-failed">> {
  const sheet = getSheet(doc) ?? (await addSheet(doc));

  try {
    const rows = await sheet.getRows<TrainingSummary>();
    return parseData(
      TrainingSummarySchema.array(),
      rows.map((row) => row.toObject()),
    );
  } catch (error) {
    console.error("Failed to load training summary. Error:", error);
    return err("load-failed");
  }
}

async function saveTrainingSummaryRows(
  summaries: TrainingSummary[],
  doc: GoogleSpreadsheet,
): Promise<Result<void, "save-failed">> {
  const sheet = getSheet(doc) ?? (await addSheet(doc));

  try {
    const validatedRows = summaries.map((s) => TrainingSummarySchema.parse(s));
    await sheet.addRows(validatedRows);
    return ok();
  } catch (error) {
    console.error("Failed to save training summary. Error:", error);
    return err("save-failed");
  }
}

async function loadAllLogsForSummary(
  doc: GoogleSpreadsheet,
): Promise<Result<ExerciseLog[], "load-failed" | "parse-data-failed" | "sheet-not-found" | "auth-failed">> {
  const currentYearLogsResult = await loadExerciseLogs(doc);
  if (currentYearLogsResult.isErr()) return err(currentYearLogsResult.error);

  const logs = [...currentYearLogsResult.value];
  const pastYears = findPastYearLogSheets(doc);

  for (const year of pastYears) {
    const yearLogsResult = await loadLogsFromYear(year, doc);
    if (yearLogsResult.isErr()) return err(yearLogsResult.error);
    logs.push(...yearLogsResult.value);
  }

  return ok(logs);
}

export async function rebuildTrainingSummary(
  doc: GoogleSpreadsheet,
): Promise<
  Result<
    TrainingSummary[],
    "load-failed" | "parse-data-failed" | "sheet-not-found" | "auth-failed" | "save-failed"
  >
> {
  const logsResult = await loadAllLogsForSummary(doc);
  if (logsResult.isErr()) return err(logsResult.error);

  const sheet = getSheet(doc) ?? (await addSheet(doc));
  const summaries = aggregateLogsToSummary(logsResult.value);

  try {
    await sheet.clearRows();
  } catch (error) {
    console.error("Failed to clear training summary. Error:", error);
    return err("save-failed");
  }

  const saveResult = await saveTrainingSummaryRows(summaries, doc);
  if (saveResult.isErr()) return err(saveResult.error);

  return ok(summaries);
}

export function aggregateLogsToSummary(logs: ExerciseLog[]): TrainingSummary[] {
  if (logs.length === 0) return [];

  const byYearMonth = new Map<string, ExerciseLog[]>();

  for (const log of logs) {
    const year = log.loggedAt.getFullYear();
    const month = log.loggedAt.getMonth() + 1;
    const key = `${year}-${month}`;

    if (!byYearMonth.has(key)) byYearMonth.set(key, []);
    byYearMonth.get(key)?.push(log);
  }

  const summaries: TrainingSummary[] = [];

  for (const [yearMonthKey, monthLogs] of byYearMonth) {
    const parts = yearMonthKey.split("-");
    const year = Number(parts[0]);
    const month = Number(parts[1]);

    const uniqueDays = new Set(monthLogs.map((log) => log.loggedAt.toISOString().slice(0, 10)));
    const workoutDays = uniqueDays.size;

    const byExercise = new Map<string, ExerciseLog[]>();
    for (const log of monthLogs) {
      if (!byExercise.has(log.exerciseName)) byExercise.set(log.exerciseName, []);
      byExercise.get(log.exerciseName)?.push(log);
    }

    for (const [exerciseName, exerciseLogs] of byExercise) {
      const sets = exerciseLogs.length;

      const repsLogs = exerciseLogs.filter((l) => l.reps != null);
      const totalReps =
        repsLogs.length > 0 ? repsLogs.reduce((sum, l) => sum + l.reps!, 0) : undefined;

      const weightLogs = exerciseLogs.filter((l) => l.weight != null);
      const maxWeight =
        weightLogs.length > 0 ? Math.max(...weightLogs.map((l) => l.weight!)) : undefined;

      const volumeLogs = exerciseLogs.filter((l) => l.reps != null && l.weight != null);
      const totalVolume =
        volumeLogs.length > 0
          ? volumeLogs.reduce((sum, l) => sum + l.reps! * l.weight!, 0)
          : undefined;

      const distanceLogs = exerciseLogs.filter((l) => l.distance != null);
      const totalDistance =
        distanceLogs.length > 0 ? distanceLogs.reduce((sum, l) => sum + l.distance!, 0) : undefined;

      const durationLogs = exerciseLogs.filter((l) => l.duration != null);
      const totalDuration =
        durationLogs.length > 0 ? durationLogs.reduce((sum, l) => sum + l.duration!, 0) : undefined;

      summaries.push({
        year,
        month,
        workoutDays,
        exerciseName,
        sets,
        totalReps,
        maxWeight,
        totalVolume,
        totalDistance,
        totalDuration,
      });
    }
  }

  return summaries;
}

function getWorkoutDaysFromSummary(summaries: TrainingSummary[]): Map<string, number> {
  const workoutDaysMap = new Map<string, number>();

  for (const summary of summaries) {
    const key = `${summary.year}-${summary.month}`;
    if (!workoutDaysMap.has(key)) {
      workoutDaysMap.set(key, summary.workoutDays);
    }
  }

  return workoutDaysMap;
}

export function summaryToWorkoutDates(summaries: TrainingSummary[]): Date[] {
  const workoutDaysMap = getWorkoutDaysFromSummary(summaries);
  const dates: Date[] = [];

  for (const [key, days] of workoutDaysMap) {
    const parts = key.split("-");
    const year = Number(parts[0]);
    const month = Number(parts[1]);

    for (let i = 0; i < days; i++) {
      const dayOfMonth = Math.min(1 + i * 2, 28);
      dates.push(new Date(year, month - 1, dayOfMonth));
    }
  }

  return dates;
}

/**
 * Reconstruct ExerciseLogs from TrainingSummary for XP calculation.
 * This is an approximation since raw log data for summarized months is archived.
 */
export function summaryToExerciseLogs(summaries: TrainingSummary[]): ExerciseLog[] {
  const logs: ExerciseLog[] = [];
  const datesByYearMonth = new Map<string, Date[]>();

  // Map summaries to their workout dates first
  const workoutDaysMap = getWorkoutDaysFromSummary(summaries);
  for (const [key, days] of workoutDaysMap) {
    const parts = key.split("-");
    const year = Number(parts[0]);
    const month = Number(parts[1]);
    const dates: Date[] = [];
    for (let i = 0; i < days; i++) {
      const dayOfMonth = Math.min(1 + i * 2, 28);
      dates.push(new Date(year, month - 1, dayOfMonth));
    }
    datesByYearMonth.set(key, dates);
  }

  for (const summary of summaries) {
    const key = `${summary.year}-${summary.month}`;
    const dates = datesByYearMonth.get(key) || [];
    if (dates.length === 0) continue;

    // Distribute sets across the workout days in that month
    const setsPerDay = Math.ceil(summary.sets / dates.length);
    let setsRemaining = summary.sets;

    for (let i = 0; i < dates.length && setsRemaining > 0; i++) {
      const date = dates[i]!;
      const setsThisDay = Math.min(setsPerDay, setsRemaining);

      for (let s = 0; s < setsThisDay; s++) {
        logs.push({
          id: `hist-${summary.year}-${summary.month}-${summary.exerciseName}-${setsRemaining}`,
          exerciseName: summary.exerciseName,
          loggedAt: date,
          weight: summary.maxWeight,
          reps: summary.totalReps ? Math.floor(summary.totalReps / summary.sets) : 10,
          rpe: 8,
        });
        setsRemaining--;
      }
    }
  }

  return logs;
}

export function getYearsSummarized(summaries: TrainingSummary[]): Set<number> {
  return new Set(summaries.map((s) => s.year));
}

export function getYearMonthsSummarized(summaries: TrainingSummary[]): Set<string> {
  return new Set(summaries.map((s) => `${s.year}-${s.month}`));
}

async function rollupYearToSummary(
  year: number,
  doc: GoogleSpreadsheet,
): Promise<
  Result<TrainingSummary[], "load-failed" | "parse-data-failed" | "sheet-not-found" | "save-failed">
> {
  const logsResult = await loadLogsFromYear(year, doc);
  if (logsResult.isErr()) return err(logsResult.error);

  const summaries = aggregateLogsToSummary(logsResult.value);

  const saveResult = await saveTrainingSummaryRows(summaries, doc);
  if (saveResult.isErr()) return err(saveResult.error);

  return ok(summaries);
}

export async function migrateUnsummarizedYears(
  doc: GoogleSpreadsheet,
  existingSummaries: TrainingSummary[],
): Promise<TrainingSummary[]> {
  const pastYears = findPastYearLogSheets(doc);
  const summarizedYears = getYearsSummarized(existingSummaries);

  const yearsToMigrate = pastYears.filter((year) => !summarizedYears.has(year));

  if (yearsToMigrate.length === 0) return existingSummaries;

  console.log(`Migrating ${yearsToMigrate.length} year(s) to summary:`, yearsToMigrate);

  const newSummaries: TrainingSummary[] = [...existingSummaries];

  for (const year of yearsToMigrate) {
    const result = await rollupYearToSummary(year, doc);
    if (result.isOk()) {
      newSummaries.push(...result.value);
    } else {
      console.error(`Failed to migrate year ${year}:`, result.error);
    }
  }

  return newSummaries;
}

export async function migrateUnsummarizedMonths(
  doc: GoogleSpreadsheet,
  existingSummaries: TrainingSummary[],
): Promise<TrainingSummary[]> {
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;

  const logsResult = await loadExerciseLogs(doc);
  if (logsResult.isErr()) {
    console.error("Failed to load current year logs for monthly migration:", logsResult.error);
    return existingSummaries;
  }

  const logs = logsResult.value;
  if (logs.length === 0) return existingSummaries;

  const summarizedYearMonths = getYearMonthsSummarized(existingSummaries);

  const monthsWithLogs = new Set<number>();
  for (const log of logs) {
    if (log.loggedAt.getFullYear() === currentYear) {
      monthsWithLogs.add(log.loggedAt.getMonth() + 1);
    }
  }

  const monthsToMigrate = [...monthsWithLogs].filter((month) => {
    const isNotCurrentMonth = month < currentMonth;
    const isNotAlreadySummarized = !summarizedYearMonths.has(`${currentYear}-${month}`);
    return isNotCurrentMonth && isNotAlreadySummarized;
  });

  if (monthsToMigrate.length === 0) return existingSummaries;

  console.log(`Migrating ${monthsToMigrate.length} month(s) from ${currentYear}:`, monthsToMigrate);

  const logsForMonths = logs.filter((log) => {
    const logYear = log.loggedAt.getFullYear();
    const logMonth = log.loggedAt.getMonth() + 1;
    return logYear === currentYear && monthsToMigrate.includes(logMonth);
  });

  const newMonthSummaries = aggregateLogsToSummary(logsForMonths);

  const saveResult = await saveTrainingSummaryRows(newMonthSummaries, doc);
  if (saveResult.isErr()) {
    console.error("Failed to save monthly summaries:", saveResult.error);
    return existingSummaries;
  }

  return [...existingSummaries, ...newMonthSummaries];
}
