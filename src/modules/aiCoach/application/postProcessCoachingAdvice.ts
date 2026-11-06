import type { DeloadStatus } from "@/modules/trainingInsights/domain";
import { clampRestSeconds } from "@/modules/trainingInsights/domain";
import type { WorkoutPhase } from "@/modules/trainingLogs/application";
import { TrainingPlan } from "../domain/trainingPlan";
import type { CoachingAdvice } from "../domain/types";
import { upcastLegacyExercise } from "../domain/upcaster";

/**
 * Enforces domain invariants on the raw AI response.
 * Pure function separated from the external I/O adapter.
 */
export function adviceStartsDeload(advice: CoachingAdvice | null | undefined): boolean {
  if (!advice) return false;
  return advice.startDeload === true;
}

function normalizeExerciseParameters<
  T extends {
    exerciseName: string;
    targetSets: number;
    targetReps?: string;
    targetDurationSeconds?: number;
    targetDistanceMeters?: number;
    targetRpe?: number;
    restSeconds?: number;
    isMetabolicProtocol?: boolean;
  },
>(rawEx: T, deloadStatus: DeloadStatus): T {
  const ex = upcastLegacyExercise({ ...rawEx });

  let targetRpe = ex.targetRpe;
  if (targetRpe != null) {
    targetRpe = Math.max(6, Math.min(10, Math.round(targetRpe * 2) / 2));
  } else if (ex.targetReps && !ex.targetDurationSeconds && !ex.targetDistanceMeters) {
    targetRpe = deloadStatus === "active" ? 6.5 : 8.5;
  }

  let restSeconds = ex.restSeconds;
  if (ex.targetReps && !ex.isMetabolicProtocol) {
    restSeconds = clampRestSeconds(ex.targetReps, restSeconds);
  }

  return {
    ...ex,
    targetRpe,
    restSeconds,
  };
}

function backfillRecommendedWorkout(
  rawPlan: NonNullable<CoachingAdvice["trainingPlan"]>,
  completedSessionKeys: ReadonlySet<string>,
  activePlan?: TrainingPlan | null,
) {
  if (rawPlan.sessions.length === 0) return undefined;
  const planEntity = TrainingPlan.create(
    new Date().toISOString(),
    rawPlan.cycleWeeks,
    rawPlan.sessions,
  );
  const effectiveCompletedKeys =
    activePlan && planEntity.isStructuralReplacementFor(activePlan)
      ? new Set<string>()
      : completedSessionKeys;
  const matchingSession =
    planEntity.getNextUncompletedSession(effectiveCompletedKeys) ?? planEntity.sessions[0];
  if (!matchingSession || matchingSession.exercises.length === 0) return undefined;
  return matchingSession.exercises.map((ex) => ({ ...ex }));
}

export function postProcessCoachingAdvice(
  parsedCoachingAdvice: CoachingAdvice,
  phase: WorkoutPhase,
  deloadStatus: DeloadStatus,
  completedSessionKeys: ReadonlySet<string> = new Set(),
  activePlan?: TrainingPlan | null,
): CoachingAdvice {
  // Deep clone to guarantee input immutability
  const cleaned: CoachingAdvice = structuredClone(parsedCoachingAdvice);

  // 1. Phase orchestration: user is done, no new workout needed
  if (phase === "post-workout") {
    delete cleaned.recommendedWorkout;
  }

  // 2. Deload orchestration: prevent re-triggering if already active
  if (deloadStatus === "active") {
    delete cleaned.startDeload;
  }

  if (Array.isArray(cleaned.recommendedWorkout)) {
    cleaned.recommendedWorkout = cleaned.recommendedWorkout
      .filter((ex): ex is NonNullable<typeof ex> => typeof ex === "object" && ex !== null)
      .map((ex) => normalizeExerciseParameters(ex, deloadStatus));
  }

  if (cleaned.trainingPlan?.sessions) {
    cleaned.trainingPlan.sessions = cleaned.trainingPlan.sessions.map((session) => ({
      ...session,
      exercises: session.exercises.map((ex) => normalizeExerciseParameters(ex, deloadStatus)),
    }));

    // Backfill today's workout from the next uncompleted session ONLY if recommendedWorkout was omitted
    // during pre-workout planning (preserves an explicit empty array `[]` when the coach prescribes a rest day).
    if (phase === "planning" && cleaned.recommendedWorkout === undefined) {
      cleaned.recommendedWorkout = backfillRecommendedWorkout(
        cleaned.trainingPlan,
        completedSessionKeys,
        activePlan,
      );
    }
  }

  return cleaned;
}
