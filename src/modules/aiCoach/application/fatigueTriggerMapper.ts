import type { FatigueTriggerId as DeloadFatigueTriggerId } from "@/modules/deload/domain";
import type { FatigueTriggerId as TrainingFatigueTriggerId } from "@/modules/trainingInsights/domain";

function assertNever(value: never): never {
  throw new Error(`Unsupported fatigue trigger: ${String(value)}`);
}

export function mapTrainingFatigueTriggersToDeload(
  triggers: TrainingFatigueTriggerId[],
): DeloadFatigueTriggerId[] {
  return triggers.map((trigger) => {
    switch (trigger) {
      case "volumeSpike":
      case "tonnageSpike":
      case "performanceDecline":
      case "volumeIncreasing":
        return trigger;
      default:
        return assertNever(trigger);
    }
  });
}
