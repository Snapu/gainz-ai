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

function groupLogsByCycleDate(
  plan: TrainingPlan,
  logs: EvaluateSessionLog[],
  referenceDate: Date,
): { date: Date; logs: EvaluateSessionLog[] }[] {
  const logsByDate = new Map<string, { date: Date; logs: EvaluateSessionLog[] }>();

  for (const log of logs) {
    if (!plan.isInCurrentCycle(log.loggedAt, referenceDate)) continue;

    const key = `${log.loggedAt.getFullYear()}-${log.loggedAt.getMonth()}-${log.loggedAt.getDate()}`;
    const existing = logsByDate.get(key) ?? { date: log.loggedAt, logs: [] };
    existing.logs.push(log);
    logsByDate.set(key, existing);
  }

  return [...logsByDate.values()].sort((a, b) => a.date.getTime() - b.date.getTime());
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
  const chronologicalDayGroups = groupLogsByCycleDate(plan, logs, referenceDate);

  for (const { date, logs: dayLogs } of chronologicalDayGroups) {
    const satisfiedSession = plan.findSatisfiedSession(
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
