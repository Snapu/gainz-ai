import type { TrainingPlan } from "./trainingPlan";
import type { CoachingMode } from "./types";

export interface CoachingIntent {
  effectiveMode: CoachingMode;
  /** The plan to expose to the model as `# program`. Undefined when a fresh plan is generated. */
  activePlanForPrompt: TrainingPlan | undefined;
}

/**
 * Determines whether a coaching request must run in full mesocycle "planning" mode.
 * Enforces domain rule: if no active plan exists, or the caller explicitly requests
 * a full plan regeneration (`requestedMode === "planning"`), the AI must generate
 * a complete TrainingPlan alongside today's workout.
 * Conversational plan edits when an active plan already exists stay in `"execution"`
 * mode, letting the LLM decide whether to populate the optional `trainingPlan`.
 */
export function resolveEffectiveCoachingMode(options: {
  requestedMode?: CoachingMode;
  hasActivePlan: boolean;
}): CoachingMode {
  if (options.requestedMode === "planning" || !options.hasActivePlan) {
    return "planning";
  }
  return "execution";
}

/**
 * Resolves the effective coaching mode together with the plan context for the prompt.
 * - Planning omits the active plan so a fresh cycle is built.
 * - Execution includes it so the AI can follow or adjust the existing program.
 */
export function resolveCoachingIntent(options: {
  requestedMode?: CoachingMode;
  activePlan?: TrainingPlan | null;
}): CoachingIntent {
  const effectiveMode = resolveEffectiveCoachingMode({
    requestedMode: options.requestedMode,
    hasActivePlan: Boolean(options.activePlan && options.activePlan.sessions.length > 0),
  });

  const activePlanForPrompt =
    effectiveMode === "planning" ? undefined : (options.activePlan ?? undefined);

  return { effectiveMode, activePlanForPrompt };
}
