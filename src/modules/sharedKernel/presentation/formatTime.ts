/**
 * Formats a rest/cooldown duration in seconds to a "m:ss" string (e.g. 125 → "2:05").
 * Returns "0:00" for null, undefined, or zero.
 */
export function formatRestDuration(seconds: number | null | undefined): string {
  if (!seconds) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}
