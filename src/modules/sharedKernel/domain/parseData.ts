import { err, ok, type Result } from "neverthrow";
import { z } from "zod";

export const parseData = <T extends z.ZodTypeAny>(
  schema: T,
  data: unknown,
): Result<z.infer<T>, "parse-data-failed"> => {
  const result = schema.safeParse(data);
  if (!result.success) {
    console.warn(z.prettifyError(result.error));
    return err("parse-data-failed");
  }
  return ok(result.data);
};

/**
 * Validates rows individually so a single malformed row does not discard valid records,
 * while still failing if every non-empty row fails schema validation.
 */
export const parseRows = <T extends z.ZodTypeAny>(
  schema: T,
  rows: readonly unknown[],
): Result<z.infer<T>[], "parse-data-failed"> => {
  if (rows.length === 0) return ok([]);

  const parsed: z.infer<T>[] = [];
  for (const row of rows) {
    const result = schema.safeParse(row);
    if (result.success) {
      parsed.push(result.data);
    } else {
      console.warn(z.prettifyError(result.error));
    }
  }

  return parsed.length > 0 ? ok(parsed) : err("parse-data-failed");
};
