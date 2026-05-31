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
      if (updatedEx.targetReps) {
        updatedEx.restSeconds = clampRestSeconds(updatedEx.targetReps, updatedEx.restSeconds);
      }

      return updatedEx;
    });

    // 4. Stable sort: Compounds before Isolations
    // Reference: Simão et al. (2012). Exercise order in resistance training. Sports Medicine.
    // Multi-joint exercises should be performed before single-joint exercises to maximize
    // total volume and strength gains in larger muscle groups.
    // We group supersets together by giving all exercises in a superset
    // the score of the most "compound" exercise in that superset.
    const supersetScores = new Map<string, number>();
    cleaned.recommendedWorkout.forEach((ex) => {
      const cat = classifyExercise(ex.exerciseName);
      const score = cat === "isolation" ? 1 : 0;
      if (ex.supersetId) {
        const current = supersetScores.get(ex.supersetId) ?? 1;
        supersetScores.set(ex.supersetId, Math.min(current, score));
      }
    });

    cleaned.recommendedWorkout.sort((a, b) => {
      // Keep supersets together in their original relative order
      if (a.supersetId && a.supersetId === b.supersetId) return 0;

      const scoreA = a.supersetId
        ? supersetScores.get(a.supersetId)!
        : classifyExercise(a.exerciseName) === "isolation"
          ? 1
          : 0;

      const scoreB = b.supersetId
        ? supersetScores.get(b.supersetId)!
        : classifyExercise(b.exerciseName) === "isolation"
          ? 1
          : 0;

      return scoreA - scoreB;
    });
  }

  return cleaned;
}
