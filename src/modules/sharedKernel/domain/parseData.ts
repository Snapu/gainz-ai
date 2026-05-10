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
