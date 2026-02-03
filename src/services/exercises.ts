import type { GoogleSpreadsheet } from "google-spreadsheet";
import { err, ok, type Result } from "neverthrow";
import { z } from "zod";
import { parseData } from "./utils/parseData";

const clean = (s: string) => s.trim().replace(/\s+/g, " ");

export const ExerciseNameSchema = z.string().overwrite(clean);
export const ExerciseSchema = z.object({
  name: ExerciseNameSchema,
});
export type Exercise = z.infer<typeof ExerciseSchema>;

const SHEET_NAME = "Exercises";
const getSheet = (doc: GoogleSpreadsheet) => doc.sheetsByTitle[SHEET_NAME];
const addSheet = (doc: GoogleSpreadsheet) =>
  doc.addSheet({ title: SHEET_NAME, headerValues: ["name"] });

export async function loadExercises(
  doc: GoogleSpreadsheet,
): Promise<Result<Exercise[], "load-failed" | "parse-data-failed">> {
  const sheet = getSheet(doc) ?? (await addSheet(doc));
  try {
    const rows = await sheet.getRows<Exercise>();
    return parseData(
      ExerciseSchema.array(),
      rows.map((row) => row.toObject()),
    );
  } catch (error) {
    console.error("Failed to load exercises. Error:", error);
    return err("load-failed");
  }
}

export async function addExercise(
  exercise: Exercise,
  doc: GoogleSpreadsheet,
): Promise<Result<void, "add-failed" | "duplicate-name">> {
  try {
    const sheet = getSheet(doc) ?? (await addSheet(doc));
    await sheet.addRow(ExerciseSchema.parse(exercise));
    return ok();
  } catch (error) {
    console.error("failed to add exercise. Error:", error);
    return err("add-failed");
  }
}

export async function deleteExercise(
  exercise: Exercise,
  doc: GoogleSpreadsheet,
): Promise<Result<void, "delete-failed">> {
  const sheet = getSheet(doc);
  if (!sheet) {
    console.error("Failed to delete exercise. Sheet does not exist.");
    return err("delete-failed");
  }
  try {
    const rows = await sheet.getRows<Exercise>();
    await rows.find((row) => row.get("name") === exercise.name)?.delete();
    return ok();
  } catch (error) {
    console.error("Failed to delete exercise. Error:", error);
    return err("delete-failed");
  }
}
