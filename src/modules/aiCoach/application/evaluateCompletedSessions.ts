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

const SESSION_INACTIVITY_MS = 45 * 60 * 1000;
const SESSION_MAX_WINDOW_MS = 8 * 60 * 60 * 1000;

function groupLogsByCycleDate(
  plan: TrainingPlan,
  logs: EvaluateSessionLog[],
  referenceDate: Date,
): { date: Date; logs: EvaluateSessionLog[] }[] {
  if (logs.length === 0) return [];

  const sorted = [...logs].sort((a, b) => a.loggedAt.getTime() - b.loggedAt.getTime());
  const sessions: { date: Date; logs: EvaluateSessionLog[] }[] = [];
  let currentGroup: { date: Date; logs: EvaluateSessionLog[] } | null = null;

  for (const log of sorted) {
    if (!currentGroup) {
      currentGroup = { date: log.loggedAt, logs: [log] };
      continue;
    }

    const prevLog = currentGroup.logs[currentGroup.logs.length - 1];
    const gap = log.loggedAt.getTime() - prevLog.loggedAt.getTime();
    const span = log.loggedAt.getTime() - currentGroup.date.getTime();

    if (gap <= SESSION_INACTIVITY_MS && span <= SESSION_MAX_WINDOW_MS) {
      currentGroup.logs.push(log);
    } else {
      if (plan.isInCurrentCycle(currentGroup.date, referenceDate)) {
        sessions.push(currentGroup);
      }
      currentGroup = { date: log.loggedAt, logs: [log] };
    }
  }

  if (currentGroup && plan.isInCurrentCycle(currentGroup.date, referenceDate)) {
    sessions.push(currentGroup);
  }

  return sessions;
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
