export function parseOptionalNumber(value: unknown): number | undefined {
  if (value === "" || value === null || value === undefined) return undefined;
  const parsed = typeof value === "string" ? parseFloat(value) : Number(value);
  return Number.isNaN(parsed) ? undefined : parsed;
}
