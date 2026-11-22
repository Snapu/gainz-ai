import { getCurrentBcp47Locale, t } from "./index";

const MS_PER_DAY = 86_400_000;

/** Formats a number using the active app locale. */
export function formatNumber(value: number, options?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(getCurrentBcp47Locale(), options).format(value);
}

/** Formats a workout session date (weekday + numeric date) using the active app locale. */
export function formatSessionDate(date: Date): string {
  return new Intl.DateTimeFormat(getCurrentBcp47Locale(), {
    weekday: "long",
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).format(date);
}

/** Formats a short chart date label (e.g. "Oct 20" / "20. Okt") using the active app locale. */
export function formatShortDate(date: Date): string {
  return new Intl.DateTimeFormat(getCurrentBcp47Locale(), {
    month: "short",
    day: "numeric",
  }).format(date);
}

/** Formats a medium date label (e.g. "Nov 22, 2026" / "22. Nov. 2026") using the active app locale. */
export function formatMediumDate(date: Date): string {
  return new Intl.DateTimeFormat(getCurrentBcp47Locale(), {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

/** Formats a time-of-day (hours & minutes) using the active app locale. */
export function formatTime(value: Date | string): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat(getCurrentBcp47Locale(), {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

/** Formats the next 00:00 UTC quota reset into the user's local time. */
export function formatNextUtcMidnightLocalTime(now: Date = new Date()): string {
  const nextUtcMidnight = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0),
  );
  return formatTime(nextUtcMidnight);
}

/** Formats a past date relative to today (Today, Yesterday, Nd ago, Nw ago, Nmo ago, Ny ago). */
export function formatRelativeDays(loggedAt: Date, now: Date = new Date()): string {
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfLoggedDay = new Date(
    loggedAt.getFullYear(),
    loggedAt.getMonth(),
    loggedAt.getDate(),
  );
  const dayDiff = Math.round((startOfToday.getTime() - startOfLoggedDay.getTime()) / MS_PER_DAY);

  if (dayDiff <= 0) return t("relativeTime.today");
  if (dayDiff === 1) return t("relativeTime.yesterday");
  if (dayDiff < 7) return t("relativeTime.daysAgo", { count: dayDiff });

  const weekDiff = Math.round(dayDiff / 7);
  if (weekDiff < 5) return t("relativeTime.weeksAgo", { count: weekDiff });

  const monthDiff =
    (now.getFullYear() - loggedAt.getFullYear()) * 12 + now.getMonth() - loggedAt.getMonth();
  if (monthDiff < 12) return t("relativeTime.monthsAgo", { count: monthDiff });

  const yearDiff = now.getFullYear() - loggedAt.getFullYear();
  return t("relativeTime.yearsAgo", { count: yearDiff });
}
