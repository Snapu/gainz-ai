import type { DeloadStatus } from "@/modules/trainingInsights/domain";
import { clampRestSeconds } from "@/modules/trainingInsights/domain";
import type { WorkoutPhase } from "@/modules/trainingLogs/application";
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

export function postProcessCoachingAdvice(
  parsedCoachingAdvice: CoachingAdvice,
  phase: WorkoutPhase,
  deloadStatus: DeloadStatus,
): CoachingAdvice {
  // We clone the object to avoid mutating the original
  const cleaned: CoachingAdvice = { ...parsedCoachingAdvice };

  // 1. Phase orchestration: user is done, no new workout needed
  if (phase === "post-workout") {
    delete cleaned.recommendedWorkout;
  }

  // 2. Deload orchestration: prevent re-triggering if already active
  if (deloadStatus === "active") {
    delete cleaned.startDeload;
  }

  if (Array.isArray(cleaned.recommendedWorkout)) {
    // We map over the array to clone and modify each exercise
    cleaned.recommendedWorkout = cleaned.recommendedWorkout.map((ex) => {
      if (typeof ex !== "object" || !ex) return ex;

      const updatedEx = { ...ex };

      // 3. Rest period clamping based on training science
      if (updatedEx.targetReps && !updatedEx.isMetabolicProtocol) {
        updatedEx.restSeconds = clampRestSeconds(updatedEx.targetReps, updatedEx.restSeconds);
      }

      // 4. ACL Defense: Guard against AI returning old format despite prompt instructions
      // TODO(TechDebt): Remove `upcastLegacyExercise` once we are confident the AI will
      // never hallucinate string-based durations like `targetReps: "30s"`.
      return upcastLegacyExercise(updatedEx);
    });

    // Sorting has been removed as per user request to keep the natural ordering from the AI
  }

  if (cleaned.trainingPlan?.sessions) {
    cleaned.trainingPlan.sessions = cleaned.trainingPlan.sessions.map((session) => ({
      ...session,
      exercises: session.exercises.map((ex) => {
        // TODO(TechDebt): Remove `upcastLegacyExercise`
        const upcasted = upcastLegacyExercise(ex);
        return {
          ...upcasted,
          restSeconds: upcasted.targetReps
            ? clampRestSeconds(upcasted.targetReps, upcasted.restSeconds)
            : upcasted.restSeconds,
        };
      }),
    }));
  }

  return cleaned;
}
