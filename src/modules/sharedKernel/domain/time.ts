const MS_PER_DAY = 86_400_000;

/**
 * Returns the number of days since the Unix Epoch, adjusted for the local
 * timezone offset of the given date.
 *
 * `date.getTimezoneOffset()` returns the difference in minutes between UTC
 * and local time (e.g., New York is UTC-5, so offset is +300).
 * By subtracting `offset * 60000` from the UTC timestamp, we effectively shift
 * the UTC timestamp to match local time, meaning the result divided by 86,400,000
 * will consistently roll over at local midnight rather than UTC midnight.
 */
export function getLocalDayIndex(date: Date): number {
  return Math.floor((date.getTime() - date.getTimezoneOffset() * 60_000) / MS_PER_DAY);
}
