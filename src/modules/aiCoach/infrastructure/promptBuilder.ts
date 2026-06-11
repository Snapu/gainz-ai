import { Result } from "neverthrow";
import { isoDateString } from "@/modules/sharedKernel/domain";
import {
  classifyExercise,
  getMuscleActivation,
  getProgressionIncrement,
  type TrainingInsights,
} from "@/modules/trainingInsights/domain";
import {
  getSessionStartBoundary,
  type WorkoutPhase,
  type WorkoutSession,
} from "@/modules/trainingLogs/application";
import type { ExerciseLog } from "@/modules/trainingLogs/domain";
import type { TrainingPlan } from "../domain";
import type { CoachingMessage } from "../domain/types";

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

  return activeDays.length > 0 ? activeDays.join(",") : null;
}

/**
 * Renders exercise logs as ultra-compact text.
 *
 * Format per day:
 *   2026-05-17:
 *     Exercise Name: reps×kg@rpe, reps×kg@rpe
 *
 * Set notation: `reps×kg@rpe` — fields are omitted when absent.
 * Examples: `10×50@8.5`, `10×50` (no RPE), `10r` (bodyweight), `500m`, `30min`
 */
export function compactLogs(logs: ExerciseLog[]): string {
  if (logs.length === 0) return "(none)";

  // Group by ISO date for stable ordering regardless of locale
  const byDate = new Map<string, ExerciseLog[]>();
  for (const log of logs) {
    const dateKey = isoDateString(log.loggedAt);
    const existing = byDate.get(dateKey) ?? [];
    existing.push(log);
    byDate.set(dateKey, existing);
  }

  const lines: string[] = [];
  for (const [date, dayLogs] of byDate) {
    lines.push(`${date}:`);

    // Group by exercise name within the day
    const byExercise = new Map<string, ExerciseLog[]>();
    for (const log of dayLogs) {
      const existing = byExercise.get(log.exerciseName) ?? [];
      existing.push(log);
      byExercise.set(log.exerciseName, existing);
    }

    for (const [name, sets] of byExercise) {
      const setEntries = sets.map((s) => {
        // Distance-only: 500m
        if (typeof s.distance === "number" && typeof s.reps !== "number") {
          const rpe = typeof s.rpe === "number" ? `@${s.rpe}` : "";
          return `${s.distance}m${rpe}`;
        }
        // Duration-only: 30min
        if (typeof s.duration === "number" && typeof s.reps !== "number") {
          const rpe = typeof s.rpe === "number" ? `@${s.rpe}` : "";
          return `${s.duration}min${rpe}`;
        }
        // Standard: reps×kg@rpe (each field optional)
        const reps = typeof s.reps === "number" ? `${s.reps}` : "";
        const weight = typeof s.weight === "number" ? `×${s.weight}` : "";
        const rpe = typeof s.rpe === "number" ? `@${s.rpe}` : "";
        // Bodyweight: no weight field → append 'r' suffix for clarity
        const suffix = typeof s.weight !== "number" && typeof s.reps === "number" ? "r" : "";
        return `${reps}${suffix}${weight}${rpe}`;
      });
      lines.push(`  ${name}: ${setEntries.join(", ")}`);
    }
  }

  return lines.join("\n");
}

function getRecentLogs(exerciseLogs: ExerciseLog[], days: number): ExerciseLog[] {
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
      label: `logs (last ${INITIAL_LOG_WINDOW_DAYS / 7} weeks)`,
    };
  }

  const last4WeeksLogs = getRecentLogs(exerciseLogs, EXTENDED_LOG_WINDOW_DAYS);
  if (
    last4WeeksLogs.length >= MIN_INITIAL_LOG_ENTRIES ||
    exerciseLogs.length <= last4WeeksLogs.length
  ) {
    return {
      logs: last4WeeksLogs,
      label: `logs (last ${EXTENDED_LOG_WINDOW_DAYS / 7} weeks)`,
    };
  }

  return {
    logs: getRecentLogs(exerciseLogs, 90),
    label: "logs (last 13 weeks)",
  };
}

