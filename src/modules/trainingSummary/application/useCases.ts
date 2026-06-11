import { okAsync, type ResultAsync } from "neverthrow";
import type { ExerciseLog } from "@/modules/trainingLogs/domain";
import type { TrainingSummary } from "@/modules/trainingSummary/domain";

export type { TrainingSummary } from "@/modules/trainingSummary/domain";

type TrainingSummaryLoadError = "load-failed" | "parse-data-failed";
type TrainingSummarySaveError = "save-failed";
type TrainingSummaryLogsLoadError =
  | "load-failed"
  | "parse-data-failed"
  | "sheet-not-found"
  | "auth-failed";

export interface TrainingSummaryRepository {
  load: () => ResultAsync<TrainingSummary[], TrainingSummaryLoadError>;
  saveRows: (summaries: TrainingSummary[]) => ResultAsync<void, TrainingSummarySaveError>;
  clearRows: () => ResultAsync<void, TrainingSummarySaveError>;
}

export interface TrainingLogHistoryRepository {
  loadCurrentYearLogs: () => ResultAsync<ExerciseLog[], TrainingSummaryLogsLoadError>;
  findPastYears: () => number[];
  loadYearLogs: (year: number) => ResultAsync<ExerciseLog[], TrainingSummaryLogsLoadError>;
}

export function loadTrainingSummary(
  summaryRepository: TrainingSummaryRepository,
): ResultAsync<TrainingSummary[], TrainingSummaryLoadError> {
  return summaryRepository.load();
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

  // Generate logs for each summary entry
  for (const summary of summaries) {
    const key = `${summary.year}-${summary.month}`;
    const dates = datesByYearMonth.get(key) || [];

    // Distribute sets across available workout dates
    const setsPerDay = Math.max(1, Math.floor(summary.sets / dates.length));
    const extraSets = summary.sets % dates.length;

    let setsAllocated = 0;
    for (let i = 0; i < dates.length && setsAllocated < summary.sets; i++) {
      const date = dates[i];
      if (!date) continue;

      const setsForThisDay = setsPerDay + (i < extraSets ? 1 : 0);
      if (setsForThisDay === 0) continue;

      const avgReps = summary.totalReps ? Math.round(summary.totalReps / summary.sets) : undefined;
      const avgWeight =
        summary.totalVolume && summary.totalReps
          ? Math.round((summary.totalVolume / summary.totalReps) * 10) / 10
          : summary.maxWeight;

      for (let j = 0; j < setsForThisDay; j++) {
        logs.push({
          id: `archived-${summary.year}-${summary.month}-${summary.exerciseName}-${i}-${j}`,
          exerciseName: summary.exerciseName,
          loggedAt: date,
          reps: avgReps,
          weight: avgWeight,
          synthetic: true,
        });
        setsAllocated++;
      }
    }
  }

  // Sort by date to maintain chronological order
  return logs.sort((a, b) => a.loggedAt.getTime() - b.loggedAt.getTime());
}

export function rebuildAllTrainingSummaries(
  summaryRepository: TrainingSummaryRepository,
  historyRepository: TrainingLogHistoryRepository,
): ResultAsync<TrainingSummary[], TrainingSummaryLogsLoadError | TrainingSummarySaveError> {
  return historyRepository
    .loadCurrentYearLogs()
    .andThen((currentYearLogs) => {
      const years = historyRepository.findPastYears();
      return years.reduce<ResultAsync<ExerciseLog[], TrainingSummaryLogsLoadError>>(
        (accResult, year) =>
          accResult.andThen((logs) =>
            historyRepository.loadYearLogs(year).map((yearLogs) => [...logs, ...yearLogs]),
          ),
        okAsync([...currentYearLogs]),
      );
    })
    .andThen((allLogs) => {
      const currentYear = new Date().getFullYear();
      const currentMonth = new Date().getMonth() + 1;
      const logsExcludingCurrentMonth = allLogs.filter(
        (log) =>
          !(
            log.loggedAt.getFullYear() === currentYear &&
            log.loggedAt.getMonth() + 1 === currentMonth
          ),
      );

      const summaries = aggregateLogsToSummary(logsExcludingCurrentMonth);

      return summaryRepository
        .clearRows()
        .andThen(() => {
          if (summaries.length > 0) {
            return summaryRepository.saveRows(summaries);
          }
          return okAsync(undefined);
        })
        .map(() => summaries);
    });
}

export function getYearsSummarized(summaries: TrainingSummary[]): Set<number> {
  return new Set(summaries.map((s) => s.year));
}

export function getYearMonthsSummarized(summaries: TrainingSummary[]): Set<string> {
  return new Set(summaries.map((s) => `${s.year}-${s.month}`));
}

function rollupYearToSummary(
  year: number,
  summaryRepository: TrainingSummaryRepository,
  logsRepository: TrainingLogHistoryRepository,
): ResultAsync<TrainingSummary[], TrainingSummaryLogsLoadError | TrainingSummarySaveError> {
  return logsRepository.loadYearLogs(year).andThen((logs) => {
    const summaries = aggregateLogsToSummary(logs);
    return summaryRepository.saveRows(summaries).map(() => summaries);
  });
}

export function migrateUnsummarizedYears(
  summaryRepository: TrainingSummaryRepository,
  logsRepository: TrainingLogHistoryRepository,
  existingSummaries: TrainingSummary[],
): ResultAsync<TrainingSummary[], TrainingSummaryLogsLoadError | TrainingSummarySaveError> {
  const pastYears = logsRepository.findPastYears();
  const summarizedYears = getYearsSummarized(existingSummaries);

  const yearsToMigrate = pastYears.filter((year) => !summarizedYears.has(year));

  if (yearsToMigrate.length === 0) return okAsync(existingSummaries);

  console.log(`Migrating ${yearsToMigrate.length} year(s) to summary:`, yearsToMigrate);

  return yearsToMigrate.reduce<
    ResultAsync<TrainingSummary[], TrainingSummaryLogsLoadError | TrainingSummarySaveError>
  >(
    (acc, year) =>
      acc.andThen((summariesSoFar) =>
        rollupYearToSummary(year, summaryRepository, logsRepository).map((yearSummaries) => [
          ...summariesSoFar,
          ...yearSummaries,
        ]),
      ),
    okAsync([...existingSummaries]),
  );
}

export function migrateUnsummarizedMonths(
  summaryRepository: TrainingSummaryRepository,
  logsRepository: TrainingLogHistoryRepository,
  existingSummaries: TrainingSummary[],
): ResultAsync<TrainingSummary[], TrainingSummaryLogsLoadError | TrainingSummarySaveError> {
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;

  return logsRepository.loadCurrentYearLogs().andThen((logs) => {
    if (logs.length === 0) return okAsync(existingSummaries);

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

    if (monthsToMigrate.length === 0) return okAsync(existingSummaries);

    console.log(
      `Migrating ${monthsToMigrate.length} month(s) from ${currentYear}:`,
      monthsToMigrate,
    );

    const logsForMonths = logs.filter((log) => {
      const logYear = log.loggedAt.getFullYear();
      const logMonth = log.loggedAt.getMonth() + 1;
      return logYear === currentYear && monthsToMigrate.includes(logMonth);
    });

    const newMonthSummaries = aggregateLogsToSummary(logsForMonths);

    return summaryRepository
      .saveRows(newMonthSummaries)
      .map(() => [...existingSummaries, ...newMonthSummaries]);
  });
}
