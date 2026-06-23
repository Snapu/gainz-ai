import type { Event } from "@/modules/events/domain";
import { isoDateString } from "@/modules/sharedKernel/domain";
import {
  getSessionStartBoundary,
  resolveCurrentSession,
  type WorkoutSession,
} from "@/modules/trainingLogs/application";
import type { ExerciseLog } from "@/modules/trainingLogs/domain";
import type { TrainingSummary } from "@/modules/trainingSummary/domain";
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

function buildSessionSection(
  options: CoachingAdviceRequest,
  context: AssemblePromptContext,
): string {
  const { session, phase, workoutStatus, now, currentTime } = context;
  const { userProfile, exerciseLogs, activePlan } = options;

  const parts: string[] = [
    `date: ${isoDateString(now)} ${currentTime}`,
    `status: ${workoutStatus}`,
    `phase: ${phase}`,
  ];

  const restDays = getDaysSinceLastWorkout(exerciseLogs, session);
  if (restDays !== null) parts.push(`restDays: ${restDays}`);

  if (activePlan) {
    parts.push("planStatus: active");
    parts.push(`cycleWeek: ${activePlan.getCurrentWeekNumber(now)}`);
  }

  if (context.isFirstMessage) {
    const pattern = getTrainingPattern(exerciseLogs);
    if (pattern) parts.push(`pattern: ${pattern}`);
  }

  const p = userProfile;
  const profileParts: string[] = [];
  if (p.age != null) profileParts.push(`age: ${p.age}`);
  if (p.heightCm != null) profileParts.push(`height: ${p.heightCm}`);
  if (p.weightKg != null) profileParts.push(`weight: ${p.weightKg}`);
  if (p.fitnessGoal?.length) profileParts.push(`goal: ${p.fitnessGoal.join(",")}`);
  if (p.fitnessLevel) profileParts.push(`level: ${p.fitnessLevel}`);
  if (p.workoutDaysPerWeek != null) profileParts.push(`days: ${p.workoutDaysPerWeek}`);
  if (p.workoutLocation) profileParts.push(`location: ${p.workoutLocation}`);
  if (profileParts.length) parts.push(`profile: {${profileParts.join(", ")}}`);

  if (p.equipmentAccess?.length) {
    parts.push(`equipment: [${p.equipmentAccess.join(", ")}]`);
  }

  parts.push(`locale: ${navigator.language}`);
  parts.push("units: kg/min/m");
  return `# session\n${parts.join("\n")}`;
}

function buildHistorySection(summaries: TrainingSummary[]): string {
  if (summaries.length === 0) return "";
  const lines: string[] = [];
  const byMonth = new Map<string, TrainingSummary[]>();
  for (const s of summaries.slice(-12)) {
    const key = `${s.year}-${String(s.month).padStart(2, "0")}`;
    const existing = byMonth.get(key) ?? [];
    existing.push(s);
    byMonth.set(key, existing);
  }
  for (const [monthKey, entries] of byMonth) {
    const workoutDays = entries[0]?.workoutDays ?? 0;
    lines.push(`${monthKey} (${workoutDays}d):`);
    for (const s of entries) {
      const parts: string[] = [`${s.sets}s`];
      if (s.totalReps) parts.push(`${s.totalReps}r`);
      if (s.maxWeight) parts.push(`max:${s.maxWeight}`);
      if (s.totalVolume && s.totalReps && s.totalReps > 0) {
        parts.push(`avg:${Math.round((s.totalVolume / s.totalReps) * 10) / 10}`);
      }
      lines.push(`  ${s.exerciseName}: ${parts.join(" ")}`);
    }
  }
  return `# history\n${lines.join("\n")}`;
}

function buildWorkloadSection(
  options: CoachingAdviceRequest,
  context: AssemblePromptContext,
  sections: string[],
): void {
  const { insights, exerciseLogs, question } = options;
  const { isFirstMessage, phase, recentExerciseNames } = context;

  if (phase === "planning" || isFirstMessage || question) {
    sections.push(`# workload\n${formatWorkload(insights)}`);
    sections.push(`# muscles\n${formatMuscles(insights)}`);
    sections.push(`# exercises\n${formatExercises(insights, exerciseLogs, recentExerciseNames)}`);
  } else {
    const e1rmCompact = Object.entries(insights.e1rm)
      .filter(([name]) => recentExerciseNames.has(name))
      .map(
        ([name, d]) =>
          `${name}: ${d.e1rm}kg${d.plateau ? " PLATEAU" : ""}${d.bestRPE != null ? ` @RPE${d.bestRPE}` : ""}`,
      )
      .join(", ");
    if (e1rmCompact) sections.push(`# e1rm\n${e1rmCompact}`);
  }
}

function buildUpdatesSection(
  options: CoachingAdviceRequest,
  context: AssemblePromptContext,
  sections: string[],
): void {
  const { previousMessages } = options;
  const { todayLogs, isMidWorkout } = context;

  if (previousMessages.length > 0) {
    if (isMidWorkout) {
      const coachMessages = previousMessages.filter((m) => m.role === "coach");
      if (coachMessages.length > 0) {
        const lastCoach = coachMessages[coachMessages.length - 1];
        const cutoff = lastCoach?.timestamp ? new Date(lastCoach.timestamp).getTime() : 0;
        const newLogs = todayLogs.filter((l) => l.loggedAt.getTime() > cutoff);
        if (newLogs.length > 0) sections.push(`# update\n${compactLogs(newLogs)}`);
      }
    }
    const planSummary = buildPriorPlanSummary(previousMessages, todayLogs);
    if (planSummary) sections.push(`# plan\n${planSummary}`);
  }
}

export function assembleCoachingPrompt(
  options: CoachingAdviceRequest,
  context: AssemblePromptContext,
): string {
  const {
    userProfile,
    trainingSummaries,
    events = [],
    question,
    activePlan,
    completedSessionKeys,
  } = options;
  const { session, todayLogs, isFirstMessage, initialWindow, now } = context;

  const sections: string[] = [buildSessionSection(options, context)];

  if (question) sections.push(`# question\n${question}`);

  if (isFirstMessage || question) {
    const freeInput = userProfile.freeUserInput?.trim();
    if (freeInput) sections.push(`# goals\n${freeInput}`);
  }

  buildWorkloadSection(options, context, sections);

  if (todayLogs.length > 0) sections.push(`# today\n${compactLogs(todayLogs)}`);

  buildUpdatesSection(options, context, sections);

  if (activePlan) {
    sections.push(
      `# program\n${formatPlanForPrompt(
        activePlan,
        activePlan.getCurrentWeekNumber(now),
        completedSessionKeys,
      )}`,
    );
  }

  if (isFirstMessage || question) {
    const hist = buildHistorySection(trainingSummaries);
    if (hist) sections.push(hist);
  }

  if (isFirstMessage) {
    const historicalLogs = initialWindow.logs.filter(
      (l) => l.loggedAt.getTime() < getSessionStartBoundary(session),
    );
    if (historicalLogs.length > 0)
      sections.push(`# ${initialWindow.label}\n${compactLogs(historicalLogs)}`);
  }

  if (events.length > 0) {
    sections.push(
      `# events\n${events.map((e: Event) => `${e.type}: ${e.dates.join(", ")}`).join("\n")}`,
    );
  }

  return sections.join("\n\n");
}