export function buildPriorPlanSummary(
  previousMessages: CoachingMessage[],
  todayLogs: ExerciseLog[],
): string | null {
  const coachMessages = previousMessages.filter((m) => m.role === "coach");

  let parsedPlan: Record<string, unknown> | null = null;
  for (let i = coachMessages.length - 1; i >= 0; i--) {
    const msg = coachMessages[i];
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
      targetDurationSeconds?: number;
      targetDistanceMeters?: number;
      restSeconds?: number;
    }) => {
      const done = todayExercises.get(ex.exerciseName) ?? 0;
      const target = ex.targetSets ?? 0;
      let status: string;
      if (target > 0 && done >= target) {
        status = "✓";
      } else if (done > 0) {
        status = `${done}/${target}`;
      } else if (target > 0) {
        status = `0/${target}`;
      } else {
        status = "pending";
      }

      const parts = [status];
      if (ex.targetDistanceMeters != null) parts.push(`${ex.targetDistanceMeters}m`);
      else if (ex.targetDurationSeconds != null) parts.push(`${ex.targetDurationSeconds}s`);
      else if (ex.targetReps) parts.push(`${ex.targetReps}r`);
      if (ex.targetWeight) parts.push(`@${ex.targetWeight}`);
      if (ex.restSeconds) parts.push(`${ex.restSeconds}s`);

      return `  ${ex.exerciseName}: ${parts.join(" ")}`;
    },
  );

  const jsonText = `prior plan:\n\`\`\`json\n${JSON.stringify(parsedPlan.recommendedWorkout)}\n\`\`\``;
  if (todayLogs.length === 0) {
    return jsonText;
  }
  const progressText = `progress:\n${lines.join("\n")}`;
  return `${progressText}\n\n${jsonText}`;
}

function addNamesFromMessages(names: Set<string>, messages: CoachingMessage[]): void {
  const coachMessages = messages.filter((m) => m.role === "coach");
  for (let i = coachMessages.length - 1; i >= 0; i--) {
    const msg = coachMessages[i];
    if (!msg) continue;
    try {
      const parsed = JSON.parse(msg.content) as Record<string, unknown>;
      if (parsed && Array.isArray(parsed.recommendedWorkout)) {
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
      }
    } catch (e) {
      // ignore parse errors
    }
  }
}

export function getRecentExerciseNames(
  exerciseLogs: ExerciseLog[],
  previousMessages: CoachingMessage[],
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

  addNamesFromMessages(names, previousMessages);
  return names;
}

/**
 * Count how many sets of a given exercise appear in the trailing `days` window.
 * Used to give the AI per-exercise weekly set volume context.
 */
function countRecentSets(exerciseName: string, exerciseLogs: ExerciseLog[], days: number): number {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffMs = cutoff.getTime();
  return exerciseLogs.filter(
    (l) => l.exerciseName === exerciseName && l.loggedAt.getTime() >= cutoffMs,
  ).length;
}

const TREND_SYMBOL: Record<string, string> = {
  improving: "↑",
  stable: "→",
  plateau: "→",
  dropping: "↓",
};

/**
 * Formats workload regulation data as compact YAML.
 *
 * Output:
 *   acwr: 0.94
 *   fatigue: {risk: 0, deload: false, declining: 1, sufficient: true}
 *   load:
 *     sets: {w-3: 24, w-2: 45, w-1: 30, now: 31, avg: 31.2, ratio: 0.93}
 *     tonnage: {w-3: 8228, w-2: 18289, w-1: 12074, now: 11517, avg: 11954, ratio: 0.92}
 *   deload: {status: completed, ended: 2026-05-24, triggers: [volumeSpike,...], risk: 6}
 */
