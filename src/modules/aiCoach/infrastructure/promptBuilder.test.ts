import { describe, expect, it } from "vitest";
import type { ExerciseE1RM } from "@/modules/trainingInsights/domain/e1rm";
import { formatExercises } from "./promptBuilder";

describe("formatExercises", () => {
  it("appends rpe_trigger:overload_ready when rpeOverloadReady is true", () => {
    const e1rmData: Record<string, ExerciseE1RM> = {
      "Bench Press": {
        e1rm: 100,
        trend: [100, 100, 100],
        trendDates: [new Date("2024-01-01"), new Date("2024-01-08"), new Date("2024-01-16")],
        plateau: false,
        bestRPE: 7,
        rpeOverloadReady: true,
        unit: "kg",
        targetWeightHyp: null,
        targetWeightStr: null,
        swapRecommended: false,
      },
    };

    const output = formatExercises({ e1rm: e1rmData } as any, [], undefined);
    expect(output).toContain("rpe_trigger:overload_ready");
  });

  it("appends rpe:<bestRPE> when rpeOverloadReady is false but bestRPE is present", () => {
    const e1rmData: Record<string, ExerciseE1RM> = {
      Squat: {
        e1rm: 150,
        trend: [150],
        trendDates: [new Date("2024-01-01")],
        plateau: false,
        bestRPE: 9,
        rpeOverloadReady: false,
        unit: "kg",
        targetWeightHyp: null,
        targetWeightStr: null,
        swapRecommended: false,
      },
    };

    const output = formatExercises({ e1rm: e1rmData } as any, [], undefined);
    expect(output).toContain("rpe:9");
  });
});
