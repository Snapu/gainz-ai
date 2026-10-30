import { type PlannedSession, TrainingPlan } from "../domain";

export interface EvaluateSessionLog {
  loggedAt: Date;
  exerciseName: string;
}

export interface EvaluateCompletedSessionsResult {
  newCompletedSessions: Set<string>;
  hasChanged: boolean;
  isPlanFullyCompleted: boolean;
}

function groupLogsByCycleDate(
  plan: TrainingPlan,
  logs: EvaluateSessionLog[],
  referenceDate: Date,
): Map<string, { date: Date; logs: EvaluateSessionLog[] }> {
  const logsByDate = new Map<string, { date: Date; logs: EvaluateSessionLog[] }>();

  for (const log of logs) {
    if (!plan.isInCurrentCycle(log.loggedAt, referenceDate)) continue;

    const key = `${log.loggedAt.getFullYear()}-${log.loggedAt.getMonth()}-${log.loggedAt.getDate()}`;
    const existing = logsByDate.get(key) ?? { date: log.loggedAt, logs: [] };
    existing.logs.push(log);
    logsByDate.set(key, existing);
  }

  return logsByDate;
}

function findSatisfiedSessionForDay(
  plan: TrainingPlan,
  date: Date,
  dayLogs: EvaluateSessionLog[],
  newCompletedSessions: Set<string>,
  normalizeExerciseName: (name: string) => string,
  resolveMuscle: (name: string) => string | undefined,
): PlannedSession | undefined {
  const weekNum = plan.getCurrentWeekNumber(date);
  const dayOfWeek = date.getDay();

  const primaryCandidate = plan.getPlannedSessionForDay(dayOfWeek, weekNum);
  const primaryKey = primaryCandidate
    ? TrainingPlan.sessionKey(primaryCandidate.weekNumber, primaryCandidate.dayOfWeek)
    : null;
  if (
    primaryCandidate &&
    primaryKey &&
    !newCompletedSessions.has(primaryKey) &&
    plan.isSessionSatisfiedByLogs(primaryCandidate, dayLogs, normalizeExerciseName, resolveMuscle)
  ) {
    return primaryCandidate;
  }

  // Fallback: Check if the logs satisfy ANY uncompleted session
  return plan.sessions.find((s) => {
    const sessionKey = TrainingPlan.sessionKey(s.weekNumber, s.dayOfWeek);
    return (
      !newCompletedSessions.has(sessionKey) &&
      plan.isSessionSatisfiedByLogs(s, dayLogs, normalizeExerciseName, resolveMuscle)
    );
  });
}

function haveCompletedSessionsChanged(
  currentSessions: Set<string>,
  newSessions: Set<string>,
): boolean {
  if (newSessions.size !== currentSessions.size) return true;
  for (const key of newSessions) {
    if (!currentSessions.has(key)) return true;
  }
  return false;
}

export function evaluateCompletedSessions(
  plan: TrainingPlan,
  currentCompletedSessions: Set<string>,
  logs: EvaluateSessionLog[],
  normalizeExerciseName: (name: string) => string,
  resolveMuscle: (name: string) => string | undefined,
  referenceDate: Date = new Date(),
): EvaluateCompletedSessionsResult {
  const newCompletedSessions = new Set<string>();
  const logsByDate = groupLogsByCycleDate(plan, logs, referenceDate);

  for (const { date, logs: dayLogs } of logsByDate.values()) {
    const satisfiedSession = findSatisfiedSessionForDay(
      plan,
      date,
      dayLogs,
      newCompletedSessions,
      normalizeExerciseName,
      resolveMuscle,
    );

    if (satisfiedSession) {
      newCompletedSessions.add(
        TrainingPlan.sessionKey(satisfiedSession.weekNumber, satisfiedSession.dayOfWeek),
      );
    }
  }

  const hasChanged = haveCompletedSessionsChanged(currentCompletedSessions, newCompletedSessions);
  const isPlanFullyCompleted = hasChanged ? plan.isFullyCompleted(newCompletedSessions) : false;

  return {
    newCompletedSessions,
    hasChanged,
    isPlanFullyCompleted,
  };
}