function formatFatigueAndLoad(insights: TrainingInsights): string[] {
  const { fatigue } = insights;
  const lw = fatigue.loadWindow;
  const lines: string[] = [];

  const fatigueParts = [`risk: ${fatigue.riskScore}`, `deload: ${fatigue.shouldDeload}`];
  if (fatigue.decliningExercises) fatigueParts.push(`declining: ${fatigue.decliningExercises}`);
  if (fatigue.hasSufficientHistory) fatigueParts.push("sufficient: true");
  if (fatigue.reason) fatigueParts.push(`reason: ${fatigue.reason}`);
  lines.push(`fatigue: {${fatigueParts.join(", ")}}`);

  if (fatigue.hasSufficientHistory) {
    const s = lw.sets;
    const t = lw.tonnage;
    const sRatio = s.ratioVsPriorAvg !== null ? `, ratio: ${s.ratioVsPriorAvg.toFixed(2)}` : "";
    const tRatio = t.ratioVsPriorAvg !== null ? `, ratio: ${t.ratioVsPriorAvg.toFixed(2)}` : "";
    lines.push("load:");
    lines.push(
      `  sets: {w-3: ${Math.round(s.weekMinus3)}, w-2: ${Math.round(s.weekMinus2)}, w-1: ${Math.round(s.weekMinus1)}, now: ${Math.round(s.current)}, avg: ${Math.round(s.prior3WeekAvg)}${sRatio}}`,
    );
    lines.push(
      `  tonnage: {w-3: ${Math.round(t.weekMinus3)}, w-2: ${Math.round(t.weekMinus2)}, w-1: ${Math.round(t.weekMinus1)}, now: ${Math.round(t.current)}, avg: ${Math.round(t.prior3WeekAvg)}${tRatio}}`,
    );
  }
  return lines;
}

export function formatWorkload(insights: TrainingInsights): string {
  const lines: string[] = [];

  if (insights.acwr !== null) lines.push(`acwr: ${insights.acwr.toFixed(2)}`);

  lines.push(...formatFatigueAndLoad(insights));

  const deload = insights.deloadStatus;
  if (deload !== "none") {
    const parts = [`status: ${deload}`];
    if (insights.deloadEndsAt)
      parts.push(`ended: ${isoDateString(new Date(insights.deloadEndsAt))}`);
    if (insights.deloadTriggerSnapshot) {
      parts.push(`triggers: [${insights.deloadTriggerSnapshot.triggeredBy.join(",")}]`);
      parts.push(`risk: ${insights.deloadTriggerSnapshot.riskScore}`);
    }
    if (insights.deloadStatus === "active" && insights.deloadTimeRemainingMs !== null) {
      parts.push(`daysLeft: ${Math.ceil(insights.deloadTimeRemainingMs / 86400000)}`);
    }
    lines.push(`deload: {${parts.join(", ")}}`);
  }

  return lines.join("\n");
}

/**
 * Formats muscle group data as a compact pipe-delimited table.
 *
 * Header comment: # sets/direct | landmark | freq | hours | ready | trend
 * Example row:   Chest: 7.3/7.3 | MEV | 3x | 23h | ✓ | ↑
 *
 * Landmarks are shortened: below_MEV→bMEV, at_MEV→MEV, at_MAV→MAV,
 *   approaching_MRV→→MRV, above_MRV→>MRV
 */
export function formatMuscles(insights: TrainingInsights): string {
  const LANDMARK_SHORT: Record<string, string> = {
    below_MEV: "bMEV",
    at_MEV: "MEV",
    at_MAV: "MAV",
    approaching_MRV: "→MRV",
    above_MRV: ">MRV",
  };

  const lines = ["# sets/direct | landmark | freq | hours | ready | trend"];
  for (const [name, data] of Object.entries(insights.muscleGroups)) {
    if (!data) continue;
    const hours =
      data.hoursSinceLastTrained !== null ? `${Math.round(data.hoursSinceLastTrained)}h` : "—";
    const ready = data.recoveryReady ? "✓" : "✗";
    const trend = data.trendStatus ? (TREND_SYMBOL[data.trendStatus] ?? "?") : "";
    const landmark = LANDMARK_SHORT[data.landmark] ?? data.landmark;
    const parts = [
      `${data.sets}/${data.directSets}`,
      landmark,
      `${data.frequencyPerWeek}x`,
      hours,
      ready,
    ];
    if (trend) parts.push(trend);
    lines.push(`${name}: ${parts.join(" | ")}`);
  }
  return lines.join("\n");
}

/**
 * Formats exercise trend data as compact inline entries.
 *
 * Example:
 *   Bankdrücken: e1rm:79.9 muscle:Chest hyp:40-65 str:67.5-77.5 SWAP trend:04-17→80.4 04-22→78.6 04-23→79.9
 */
