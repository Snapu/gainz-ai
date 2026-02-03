import type { GoogleSpreadsheet } from "google-spreadsheet";
import { err, ok, type Result } from "neverthrow";
import { ZodError, z } from "zod";
import { ExerciseNameSchema } from "./exercises";
import { parseData } from "./utils/parseData";

export const ExerciseLogSchema = z.object({
  exerciseName: ExerciseNameSchema,
  reps: z.coerce.number().optional(),
  weight: z.coerce.number().optional(),
  distance: z.coerce.number().optional(),
  duration: z.coerce.number().optional(),
  loggedAt: z.coerce.date(),
});

export type ExerciseLog = z.infer<typeof ExerciseLogSchema>;

const SHEET_NAME = `Logs${new Date().getFullYear()}`;
const getSheet = (doc: GoogleSpreadsheet) => doc.sheetsByTitle[SHEET_NAME];
const addSheet = (doc: GoogleSpreadsheet) =>
  doc.addSheet({
    title: SHEET_NAME,
    headerValues: ["exerciseName", "reps", "weight", "distance", "duration", "loggedAt"],
  });

export async function loadExerciseLogs(
  doc: GoogleSpreadsheet,
): Promise<Result<ExerciseLog[], "load-failed" | "parse-data-failed">> {
  const sheet = getSheet(doc) ?? (await addSheet(doc));
  try {
    const rows = await sheet.getRows<ExerciseLog>();
    console.debug("Fetched rows", rows);
    return parseData(
      ExerciseLogSchema.array(),
      rows.map((row) => row.toObject()),
    );
  } catch (error) {
    console.error("Failed to load exercise logs. Error:", error);
    return err("load-failed");
  }
}

export async function addExerciseLog(
  exerciseLog: ExerciseLog,
  doc: GoogleSpreadsheet,
): Promise<Result<void, "add-failed" | "duplicate-name">> {
  try {
    const sheet = getSheet(doc) ?? (await addSheet(doc));
    await sheet.addRow(ExerciseLogSchema.parse(exerciseLog));
    return ok();
  } catch (error) {
    console.error("failed to add exercise log. Error:", error);
    if (error instanceof ZodError) console.error(z.prettifyError(error));
    return err("add-failed");
  }
}

export async function deleteExerciseLog(
  exerciseLog: ExerciseLog,
  doc: GoogleSpreadsheet,
): Promise<Result<void, "delete-failed">> {
  const sheet = getSheet(doc);
  if (!sheet) {
    console.error("Failed to delete exercise log. Sheet does not exist.");
    return err("delete-failed");
  }
  try {
    const rows = await sheet.getRows<ExerciseLog>();
    const rowToDelete = await rows.find(
      (row) =>
        row.get("exerciseName") === exerciseLog.exerciseName &&
        row.get("loggedAt") === exerciseLog.loggedAt.toISOString(),
    );
    console.debug("Deleting row:", rowToDelete);
    await rowToDelete?.delete();
    return ok();
  } catch (error) {
    console.error("Failed to delete exercise log. Error:", error);
    return err("delete-failed");
  }
}
