import type { Result } from "neverthrow";
import type { ExerciseLog } from "../domain/exerciseLog";

/**
 * Application-level use-cases for exercise log management.
 * These orchestrate repository and domain logic through repository ports.
 */

type LogsLoadError = "load-failed" | "parse-data-failed" | "auth-failed";
type AddLogError = "add-failed" | "auth-failed";
type DeleteLogError = "delete-failed" | "auth-failed";
type YearLoadError = "load-failed" | "parse-data-failed" | "sheet-not-found";

export interface TrainingLogsRepository {
  loadCurrentYear: () => Promise<Result<ExerciseLog[], LogsLoadError>>;
  addLog: (log: ExerciseLog) => Promise<Result<void, AddLogError>>;
  deleteLog: (log: ExerciseLog) => Promise<Result<void, DeleteLogError>>;
  findPastYearSheets: () => number[];
  loadYear: (year: number) => Promise<Result<ExerciseLog[], YearLoadError>>;
}

export async function loadExerciseLogs(
  repository: TrainingLogsRepository,
): Promise<Result<ExerciseLog[], LogsLoadError>> {
  return repository.loadCurrentYear();
}

export async function addExerciseLog(
  log: ExerciseLog,
  repository: TrainingLogsRepository,
): Promise<Result<void, AddLogError>> {
  return repository.addLog(log);
}

export async function deleteExerciseLog(
  log: ExerciseLog,
  repository: TrainingLogsRepository,
): Promise<Result<void, DeleteLogError>> {
  return repository.deleteLog(log);
}

export function findPastYearLogSheets(repository: TrainingLogsRepository): number[] {
  return repository.findPastYearSheets();
}

export async function loadLogsFromYear(
  year: number,
  repository: TrainingLogsRepository,
): Promise<Result<ExerciseLog[], YearLoadError>> {
  return repository.loadYear(year);
}
