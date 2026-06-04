import type { DeloadStatus } from "@/modules/trainingInsights/domain";
import { clampRestSeconds, classifyExercise } from "@/modules/trainingInsights/domain";
import type { WorkoutPhase } from "@/modules/trainingLogs/application";
import type { AiResponseData } from "../domain/types";

/**
 * Enforces domain invariants on the raw AI response.
 * Pure function separated from the external I/O adapter.
 */
export function postProcessAiResponse(
  parsedAiResponse: AiResponseData,
  phase: WorkoutPhase,
  deloadStatus: DeloadStatus,
): AiResponseData {
  // We clone the object to avoid mutating the original
  const cleaned: AiResponseData = { ...parsedAiResponse };

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

      return updatedEx;
    });

    // Sorting has been removed as per user request to keep the natural ordering from the AI
  }

  if (cleaned.trainingPlan?.sessions) {
    cleaned.trainingPlan.sessions = cleaned.trainingPlan.sessions.map((session) => ({
      ...session,
      exercises: session.exercises.map((ex) => ({
        ...ex,
        restSeconds: ex.targetReps
          ? clampRestSeconds(ex.targetReps, ex.restSeconds)
          : ex.restSeconds,
      })),
    }));
  }

  return cleaned;
}
