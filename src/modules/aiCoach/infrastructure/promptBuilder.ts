import { Result } from "neverthrow";
import type { UserProfile } from "@/modules/profile/domain";
import { localeDateString } from "@/modules/sharedKernel/domain";
import {
  summarizeTrainingInsights,
  type TrainingInsights,
} from "@/modules/trainingInsights/domain";
import {
  getSessionStartBoundary,
  resolveCurrentSession,
  type WorkoutPhase,
  type WorkoutSession,
} from "@/modules/trainingLogs/application";
import type { ExerciseLog } from "@/modules/trainingLogs/domain";
import type { PreviousAiMessage } from "../domain/types";

const INITIAL_LOG_WINDOW_DAYS = 14;
const EXTENDED_LOG_WINDOW_DAYS = 28;
const MIN_INITIAL_LOG_ENTRIES = 12;

export function getWorkoutStatus(session: WorkoutSession | null): string {
  if (!session) return "Not started";
  return session.phase === "post-workout" ? "Completed" : "In progress";
}

export function getWorkoutPhase(session: WorkoutSession | null): WorkoutPhase {
  return session?.phase ?? "planning";
}

export function getDaysSinceLastWorkout(
  exerciseLogs: ExerciseLog[],
  session: WorkoutSession | null,
): number | null {
  const sessionBoundary = getSessionStartBoundary(session);
  const pastLogs = exerciseLogs.filter((log) => log.loggedAt.getTime() < sessionBoundary);
  if (pastLogs.length === 0) return null;
  const lastLogTime = pastLogs.reduce((max, l) => Math.max(max, l.loggedAt.getTime()), 0);
  const lastLogDate = new Date(lastLogTime);
  const diffMs = sessionBoundary - lastLogDate.setHours(0, 0, 0, 0);
  return Math.round(diffMs / 86400000);
}

export function getTrainingPattern(exerciseLogs: ExerciseLog[]): string | null {
  const fourWeeksAgo = new Date();
  fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28);
  const recentLogs = exerciseLogs.filter((l) => l.loggedAt.getTime() >= fourWeeksAgo.getTime());
  if (recentLogs.length === 0) return null;

  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const dayCounts = new Map<number, number>();
  const seenDates = new Set<string>();
  for (const log of recentLogs) {
    const dateKey = log.loggedAt.toDateString();
    if (seenDates.has(dateKey)) continue;
    seenDates.add(dateKey);
    const day = log.loggedAt.getDay();
    dayCounts.set(day, (dayCounts.get(day) ?? 0) + 1);
  }

  const activeDays = [...dayCounts.entries()]
    .filter(([, count]) => count >= 2)
    .sort(([a], [b]) => a - b)
    .map(([day]) => dayNames[day]);

  return activeDays.length > 0 ? activeDays.join(", ") : null;
}

export function compactLogs(logs: ExerciseLog[]): string {
  if (logs.length === 0) return "(none)";
  const byDate = new Map<string, ExerciseLog[]>();
  for (const log of logs) {
    const dateKey = localeDateString(log.loggedAt);
    const existing = byDate.get(dateKey) ?? [];
    existing.push(log);
    byDate.set(dateKey, existing);
  }

  const lines: string[] = [];
  for (const [date, dayLogs] of byDate) {
    const byExercise = new Map<string, ExerciseLog[]>();
    for (const log of dayLogs) {
      const existing = byExercise.get(log.exerciseName) ?? [];
      existing.push(log);
      byExercise.set(log.exerciseName, existing);
    }

    const parts: string[] = [];
    for (const [name, sets] of byExercise) {
      const reps = sets.map((s) => s.reps).filter((v): v is number => typeof v === "number");
      const weights = sets.map((s) => s.weight).filter((v): v is number => typeof v === "number");
      const rpes = sets.map((s) => s.rpe).filter((v): v is number => typeof v === "number");
      const durations = sets
        .map((s) => s.duration)
        .filter((v): v is number => typeof v === "number");
      const distances = sets
        .map((s) => s.distance)
        .filter((v): v is number => typeof v === "number");

      const summaryParts = [`${sets.length} sets`];
      if (reps.length > 0) {
        const minReps = Math.min(...reps);
        const maxReps = Math.max(...reps);
        summaryParts.push(minReps === maxReps ? `${maxReps} reps` : `reps: ${reps.join(",")}`);
      }
      if (weights.length > 0) {
        const minWeight = Math.min(...weights);
        const maxWeight = Math.max(...weights);
        summaryParts.push(
          minWeight === maxWeight ? `${maxWeight}kg` : `${minWeight}-${maxWeight}kg`,
        );
      }
      if (distances.length > 0) {
        const totalDistance = Math.round(distances.reduce((acc, v) => acc + v, 0));
        summaryParts.push(`${totalDistance}m total`);
      }
      if (durations.length > 0) {
        const totalMinutes = Math.round(durations.reduce((acc, v) => acc + v, 0));
        summaryParts.push(`${totalMinutes}min total`);
      }
      if (rpes.length > 0) {
        const allSame = rpes.every((r) => r === rpes[0]);
        summaryParts.push(allSame ? `@RPE${rpes[0]}` : `RPE: ${rpes.join(",")}`);
      }

      parts.push(`${name}: ${summaryParts.join(", ")}`);
    }
    lines.push(`${date}: ${parts.join(" | ")}`);
  }
  return lines.join("\n");
}

