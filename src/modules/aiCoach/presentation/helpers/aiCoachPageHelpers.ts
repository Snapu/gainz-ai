import DOMPurify from "dompurify";
import { marked } from "marked";
import { isoDateString } from "@/modules/sharedKernel/domain";
import {
  type CoachingAdvice,
  type CoachingAdviceError,
  type CoachingMessage,
  extractUserQuestion,
  type PlannedSession,
  sanitizeSuggestedFollowUps,
  type TrainingPlan,
  upcastLegacyExercise,
} from "../../domain";

export { extractUserQuestion };

// ---------------------------------------------------------------------------
// View-model types
// ---------------------------------------------------------------------------

export interface DisplayExercise {
  exerciseName: string;
  targetSets: number;
  targetReps?: string;
  targetDurationSeconds?: number;
  targetDistanceMeters?: number;
  targetWeight?: string;
  targetRpe?: number;
  notes?: string;
  supersetId?: string;
}

export interface DisplayWorkoutGroup {
  id: string;
  isSuperset: boolean;
  exercises: DisplayExercise[];
}

export interface DisplayInsight {
  id: string;
  timestamp: string;
  isLatest: boolean;
  rawContent: string;
  parsedData: CoachingAdvice | null;
  requestPayload: string | null;
}

// ---------------------------------------------------------------------------
// AI response parsing
// ---------------------------------------------------------------------------

/** Tries to parse raw AI message content as structured CoachingAdvice. Returns null on failure. */
export function tryParseCoachingAdvice(content: string): CoachingAdvice | null {
  try {
    const parsed = JSON.parse(content);
    if (parsed && typeof parsed.coachMessage === "string") {
      const advice = parsed as CoachingAdvice;
      if (Array.isArray(advice.recommendedWorkout)) {
        // TODO(TechDebt): Remove `upcastLegacyExercise` once all legacy AI messages have
        // been cycled out of history (typically ~14 days) and we are confident the AI won't hallucinate.
        advice.recommendedWorkout = advice.recommendedWorkout.map((ex) => upcastLegacyExercise(ex));
      }
      if (advice.suggestedFollowUps !== undefined) {
        advice.suggestedFollowUps = sanitizeSuggestedFollowUps(advice.suggestedFollowUps);
      }
      return advice;
    }
    return null;
  } catch {
    return null;
  }
}

export function getAiErrorDescription(error: CoachingAdviceError | string): string {
  if (error === "rate-limit-exceeded") {
    return "Daily AI coaching limit reached. Quota resets at 00:00 UTC.";
  }
  if (error === "unauthorized") {
    return "Your session expired. Please sign in again.";
  }
  return "Failed to get AI response. Please try again.";
}

function isStaleAutomatedWorkout(
  workout: DisplayExercise[],
  prevMsg: CoachingMessage | undefined,
  plan: TrainingPlan | null | undefined,
  completedSessions: ReadonlySet<string>,
  targetSession: PlannedSession | undefined,
): boolean {
  const isAutomated = prevMsg?.role === "user" && extractUserQuestion(prevMsg.content) === null;
  if (!isAutomated || !plan) return false;
  return plan.isWorkoutFromCompletedSession(workout, completedSessions, targetSession);
}

interface TodayCoachWorkoutEntry {
  msg: CoachingMessage;
  prevMsg?: CoachingMessage;
  workout: DisplayExercise[];
  isStale: boolean;
}

function* iterateTodayCoachWorkouts(options: {
  messages: readonly CoachingMessage[];
  todayIso: string;
  plan?: TrainingPlan | null;
  completedSessions: ReadonlySet<string>;
  targetSession?: PlannedSession;
}): Generator<TodayCoachWorkoutEntry> {
  const { messages, todayIso, plan, completedSessions, targetSession } = options;

  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg?.role !== "coach") continue;
    if (isoDateString(new Date(msg.timestamp)) !== todayIso) break;

    const workout = tryParseCoachingAdvice(msg.content)?.recommendedWorkout as
      | DisplayExercise[]
      | undefined;
    if (!Array.isArray(workout)) continue;

    const prevMsg = messages[i - 1];
    const isStale = isStaleAutomatedWorkout(
      workout,
      prevMsg,
      plan,
      completedSessions,
      targetSession,
    );
    yield { msg, prevMsg, workout, isStale };
  }
}

