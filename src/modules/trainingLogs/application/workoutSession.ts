import { isoDateString, localeDateString } from "@/modules/sharedKernel/domain";
import type { ExerciseLog } from "../domain/exerciseLog";

export type WorkoutPhase = "planning" | "mid-workout" | "post-workout";

export interface WorkoutSession {
  sessionId: string;
  sessionDate: string;
  startTime: Date;
  logs: ExerciseLog[];
  phase: WorkoutPhase;
}

export const SESSION_INACTIVITY_MS = 45 * 60 * 1000;
export const SESSION_MAX_WINDOW_MS = 8 * 60 * 60 * 1000;

export function resolveCurrentSession(
  logs: ExerciseLog[],
  now: number = Date.now(),
): WorkoutSession | null {
  const windowStart = now - SESSION_MAX_WINDOW_MS;

  const recentLogs = logs
    .filter((log) => log.loggedAt.getTime() >= windowStart)
    .sort((a, b) => a.loggedAt.getTime() - b.loggedAt.getTime());

  if (recentLogs.length === 0) return null;

  const lastLog = recentLogs[recentLogs.length - 1]!;
  const msSinceLast = now - lastLog.loggedAt.getTime();

  if (msSinceLast > SESSION_INACTIVITY_MS) return null;

  const startTime = recentLogs[0]!.loggedAt;

  return {
    sessionId: isoDateString(startTime),
    sessionDate: localeDateString(startTime),
    startTime,
    logs: recentLogs,
    phase: "mid-workout",
  };
}

export function getSessionStartBoundary(
  session: WorkoutSession | null,
  now: number = Date.now(),
): number {
  if (session) return session.startTime.getTime();
  return new Date(now).setHours(0, 0, 0, 0);
}
