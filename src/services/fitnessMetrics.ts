import type { ExerciseLog } from "./exerciseLogs";

export interface WeeklyVolume {
  exerciseName: string;
  sets: number;
  totalReps: number;
}

export interface ProgressiveOverload {
  exerciseName: string;
  status: "progressed" | "maintained" | "regressed";
  previousMaxWeight: number;
  currentMaxWeight: number;
  previousMaxRepsAtMaxWeight: number;
  currentMaxRepsAtMaxWeight: number;
}

export function calculateWeeklyVolume(
  logs: ExerciseLog[],
  targetDate: Date = new Date(),
): WeeklyVolume[] {
  const sevenDaysAgo = new Date(targetDate);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const recentLogs = logs.filter(
    (log) => log.loggedAt > sevenDaysAgo && log.loggedAt <= targetDate,
  );

  const volumeMap = new Map<string, WeeklyVolume>();

  for (const log of recentLogs) {
    if (log.reps === undefined || log.reps === null) continue;

    const existing = volumeMap.get(log.exerciseName) || {
      exerciseName: log.exerciseName,
      sets: 0,
      totalReps: 0,
    };

    existing.sets += 1;
    existing.totalReps += log.reps;

    volumeMap.set(log.exerciseName, existing);
  }

  return Array.from(volumeMap.values());
}

interface ExerciseStats {
  maxWeight: number;
  maxRepsAtMaxWeight: number;
}

export function calculateProgressiveOverload(
  logs: ExerciseLog[],
  targetDate: Date = new Date(),
): ProgressiveOverload[] {
  const sevenDaysAgo = new Date(targetDate);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const fourteenDaysAgo = new Date(targetDate);
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

  const currentWeekLogs = logs.filter(
    (log) => log.loggedAt > sevenDaysAgo && log.loggedAt <= targetDate,
  );
  const previousWeekLogs = logs.filter(
    (log) => log.loggedAt >= fourteenDaysAgo && log.loggedAt <= sevenDaysAgo,
  );

  const getStats = (weekLogs: ExerciseLog[]) => {
    const statsMap = new Map<string, ExerciseStats>();
    for (const log of weekLogs) {
      if (
        log.weight === undefined ||
        log.weight === null ||
        log.reps === undefined ||
        log.reps === null
      )
        continue;
      const existing = statsMap.get(log.exerciseName);
      if (!existing) {
        statsMap.set(log.exerciseName, { maxWeight: log.weight, maxRepsAtMaxWeight: log.reps });
      } else {
        if (log.weight > existing.maxWeight) {
          statsMap.set(log.exerciseName, { maxWeight: log.weight, maxRepsAtMaxWeight: log.reps });
        } else if (log.weight === existing.maxWeight && log.reps > existing.maxRepsAtMaxWeight) {
          statsMap.set(log.exerciseName, { maxWeight: log.weight, maxRepsAtMaxWeight: log.reps });
        }
      }
    }
    return statsMap;
  };

  const currentStats = getStats(currentWeekLogs);
  const previousStats = getStats(previousWeekLogs);

  const result: ProgressiveOverload[] = [];

  for (const [exerciseName, current] of currentStats.entries()) {
    const previous = previousStats.get(exerciseName);
    if (!previous) continue;

    let status: "progressed" | "maintained" | "regressed" = "maintained";

    if (current.maxWeight > previous.maxWeight) {
      status = "progressed";
    } else if (current.maxWeight < previous.maxWeight) {
      status = "regressed";
    } else {
      if (current.maxRepsAtMaxWeight > previous.maxRepsAtMaxWeight) {
        status = "progressed";
      } else if (current.maxRepsAtMaxWeight < previous.maxRepsAtMaxWeight) {
        status = "regressed";
      }
    }

    result.push({
      exerciseName,
      status,
      previousMaxWeight: previous.maxWeight,
      currentMaxWeight: current.maxWeight,
      previousMaxRepsAtMaxWeight: previous.maxRepsAtMaxWeight,
      currentMaxRepsAtMaxWeight: current.maxRepsAtMaxWeight,
    });
  }

  return result;
}
