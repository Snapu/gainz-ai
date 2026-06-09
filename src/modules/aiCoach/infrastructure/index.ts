import type { AiCoachService } from "@/modules/aiCoach/application";
import { classifyExercises } from "./classifyExercises";
import { getTodayLogsCount, requestCoachingAdvice } from "./requestCoachingAdvice";

export * from "./LocalStoragePlanRepository";

export function createAiCoachService(): AiCoachService {
  return {
    ask: requestCoachingAdvice,
    classifyExercises,
    getTodayLogsCount,
  };
}
