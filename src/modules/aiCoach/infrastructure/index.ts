import type { AiCoachService } from "@/modules/aiCoach/application";
import { askAi, getTodayLogsCount } from "./askAi";
import { classifyExercises } from "./classifyExercises";

export * from "./planStorage";

export function createAiCoachService(): AiCoachService {
  return {
    ask: askAi,
    classifyExercises,
    getTodayLogsCount,
  };
}
