import { TrainingPlan } from "../domain";

export interface EvaluateSessionLog {
  loggedAt: Date;
  exerciseName: string;
}

export interface EvaluateCompletedSessionsResult {
  newCompletedSessions: Set<string>;
  hasChanged: boolean;
  isPlanFullyCompleted: boolean;
}

export function evaluateCompletedSessions(
  plan: TrainingPlan,
  currentCompletedSessions: Set<string>,
  logs: EvaluateSessionLog[],
  normalizeExerciseName: (name: string) => string,
  resolveMuscle: (name: string) => string | undefined,
): EvaluateCompletedSessionsResult {
  // Reset completedSessions before evaluating, since we rely ENTIRELY on the current cycle's logs
  const newCompletedSessions = new Set<string>();

  // Group logs by local date
  const logsByDate = new Map<string, { date: Date; logs: EvaluateSessionLog[] }>();

  const today = new Date();

  for (const log of logs) {
    if (!plan.isInCurrentCycle(log.loggedAt, today)) continue;

    const key = `${log.loggedAt.getFullYear()}-${log.loggedAt.getMonth()}-${log.loggedAt.getDate()}`;
    if (!logsByDate.has(key)) {
      logsByDate.set(key, { date: log.loggedAt, logs: [] });
    }
    logsByDate.get(key)!.logs.push(log);
  }

  let changed = false;

  for (const { date, logs: dayLogs } of logsByDate.values()) {
    const weekNum = plan.getCurrentWeekNumber(date);
    const dayOfWeek = date.getDay();

    let satisfiedSession = plan.getPlannedSessionForDay(dayOfWeek, weekNum);

    if (
      !satisfiedSession ||
      !plan.isSessionSatisfiedByLogs(
        satisfiedSession,
        dayLogs,
        normalizeExerciseName,
        resolveMuscle,
      )
    ) {
      // Fallback: Check if the logs satisfy ANY uncompleted session
      const uncompletedSessions = plan.sessions.filter(
        (s) => !newCompletedSessions.has(TrainingPlan.sessionKey(s.weekNumber, s.dayOfWeek)),
      );

      satisfiedSession = uncompletedSessions.find((s) =>
        plan.isSessionSatisfiedByLogs(s, dayLogs, normalizeExerciseName, resolveMuscle),
      );
    }

    if (satisfiedSession) {
      const sessionKey = TrainingPlan.sessionKey(
        satisfiedSession.weekNumber,
        satisfiedSession.dayOfWeek,
      );
      if (!newCompletedSessions.has(sessionKey)) {
        newCompletedSessions.add(sessionKey);
      }
    }
  }

  if (newCompletedSessions.size !== currentCompletedSessions.size) {
    changed = true;
  } else {
    for (const key of newCompletedSessions) {
      if (!currentCompletedSessions.has(key)) {
        changed = true;
        break;
      }
    }
  }

  const isPlanFullyCompleted = changed ? plan.isFullyCompleted(newCompletedSessions) : false;

  return {
    newCompletedSessions,
    hasChanged: changed,
    isPlanFullyCompleted,
  };
}