export function getRecentLogs(exerciseLogs: ExerciseLog[], days: number): ExerciseLog[] {
  const since = new Date();
  since.setDate(since.getDate() - days);
  return exerciseLogs.filter((log) => log.loggedAt.getTime() >= since.getTime());
}

export function getInitialLogsWindow(exerciseLogs: ExerciseLog[]): {
  logs: ExerciseLog[];
  label: string;
} {
  const last2WeeksLogs = getRecentLogs(exerciseLogs, INITIAL_LOG_WINDOW_DAYS);
  if (last2WeeksLogs.length >= MIN_INITIAL_LOG_ENTRIES) {
    return {
      logs: last2WeeksLogs,
      label: `Recent logs (last ${INITIAL_LOG_WINDOW_DAYS / 7} weeks)`,
    };
  }

  const last4WeeksLogs = getRecentLogs(exerciseLogs, EXTENDED_LOG_WINDOW_DAYS);
  if (
    last4WeeksLogs.length >= MIN_INITIAL_LOG_ENTRIES ||
    exerciseLogs.length <= last4WeeksLogs.length
  ) {
    return {
      logs: last4WeeksLogs,
      label: `Recent logs (last ${EXTENDED_LOG_WINDOW_DAYS / 7} weeks)`,
    };
  }

  return {
    logs: getRecentLogs(exerciseLogs, 90),
    label: "Recent logs (last 13 weeks)",
  };
}

export function buildPriorPlanSummary(
  previousMessages: PreviousAiMessage[],
  todayLogs: ExerciseLog[],
): string | null {
  const assistantMsgs = previousMessages.filter((m) => m.role === "assistant");

  let parsedPlan: Record<string, unknown> | null = null;
  for (let i = assistantMsgs.length - 1; i >= 0; i--) {
    const msg = assistantMsgs[i];
    const parsed = Result.fromThrowable(
      () => JSON.parse(msg.content),
      () => null,
    )().unwrapOr(null);

    if (
      parsed &&
      Array.isArray(parsed.recommendedWorkout) &&
      parsed.recommendedWorkout.length > 0
    ) {
      parsedPlan = parsed;
      break;
    }
  }

  if (!parsedPlan) return null;

  if (!Array.isArray(parsedPlan.recommendedWorkout) || parsedPlan.recommendedWorkout.length === 0) {
    return null;
  }

  const todayExercises = new Map<string, number>();
  for (const log of todayLogs) {
    todayExercises.set(log.exerciseName, (todayExercises.get(log.exerciseName) ?? 0) + 1);
  }

  const lines = parsedPlan.recommendedWorkout.map(
    (ex: {
      exerciseName: string;
      targetSets: number;
      targetWeight?: string;
      targetReps?: string;
      restSeconds?: number;
    }) => {
      const done = todayExercises.get(ex.exerciseName) ?? 0;
      const target = ex.targetSets ?? 0;
      let status: string;
      if (target > 0 && done >= target) {
        status = "✓ done";
      } else if (done > 0) {
        status = `${done}/${target} sets`;
      } else if (target > 0) {
        status = `0/${target} sets pending`;
      } else {
        status = "pending";
      }

      const parts = [status];
      if (ex.targetReps) parts.push(`${ex.targetReps} reps`);
      if (ex.targetWeight) parts.push(`@${ex.targetWeight}`);
      if (ex.restSeconds) parts.push(`${ex.restSeconds}s rest`);

      return `${ex.exerciseName}: ${parts.join(", ")}`;
    },
  );

  const jsonText = `Prior Recommended Workout JSON:\n\`\`\`json\n${JSON.stringify(parsedPlan.recommendedWorkout)}\n\`\`\``;
  if (todayLogs.length === 0) {
    return jsonText;
  }
  const progressText = `Current progress against last plan:\n\`\`\`\n${lines.join("\n")}\n\`\`\``;
  return `${progressText}\n\n${jsonText}`;
}

