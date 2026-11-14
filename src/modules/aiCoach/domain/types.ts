import type { Event } from "@/modules/events/domain";
import type { UserProfile } from "@/modules/profile/domain";
import type { TrainingInsights } from "@/modules/trainingInsights/domain";
import type { ExerciseLog } from "@/modules/trainingLogs/domain";
import type { TrainingSummary } from "@/modules/trainingSummary/domain";
import type { TrainingPlan } from "./trainingPlan";

/**
 * AI Coach domain types and contracts.
 * Framework-agnostic request/response models for coaching orchestration.
 */

export type CoachingMode = "planning" | "execution";

export interface CoachingAdviceRequest {
  accessToken: string | undefined;
  userProfile: UserProfile;
  insights: TrainingInsights;
  exerciseLogs: ExerciseLog[];
  trainingSummaries: TrainingSummary[];
  previousMessages: CoachingMessage[];
  events?: Event[];
  question?: string;
  mode?: CoachingMode;
  activePlan?: TrainingPlan | null;
  completedSessionKeys?: ReadonlySet<string>;
}

export type CoachingMessage = {
  id: string;
  role: "user" | "coach";
  content: string;
  sessionId: string;
  /** ISO timestamp of when this message was created. Used to find new sets since last coaching advice. */
  timestamp: string;
  logsCount: number;
  logsChecksum?: string;
};

export type CoachingAdviceError =
  | "unauthorized"
  | "rate-limit-exceeded"
  | "generate-content-stream-failed"
  | "coaching-request-failed";

export interface CoachingAdviceResult {
  advice: CoachingAdvice;
  requestPayload: string;
}

export interface ExerciseCleanupResult {
  classifications: Array<{
    exerciseName: string;
    primaryMuscle: string;
    secondaryMuscles?: Array<{ muscleGroup: string; contribution?: number }>;
    confidence: number;
  }>;
}

export interface SuggestedFollowUp {
  label: string;
  prompt: string;
}

/**
 * Sanitizes and validates suggested follow-up prompts from any source (LLM, cache, store).
 * Enforces non-empty strings, trims whitespace, deduplicates by prompt and label,
 * and caps the array to a maximum of 4 suggestions.
 */
export function sanitizeSuggestedFollowUps(items: unknown): SuggestedFollowUp[] | undefined {
  if (!Array.isArray(items)) return undefined;

  const seenPrompts = new Set<string>();
  const seenLabels = new Set<string>();
  const sanitized: SuggestedFollowUp[] = [];

  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const sf = item as { label?: unknown; prompt?: unknown };
    if (typeof sf.label !== "string" || typeof sf.prompt !== "string") continue;

    const label = sf.label.trim();
    const prompt = sf.prompt.trim();
    const promptKey = prompt.toLowerCase();
    const labelKey = label.toLowerCase();

    if (!label || !prompt || seenPrompts.has(promptKey) || seenLabels.has(labelKey)) continue;

    seenPrompts.add(promptKey);
    seenLabels.add(labelKey);
    sanitized.push({ label, prompt });

    if (sanitized.length >= 4) break;
  }

  return sanitized.length > 0 ? sanitized : undefined;
}

export interface CoachingAdvice {
  scratchpad?: string;
  coachMessage: string;
  /** Set to true by AI when fatigue detection signals shouldDeload=true. App auto-starts the deload. */
  startDeload?: boolean;
  suggestedFollowUps?: SuggestedFollowUp[];
  recommendedWorkout?: {
    exerciseName: string;
    targetSets: number;
    targetReps?: string;
    targetDurationSeconds?: number;
    targetDistanceMeters?: number;
    targetWeight?: string;
    targetRpe?: number;
    restSeconds?: number;
    isMetabolicProtocol?: boolean;
    notes?: string;
    supersetId?: string;
    primaryMuscle?: string;
    secondaryMuscles?: Array<{ muscleGroup: string; contribution?: number }>;
  }[];
  trainingPlan?: {
    cycleWeeks: number;
    sessions: PlannedSession[];
  };
}

export interface PlannedSession {
  dayOfWeek: number; // 0=Sun … 6=Sat
  weekNumber: number; // 1 or 2
  sessionLabel: string; // e.g., "Unit A — Push Focus"
  focusDescription: string; // e.g., "Heavy Chest & Quad-Dominant"
  exercises: PlannedExercise[];
}

export interface PlannedExercise {
  exerciseName: string;
  targetSets: number;
  targetReps?: string;
  targetDurationSeconds?: number;
  targetDistanceMeters?: number;
  targetWeight?: string;
  targetRpe?: number;
  restSeconds?: number;
  notes?: string;
  supersetId?: string;
  primaryMuscle?: string;
  secondaryMuscles?: Array<{ muscleGroup: string; contribution?: number }>;
}
