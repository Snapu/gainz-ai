import { describe, expect, it } from "vitest";
import { mapTrainingFatigueTriggersToDeload } from "./fatigueTriggerMapper";

describe("mapTrainingFatigueTriggersToDeload", () => {
  it("maps all known training fatigue triggers to deload triggers", () => {
    const result = mapTrainingFatigueTriggersToDeload([
      "volumeSpike",
      "tonnageSpike",
      "performanceDecline",
      "volumeIncreasing",
    ]);

    expect(result).toEqual([
      "volumeSpike",
      "tonnageSpike",
      "performanceDecline",
      "volumeIncreasing",
    ]);
  });

  it("keeps ordering stable", () => {
    const result = mapTrainingFatigueTriggersToDeload(["performanceDecline", "volumeSpike"]);

    expect(result).toEqual(["performanceDecline", "volumeSpike"]);
  });
});
