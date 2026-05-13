import type { FatigueTriggerId } from "@/modules/sharedKernel/domain";

function assertNever(value: never): never {
  throw new Error(`Unsupported fatigue trigger: ${String(value)}`);
}

export function mapTrainingFatigueTriggersToDeload(
  triggers: FatigueTriggerId[],
): FatigueTriggerId[] {
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