function buildExerciseParts(
  name: string,
  data: Record<string, any>,
  exerciseLogs: ExerciseLog[],
  recentExerciseNames?: Set<string>,
): string[] | null {
  if (recentExerciseNames && !recentExerciseNames.has(name)) return null;

  const activation = getMuscleActivation(name);
  const weeklySetCount = countRecentSets(name, exerciseLogs, 7) || undefined;

  const parts: string[] = [`e1rm:${data.e1rm}`];
  if (activation?.primaryMuscle) parts.push(`muscle:${activation.primaryMuscle}`);
  if (weeklySetCount) parts.push(`wk:${weeklySetCount}`);
  if (data.rpeOverloadReady) parts.push("rpe_trigger:overload_ready");
  else if (data.bestRPE != null) parts.push(`rpe:${data.bestRPE}`);

  if (data.swapRecommended) parts.push("SWAP");
  else if (data.plateau) parts.push("PLATEAU");

  if (data.targetWeightHyp)
    parts.push(`hyp:${data.targetWeightHyp.low}-${data.targetWeightHyp.high}`);
  if (data.targetWeightStr)
    parts.push(`str:${data.targetWeightStr.low}-${data.targetWeightStr.high}`);
  if (data.e1rm > 0) parts.push(`inc:+${getProgressionIncrement(classifyExercise(name))}kg`);

  const trendSlice = data.trend.slice(-3);
  const trendParts = trendSlice.map((e1rm: number, i: number) => {
    const dateOffset = data.trendDates.length - trendSlice.length + i;
    const trendDate = data.trendDates[dateOffset];
    if (!trendDate) return `${e1rm}`;
    const mmdd = isoDateString(trendDate).slice(5);
    return `${mmdd}→${e1rm}`;
  });
  if (trendParts.length > 0) parts.push(`trend:${trendParts.join(" ")}`);

  return parts;
}

export function formatExercises(
  insights: TrainingInsights,
  exerciseLogs: ExerciseLog[],
  recentExerciseNames?: Set<string>,
): string {
  const lines: string[] = [];
  for (const [name, data] of Object.entries(insights.e1rm)) {
    const parts = buildExerciseParts(name, data, exerciseLogs, recentExerciseNames);
    if (parts) lines.push(`${name}: ${parts.join(" ")}`);
  }
  return lines.join("\n");
}

/**
 * Formats a multi-week training plan for the AI prompt.
 *
 * Example output:
 * cycle: 2w, created: 2026-06-02
 * W1-Mon Unit A (Push Focus):
 *   Incline DB Press: 3×6-8 @8.5
 *   ...
 */
function formatPlanExercise(ex: Record<string, any>): string {
  let repsStr = "";
  if (ex.targetDistanceMeters != null) repsStr = `${ex.targetDistanceMeters}m`;
  else if (ex.targetDurationSeconds != null) repsStr = `${ex.targetDurationSeconds}s`;
  else repsStr = ex.targetReps ?? "";

  const parts = [`${ex.targetSets}×${repsStr}`];
  if (ex.targetWeight) parts.push(`@${ex.targetWeight}`);
  if (ex.targetRpe) parts.push(`@RPE${ex.targetRpe}`);
  if (ex.restSeconds) parts.push(`${ex.restSeconds}s`);
  if (ex.supersetId) parts.push(`[SS:${ex.supersetId}]`);
  if (ex.notes) parts.push(`(${ex.notes})`);
  return `  ${ex.exerciseName}: ${parts.join(" ")}`;
}

export function formatPlanForPrompt(plan: TrainingPlan, currentWeekNumber?: number): string {
  const lines: string[] = [];
  const createdAtStr = isoDateString(new Date(plan.createdAt));
  lines.push(`cycle: ${plan.cycleWeeks}w, created: ${createdAtStr}`);

  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const currentDayOfWeek = new Date().getDay();

  for (const session of plan.sessions) {
    const dayStr = dayNames[session.dayOfWeek] ?? `Day${session.dayOfWeek}`;
    const isToday =
      session.dayOfWeek === currentDayOfWeek &&
      (currentWeekNumber == null || session.weekNumber === currentWeekNumber);
    const todayMarker = isToday ? " [TODAY]" : "";

    lines.push(
      `W${session.weekNumber}-${dayStr} ${session.sessionLabel} (${session.focusDescription}):${todayMarker}`,
    );
    for (const ex of session.exercises) {
      lines.push(formatPlanExercise(ex));
    }
  }

  return lines.join("\n");
}
