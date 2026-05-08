import type { ExerciseLog } from "@/services/exerciseLogs";
import { localeDateString } from "@/services/utils/date";

type WorkoutPhase = "planning" | "mid-workout" | "post-workout";

export interface WorkoutSession {
  /** Locale-formatted date string of the session's *start* — used as the AI chat storage key. */
  sessionDate: string;
  startTime: Date;
  logs: ExerciseLog[];
  phase: WorkoutPhase;
}

/** Gap with no new sets after which a session is considered finished. */
export const SESSION_INACTIVITY_MS = 45 * 60 * 1000;

/** Maximum look-back window when searching for an active session.
 *  Any log older than this is treated as a previous session. */
export const SESSION_MAX_WINDOW_MS = 8 * 60 * 60 * 1000;

/**
 * Resolves the currently active workout session from a list of exercise logs.
 *
 * Returns `null` when:
 * - No logs exist within the 8-hour look-back window, or
 * - The last log is older than 45 minutes (session has ended / post-workout).
 *
 * The `now` parameter is injectable so tests can simulate any point in time
 * without relying on `vi.useFakeTimers`.
 */
export function resolveCurrentSession(
  logs: ExerciseLog[],
  now: number = Date.now(),
): WorkoutSession | null {
  const windowStart = now - SESSION_MAX_WINDOW_MS;

  const recentLogs = logs
    .filter((log) => log.loggedAt.getTime() >= windowStart)
    .sort((a, b) => a.loggedAt.getTime() - b.loggedAt.getTime());

  if (recentLogs.length === 0) return null;

  // recentLogs.length > 0 is guaranteed by the guard above.
  const lastLog = recentLogs[recentLogs.length - 1]!;
  const msSinceLast = now - lastLog.loggedAt.getTime();

  if (msSinceLast > SESSION_INACTIVITY_MS) return null;

  const startTime = recentLogs[0]!.loggedAt;

  return {
    sessionDate: localeDateString(startTime),
    startTime,
    logs: recentLogs,
    phase: "mid-workout",
  };
}

/**
 * Returns the timestamp to use as the lower boundary when querying "past" logs
 * (i.e. logs that belong to a *previous* session, not the current one).
 *
 * When a session is active the boundary is the session's start time, so logs
 * from a midnight-crossing workout are correctly excluded from "past" queries.
 * When no session is active it falls back to the start of the current calendar day.
 */
export function getSessionStartBoundary(
  session: WorkoutSession | null,
  now: number = Date.now(),
): number {
  if (session) return session.startTime.getTime();
  return new Date(now).setHours(0, 0, 0, 0);
}
