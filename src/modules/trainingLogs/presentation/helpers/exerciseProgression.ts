import type { ExerciseLog } from "@/modules/trainingLogs/domain";
import type {
  ProgressionSessionItem,
  ProgressionSetItem,
} from "@/shared/presentation/components/ui/UiProgressionLine.vue";

function toDate(val: Date | string | number): Date {
  return val instanceof Date ? val : new Date(val);
}

export function buildExerciseProgression(
  logs: ExerciseLog[],
  maxSessions = 24,
): ProgressionSessionItem[] {
  if (logs.length < 2) return [];

  const sortedLogs = [...logs].sort(
    (a, b) => toDate(a.loggedAt).getTime() - toDate(b.loggedAt).getTime(),
  );
  const formatter = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short" });
  const sessionsMap = new Map<string, { date: Date; sets: ProgressionSetItem[] }>();

  for (const log of sortedLogs) {
    const logDate = toDate(log.loggedAt);
    const key = logDate.toDateString();
    let session = sessionsMap.get(key);
    if (!session) {
      session = { date: logDate, sets: [] };
      sessionsMap.set(key, session);
    }
    session.sets.push({
      weight: log.weight,
      reps: log.reps,
      duration: log.duration,
    });
  }

  const sessions: ProgressionSessionItem[] = [];
  for (const [key, val] of sessionsMap.entries()) {
    sessions.push({
      key,
      dateLabel: formatter.format(val.date),
      sets: val.sets,
    });
  }

  return sessions.slice(-maxSessions);
}

export function computeExercisePr(logs: ExerciseLog[]): string | null {
  if (!logs.length) return null;

  // 1. Weight-based
  const withWeight = logs.filter((l) => typeof l.weight === "number" && l.weight > 0);
  if (withWeight.length > 0) {
    let best = withWeight[0];
    for (const log of withWeight) {
      const currentWeight = log.weight ?? 0;
      const bestWeight = best.weight ?? 0;
      if (currentWeight > bestWeight) {
        best = log;
      } else if (currentWeight === bestWeight && (log.reps ?? 0) > (best.reps ?? 0)) {
        best = log;
      }
    }
    if (best.reps != null && best.reps > 0) {
      return `PR: ${best.weight} kg × ${best.reps}`;
    }
    return `PR: ${best.weight} kg`;
  }

  // 2. Distance-based (evaluated before duration so cardio runs with distance & duration pick distance)
  const withDistance = logs.filter((l) => typeof l.distance === "number" && l.distance > 0);
  if (withDistance.length > 0) {
    let best = withDistance[0];
    for (const log of withDistance) {
      const currentDistance = log.distance ?? 0;
      const bestDistance = best.distance ?? 0;
      if (currentDistance > bestDistance) {
        best = log;
      } else if (currentDistance === bestDistance) {
        // For identical distance, faster run (lower duration) is better
        const currentDur = log.duration ?? Number.POSITIVE_INFINITY;
        const bestDur = best.duration ?? Number.POSITIVE_INFINITY;
        if (currentDur < bestDur) {
          best = log;
        }
      }
    }
    return `PR: ${best.distance} m`;
  }

  // 3. Duration-based (pure isometric / endurance exercises like plank)
  const withDuration = logs.filter((l) => typeof l.duration === "number" && l.duration > 0);
  if (withDuration.length > 0) {
    const maxDuration = withDuration.reduce((max, l) => Math.max(max, l.duration ?? 0), 0);
    return `PR: ${maxDuration} min`;
  }

  // 4. Reps-based (bodyweight exercises without weight)
  const withReps = logs.filter((l) => typeof l.reps === "number" && l.reps > 0);
  if (withReps.length > 0) {
    const maxReps = withReps.reduce((max, l) => Math.max(max, l.reps ?? 0), 0);
    return `PR: ${maxReps} reps`;
  }

  return null;
}
