import type { Event } from "@/modules/events/domain";
import { isoDateString } from "@/modules/sharedKernel/domain";
import {
  getSessionStartBoundary,
  resolveCurrentSession,
  type WorkoutSession,
} from "@/modules/trainingLogs/application";
import type { ExerciseLog } from "@/modules/trainingLogs/domain";
import type { CoachingAdviceRequest, CoachingMessage } from "../domain";
import {
  buildPriorPlanSummary,
  compactLogs,
  formatExercises,
  formatMuscles,
  formatPlanForPrompt,
  formatWorkload,
  getDaysSinceLastWorkout,
  getInitialLogsWindow,
  getRecentExerciseNames,
  getTrainingPattern,
  getWorkoutPhase,
  getWorkoutStatus,
} from "./promptBuilder";

const MAX_SUMMARIES_IN_PROMPT = 12;

export interface AssemblePromptContext {
  session: WorkoutSession | null;
  todayLogs: ExerciseLog[];
  isFirstMessage: boolean;
  phase: string;
  isMidWorkout: boolean;
  recentExerciseNames: Set<string>;
  initialWindow: ReturnType<typeof getInitialLogsWindow>;
  workoutStatus: string;
  now: Date;
  currentTime: string;
}

export function assemblePromptContext(
  exerciseLogs: ExerciseLog[],
  previousMessages: CoachingMessage[],
): AssemblePromptContext {
  const session = resolveCurrentSession(exerciseLogs);
  const todayLogs = session?.logs ?? [];
  const isFirstMessage = previousMessages.length === 0;
  const phase = getWorkoutPhase(session);
  const isMidWorkout = phase === "mid-workout";
  const recentExerciseNames = getRecentExerciseNames(exerciseLogs, previousMessages, 90);
  const initialWindow = getInitialLogsWindow(exerciseLogs);
  const workoutStatus = getWorkoutStatus(session);
  const now = new Date();
  const currentTime = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`;

  return {
    session,
    todayLogs,
    isFirstMessage,
    phase,
    isMidWorkout,
    recentExerciseNames,
    initialWindow,
    workoutStatus,
    now,
    currentTime,
  };
}

export function assembleCoachingPrompt(
  options: CoachingAdviceRequest,
  context: AssemblePromptContext,
): string {
  const {
    userProfile,
    insights,
    exerciseLogs,
    trainingSummaries,
    previousMessages,
    events = [],
    question,
  } = options;

  const {
    session,
    todayLogs,
    isFirstMessage,
    phase,
    isMidWorkout,
    recentExerciseNames,
    initialWindow,
    workoutStatus,
    now,
    currentTime,
  } = context;

  // ── # session — metadata + profile + preferences merged ──────────────
  const sessionParts: string[] = [
    `date: ${isoDateString(now)} ${currentTime}`,
    `status: ${workoutStatus}`,
    `phase: ${phase}`,
  ];

  const restDays = getDaysSinceLastWorkout(exerciseLogs, session);
  if (restDays !== null) sessionParts.push(`restDays: ${restDays}`);

  const activePlanLoaded = options.activePlan;
  if (activePlanLoaded) {
    sessionParts.push("planStatus: active");
    const cycleWeek = activePlanLoaded.getCurrentWeekNumber(now);
    sessionParts.push(`cycleWeek: ${cycleWeek}`);
  }

  if (isFirstMessage) {
    const pattern = getTrainingPattern(exerciseLogs);
    if (pattern) sessionParts.push(`pattern: ${pattern}`);
  }

  // Profile fields inline
  const p = userProfile;
  const profileParts: string[] = [];
  if (p.age != null) profileParts.push(`age: ${p.age}`);
  if (p.heightCm != null) profileParts.push(`height: ${p.heightCm}`);
  if (p.weightKg != null) profileParts.push(`weight: ${p.weightKg}`);
  if (p.fitnessGoal?.length) profileParts.push(`goal: ${p.fitnessGoal.join(",")}`);
  if (p.fitnessLevel) profileParts.push(`level: ${p.fitnessLevel}`);
  if (p.workoutDaysPerWeek != null) profileParts.push(`days: ${p.workoutDaysPerWeek}`);
  if (p.workoutLocation) profileParts.push(`location: ${p.workoutLocation}`);
  if (profileParts.length) sessionParts.push(`profile: {${profileParts.join(", ")}}`);

  if (p.equipmentAccess?.length) {
    sessionParts.push(`equipment: [${p.equipmentAccess.join(", ")}]`);
  }

  sessionParts.push(`locale: ${navigator.language}`);
  sessionParts.push("units: kg/min/m");

  const sections: string[] = [`# session\n${sessionParts.join("\n")}`];

  // ── # question ────────────────────────────────────────────────────────
  if (question) {
    sections.push(`# question\n${question}`);
  }

  // ── # goals ───────────────────────────────────────────────────────────
  if (isFirstMessage || question) {
    const freeInputClean = userProfile.freeUserInput?.trim();
    if (freeInputClean) {
      sections.push(`# goals\n${freeInputClean}`);
    }
  }

  // ── # workload / # muscles / # exercises ──────────────────────────────
  const hasPlanActive = sessionParts.some((p) => p.startsWith("planStatus:"));
  if (phase === "planning" || isFirstMessage || question || hasPlanActive) {
    sections.push(`# workload\n${formatWorkload(insights)}`);
    sections.push(`# muscles\n${formatMuscles(insights)}`);
    sections.push(`# exercises\n${formatExercises(insights, exerciseLogs, recentExerciseNames)}`);
  } else {
    // Mid-workout: compact e1RM line only
    const e1rmCompact = Object.entries(insights.e1rm)
      .filter(([name]) => recentExerciseNames.has(name))
      .map(([name, d]) => {
        let s = `${name}: ${d.e1rm}kg`;
        if (d.plateau) s += " PLATEAU";
        if (d.bestRPE != null) s += ` @RPE${d.bestRPE}`;
        return s;
      })
      .join(", ");
    if (e1rmCompact) {
      sections.push(`# e1rm\n${e1rmCompact}`);
    }
  }

  // ── # today ───────────────────────────────────────────────────────────
  if (todayLogs.length > 0) {
    sections.push(`# today\n${compactLogs(todayLogs)}`);
  }

  // ── # update / # plan ─────────────────────────────────────────────────
  if (previousMessages.length > 0) {
    if (isMidWorkout) {
      const coachMessages = previousMessages.filter((m) => m.role === "coach");
      if (coachMessages.length > 0) {
        const lastCoach = coachMessages[coachMessages.length - 1];
        const cutoff = lastCoach?.timestamp ? new Date(lastCoach.timestamp).getTime() : 0;
        const newLogs = todayLogs.filter((l) => l.loggedAt.getTime() > cutoff);
        if (newLogs.length > 0) {
          sections.push(`# update\n${compactLogs(newLogs)}`);
        }
      }
    }

    const planSummary = buildPriorPlanSummary(previousMessages, todayLogs);
    if (planSummary) {
      sections.push(`# plan\n${planSummary}`);
    }
  }

  const activePlan = options.activePlan;
  if (activePlan && (isFirstMessage || phase === "planning" || hasPlanActive)) {
    const planCycleWeek = activePlan.getCurrentWeekNumber(now);
    sections.push(`# program\n${formatPlanForPrompt(activePlan, planCycleWeek)}`);
  }

  // ── # history / # logs ────────────────────────────────────────────────
  if (isFirstMessage || question) {
    if (trainingSummaries.length > 0) {
      const summaryLines: string[] = [];
      const byMonth = new Map<string, typeof trainingSummaries>();
      for (const s of trainingSummaries.slice(-MAX_SUMMARIES_IN_PROMPT)) {
        const key = `${s.year}-${String(s.month).padStart(2, "0")}`;
        const existing = byMonth.get(key) ?? [];
        existing.push(s);
        byMonth.set(key, existing);
      }
      for (const [monthKey, entries] of byMonth) {
        const workoutDays = entries[0]?.workoutDays ?? 0;
        summaryLines.push(`${monthKey} (${workoutDays}d):`);
        for (const s of entries) {
          const parts: string[] = [`${s.sets}s`];
          if (s.totalReps) parts.push(`${s.totalReps}r`);
          if (s.maxWeight) parts.push(`max:${s.maxWeight}`);
          if (s.totalVolume && s.totalReps && s.totalReps > 0) {
            parts.push(`avg:${Math.round((s.totalVolume / s.totalReps) * 10) / 10}`);
          }
          summaryLines.push(`  ${s.exerciseName}: ${parts.join(" ")}`);
        }
      }
      sections.push(`# history\n${summaryLines.join("\n")}`);
    }
  }

  if (isFirstMessage) {
    const sessionBoundary = getSessionStartBoundary(session);
    const historicalLogs = initialWindow.logs.filter((l) => l.loggedAt.getTime() < sessionBoundary);
    if (historicalLogs.length > 0) {
      sections.push(`# ${initialWindow.label}\n${compactLogs(historicalLogs)}`);
    }
  }

  // ── # events ──────────────────────────────────────────────────────────
  if (events.length > 0) {
    const eventsText = events
      .map((event: Event) => `${event.type}: ${event.dates.join(", ")}`)
      .join("\n");
    sections.push(`# events\n${eventsText}`);
  }

  return sections.join("\n\n");
}