/**
 * Returns the IDs of any automated user/coach message pairs from today whose prescribed
 * workout belongs to an already-completed session rather than the current target session.
 */
export function findStaleTodayMessageIds(options: {
  messages: readonly CoachingMessage[];
  todayIso: string;
  plan?: TrainingPlan | null;
  completedSessions: ReadonlySet<string>;
  targetSession?: PlannedSession;
}): string[] {
  const staleIds: string[] = [];

  for (const { msg, prevMsg, isStale } of iterateTodayCoachWorkouts(options)) {
    if (isStale) {
      staleIds.push(msg.id);
      if (prevMsg?.role === "user") {
        staleIds.push(prevMsg.id);
      }
    }
  }

  return staleIds;
}

/**
 * Extracts today's latest valid coach-prescribed workout from the message history,
 * skipping automated responses that prescribed an already-completed session.
 */
export function resolveTodaysCoachWorkout(options: {
  messages: readonly CoachingMessage[];
  todayIso: string;
  plan?: TrainingPlan | null;
  completedSessions: ReadonlySet<string>;
  targetSession?: PlannedSession;
}): DisplayExercise[] | undefined {
  for (const { workout, isStale } of iterateTodayCoachWorkouts(options)) {
    if (!isStale) {
      return workout;
    }
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Workout grouping
// ---------------------------------------------------------------------------

/** Groups a flat workout exercise list into superset groups and standalone exercises. */
export function groupWorkout(workout: DisplayExercise[] | undefined): DisplayWorkoutGroup[] | null {
  if (!workout || workout.length === 0) return null;

  const groups: DisplayWorkoutGroup[] = [];
  workout.forEach((ex) => {
    if (ex.supersetId) {
      const existing = groups.find((g) => g.isSuperset && g.id === ex.supersetId);
      if (existing) {
        existing.exercises.push(ex);
      } else {
        groups.push({ id: ex.supersetId, isSuperset: true, exercises: [ex] });
      }
    } else {
      groups.push({ id: crypto.randomUUID(), isSuperset: false, exercises: [ex] });
    }
  });
  return groups;
}

// ---------------------------------------------------------------------------
// Weight / rep string parsing
// ---------------------------------------------------------------------------

/** Extracts numeric weight in kg from strings like "80kg", "80.5 kg", "80,5kg". */
export function parseWeight(targetWeight?: string): number | undefined {
  if (!targetWeight) return undefined;
  const match = targetWeight.match(/(\d+(?:[.,]\d+)?)\s*kg/i);
  return match?.[1] ? parseFloat(match[1].replace(",", ".")) : undefined;
}

/**
 * Extracts the upper bound of a rep range from strings like "8-12" → 12, "10" → 10.
 * Uses the upper bound so the prefill starts at the target ceiling.
 */
export function parseFirstRep(targetReps?: string): number | undefined {
  if (!targetReps) return undefined;
  const rangeMatch = targetReps.match(/(\d+)\s*-\s*(\d+)/);
  if (rangeMatch?.[2]) return parseInt(rangeMatch[2], 10);
  const singleMatch = targetReps.match(/(\d+)/);
  return singleMatch?.[1] ? parseInt(singleMatch[1], 10) : undefined;
}

/** Splits a weight string like "80.5kg" into `{ value: "80.5", unit: "kg" }`. Also handles "bodyweight" elegantly. */
export function splitWeight(weightStr?: string): { value: string; unit: string } {
  if (!weightStr) return { value: "", unit: "" };

  const lower = weightStr.toLowerCase().trim();

  if (lower === "bodyweight" || lower === "bw") {
    return { value: "BW", unit: "" };
  }

  const bwPlusMatch = lower.match(/^(?:bodyweight|bw)\s*\+\s*(\d+[.,]?\d*)\s*(.*)$/);
  if (bwPlusMatch) {
    return { value: `BW + ${bwPlusMatch[1]}`, unit: bwPlusMatch[2] || "kg" };
  }

  const match = weightStr.match(/^(\d+[.,]?\d*)\s*(.*)$/);
  if (match) {
    return { value: match[1], unit: match[2] || "kg" };
  }
  return { value: weightStr, unit: "" };
}

/** LEGACY: Determines if a reps string represents a duration. Used for backward compatibility with older plans. */
export function isDuration(reps?: string): boolean {
  if (!reps) return false;
  const lower = reps.toLowerCase();
  return (
    lower.includes("sec") ||
    lower.includes("min") ||
    lower.includes("hr") ||
    lower.includes("time") ||
    lower.includes("hold") ||
    /^[\d\s.,-]+s$/.test(lower)
  );
}

/** LEGACY: Splits a reps string like "30 secs" into `{ value: "30", unit: "secs" }`. Returns single value for simple ranges. */
export function splitReps(reps?: string): { value: string; unit: string } {
  if (!reps) return { value: "", unit: "" };

  // Match leading numbers, dots, commas, hyphens and spaces
  const match = reps.match(/^([\d\s.,-]+)(.*)$/);
  if (match && match[1].trim() !== "") {
    return { value: match[1].trim(), unit: match[2].trim() };
  }

  return { value: reps, unit: "" };
}

// ---------------------------------------------------------------------------
// Markdown rendering
// ---------------------------------------------------------------------------

/** Renders markdown (bold, italic, lists, newlines, etc.) to safe HTML via marked and DOMPurify. */
export function renderMarkdown(text: string): string {
  if (!text) return "";
  const rawHtml = marked.parse(text, {
    breaks: true,
    gfm: true,
    async: false,
  }) as string;
  return DOMPurify.sanitize(rawHtml, {
    ALLOWED_TAGS: ["p", "strong", "em", "br", "ul", "ol", "li", "code", "blockquote"],
  });
}

// ---------------------------------------------------------------------------
// Exercise card helpers
// ---------------------------------------------------------------------------

/** Returns the Tailwind classes for an exercise card title depending on completion state. */
export function titleClass(isCompleted: boolean): string[] {
  return [
    isCompleted
      ? "text-sm font-semibold text-muted-foreground truncate"
      : "text-base font-bold tracking-tight break-words leading-tight",
  ];
}

/** Returns an array of the given length to drive a segmented progress bar. */
export function setSegments(targetSets: number): unknown[] {
  return Array.from({ length: Math.max(1, targetSets) });
}

/**
 * Returns supersetId if there are 2 or more exercises sharing this id in the list,
 * preventing lonely/orphan single-exercise superset lines.
 */
export function getValidSupersetId(
  exercise: { supersetId?: string } | undefined,
  allExercises: Array<{ supersetId?: string }>,
): string | undefined {
  if (!exercise?.supersetId) return undefined;
  const count = allExercises.filter((e) => e.supersetId === exercise.supersetId).length;
  return count > 1 ? exercise.supersetId : undefined;
}

/**
 * Returns whether a session card should show a separate "Week X" badge,
 * avoiding duplicate labels like "Woche 1 - Einheit 1: Push Fokus" + "WEEK 1".
 */
export function shouldShowWeekBadge(sessionLabel?: string | null): boolean {
  if (!sessionLabel) return true;
  return !/\b(?:week|woche|w\d+)\b/i.test(sessionLabel);
}

/**
 * Returns the CSS position classes for the superset indicator vertical line.
 */
export function supersetConnectorClass(
  index: number,
  exercises: Array<{ supersetId?: string }>,
): string {
  const current = getValidSupersetId(exercises[index], exercises);
  if (!current) return "";
  const prev = getValidSupersetId(exercises[index - 1], exercises);
  const next = getValidSupersetId(exercises[index + 1], exercises);

  if (prev !== current && next === current) {
    return "top-2 bottom-0 rounded-t-full";
  }
  if (prev === current && next !== current) {
    return "top-0 bottom-2 rounded-b-full";
  }
  return "top-0 bottom-0";
}

/**
 * Returns whether the superset badge should be displayed on this exercise (first exercise of the pair/group).
 */
export function isSupersetStart(index: number, exercises: Array<{ supersetId?: string }>): boolean {
  const current = getValidSupersetId(exercises[index], exercises);
  if (!current) return false;
  const prev = getValidSupersetId(exercises[index - 1], exercises);
  return prev !== current;
}