export function buildCompactProfileContext(userProfile: UserProfile): Record<string, unknown> {
  return {
    age: userProfile.age ?? undefined,
    heightCm: userProfile.heightCm ?? undefined,
    weightKg: userProfile.weightKg ?? undefined,
    fitnessGoal: userProfile.fitnessGoal?.length ? userProfile.fitnessGoal : undefined,
    fitnessLevel: userProfile.fitnessLevel ?? undefined,
    workoutDaysPerWeek: userProfile.workoutDaysPerWeek ?? undefined,
    workoutLocation: userProfile.workoutLocation ?? undefined,
    equipmentAccess: userProfile.equipmentAccess?.length ? userProfile.equipmentAccess : undefined,
  };
}

export function getRecentExerciseNames(
  exerciseLogs: ExerciseLog[],
  previousMessages: PreviousAiMessage[],
  days = 90,
): Set<string> {
  const names = new Set<string>();

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffMs = cutoff.getTime();
  for (const log of exerciseLogs) {
    if (log.loggedAt.getTime() >= cutoffMs) {
      names.add(log.exerciseName);
    }
  }

  const assistantMsgs = previousMessages.filter((m) => m.role === "assistant");
  for (let i = assistantMsgs.length - 1; i >= 0; i--) {
    const msg = assistantMsgs[i];
    const parsed = Result.fromThrowable(
      () => JSON.parse(msg.content) as Record<string, unknown>,
      () => null,
    )().unwrapOr(null);

    if (
      parsed &&
      Array.isArray(parsed.recommendedWorkout) &&
      parsed.recommendedWorkout.length > 0
    ) {
      for (const ex of parsed.recommendedWorkout) {
        if (
          ex &&
          typeof ex === "object" &&
          "exerciseName" in ex &&
          typeof ex.exerciseName === "string"
        ) {
          names.add(ex.exerciseName);
        }
      }
      break;
    }
  }

  const session = resolveCurrentSession(exerciseLogs);
  const todayLogs = session?.logs ?? [];
  for (const log of todayLogs) {
    names.add(log.exerciseName);
  }

  return names;
}

export function buildCompactTrainingContext(
  insights: TrainingInsights,
  recentExerciseNames?: Set<string>,
): Record<string, unknown> {
  const summary = summarizeTrainingInsights(insights);
  const exerciseTrends = Object.fromEntries(
    Object.entries(insights.e1rm)
      .filter(([name]) => !recentExerciseNames || recentExerciseNames.has(name))
      .map(([name, data]) => [
        name,
        {
          e1rm: data.e1rm,
          plateau: data.plateau || undefined,
          bestRPE: data.bestRPE ?? undefined,
          recentTrend: data.trend.slice(-3),
        },
      ]),
  );

  return {
    summary,
    phase: insights.phase,
    acwr: insights.acwr ?? undefined,
    deloadStatus: insights.deloadStatus,
    deloadEndsAt: insights.deloadEndsAt ?? undefined,
    e1rmPaused: insights.e1rmPaused || undefined,
    plateauPaused: insights.plateauPaused || undefined,
    fatigue: {
      shouldDeload: insights.fatigue.shouldDeload || undefined,
      reason: insights.fatigue.reason ?? undefined,
      riskScore: insights.fatigue.riskScore || undefined,
      hasSufficientHistory: insights.fatigue.hasSufficientHistory || undefined,
      decliningExercises: insights.fatigue.decliningExercises || undefined,
      weeklyTotalSets:
        insights.fatigue.weeklyTotalSets.length > 0 ? insights.fatigue.weeklyTotalSets : undefined,
      weeklyTonnage:
        insights.fatigue.weeklyTonnage.length > 0 ? insights.fatigue.weeklyTonnage : undefined,
      loadWindow: insights.fatigue.hasSufficientHistory ? insights.fatigue.loadWindow : undefined,
      triggeredBy:
        insights.fatigue.triggeredBy.length > 0 ? insights.fatigue.triggeredBy : undefined,
    },
    deloadTriggerSnapshot: insights.deloadTriggerSnapshot ?? undefined,
    exerciseTrends,
  };
}
