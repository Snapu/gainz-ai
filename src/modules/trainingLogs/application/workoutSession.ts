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

export function groupLogsIntoSessions(
  logs: ExerciseLog[],
  now: number = Date.now(),
): WorkoutSession[] {
  if (logs.length === 0) return [];

  const sorted = [...logs].sort((a, b) => a.loggedAt.getTime() - b.loggedAt.getTime());
  const sessions: WorkoutSession[] = [];
  let currentCluster: ExerciseLog[] = [];

  const flushCluster = (cluster: ExerciseLog[]) => {
    if (cluster.length === 0) return;
    const sessionStart = cluster[0];
    const prevLog = cluster[cluster.length - 1];
    const startTime = sessionStart.loggedAt;
    const lastLog = prevLog.loggedAt;
    const isActive =
      now - lastLog.getTime() <= SESSION_INACTIVITY_MS &&
      now - startTime.getTime() <= SESSION_MAX_WINDOW_MS;

    sessions.push({
      sessionId: isoDateString(startTime),
      sessionDate: localeDateString(startTime),
      startTime,
      logs: cluster,
      phase: isActive ? "mid-workout" : "post-workout",
    });
  };

  for (const log of sorted) {
    if (currentCluster.length === 0) {
      currentCluster.push(log);
      continue;
    }

    const prevLog = currentCluster[currentCluster.length - 1];
    const sessionStart = currentCluster[0];
    const gap = log.loggedAt.getTime() - prevLog.loggedAt.getTime();
    const span = log.loggedAt.getTime() - sessionStart.loggedAt.getTime();

    if (gap <= SESSION_INACTIVITY_MS && span <= SESSION_MAX_WINDOW_MS) {
      currentCluster.push(log);
    } else {
      flushCluster(currentCluster);
      currentCluster = [log];
    }
  }

  flushCluster(currentCluster);

  return sessions;
}

export function resolveCurrentSession(
  logs: ExerciseLog[],
  now: number = Date.now(),
): WorkoutSession | null {
  const sessions = groupLogsIntoSessions(logs, now);
  return [...sessions].reverse().find((s) => s.phase === "mid-workout") ?? null;
}

export function getSessionStartBoundary(
  session: WorkoutSession | null,
  now: number = Date.now(),
): number {
  if (session) return session.startTime.getTime();
  return new Date(now).setHours(0, 0, 0, 0);
}
