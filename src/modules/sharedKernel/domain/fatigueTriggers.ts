export const FATIGUE_TRIGGER_IDS = [
  "volumeSpike",
  "tonnageSpike",
  "performanceDecline",
  "volumeIncreasing",
] as const;

export type FatigueTriggerId = (typeof FATIGUE_TRIGGER_IDS)[number];

export function isFatigueTriggerId(value: string): value is FatigueTriggerId {
  return (FATIGUE_TRIGGER_IDS as readonly string[]).includes(value);
}
