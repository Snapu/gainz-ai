import type { ResultAsync } from "neverthrow";
import type { ExerciseLog } from "../domain/exerciseLog";

/**
 * Application-level use-cases for exercise log management.
 * These orchestrate repository and domain logic through repository ports.
 */

type ExerciseLogLoadError = "load-failed" | "parse-data-failed" | "auth-failed";
type ExerciseLogAddError = "add-failed" | "auth-failed";
type ExerciseLogDeleteError = "delete-failed" | "auth-failed";
type ExerciseLogYearLoadError = "load-failed" | "parse-data-failed" | "sheet-not-found";

export interface ExerciseLogRepository {
  loadCurrentYear: () => ResultAsync<ExerciseLog[], ExerciseLogLoadError>;
  addLog: (log: ExerciseLog) => ResultAsync<void, ExerciseLogAddError>;
  deleteLog: (log: ExerciseLog) => ResultAsync<void, ExerciseLogDeleteError>;
  findPastYearSheets: () => number[];
  loadYear: (year: number) => ResultAsync<ExerciseLog[], ExerciseLogYearLoadError>;
}

export function loadExerciseLogs(
  repository: ExerciseLogRepository,
): ResultAsync<ExerciseLog[], ExerciseLogLoadError> {
  return repository.loadCurrentYear();
}

export function addExerciseLog(
  log: ExerciseLog,
  repository: ExerciseLogRepository,
): ResultAsync<void, ExerciseLogAddError> {
  return repository.addLog(log);
}

export function deleteExerciseLog(
  log: ExerciseLog,
  repository: ExerciseLogRepository,
): ResultAsync<void, ExerciseLogDeleteError> {
  return repository.deleteLog(log);
}

export function findPastYearLogSheets(repository: ExerciseLogRepository): number[] {
  return repository.findPastYearSheets();
}

export function loadLogsFromYear(
  year: number,
  repository: ExerciseLogRepository,
): ResultAsync<ExerciseLog[], ExerciseLogYearLoadError> {
  return repository.loadYear(year);
}
