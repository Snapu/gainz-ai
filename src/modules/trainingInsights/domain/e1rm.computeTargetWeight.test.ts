import { describe, expect, it } from "vitest";
import { computeTargetWeight } from "./e1rm";

describe("computeTargetWeight", () => {
  it("returns 0 if e1rm is <= 0", () => {
    expect(computeTargetWeight(0, 10)).toBe(0);
    expect(computeTargetWeight(-10, 5)).toBe(0);
  });

  it("calculates correct weight for varying rep counts using inverse Epley", () => {
    // e1rm = weight * (1 + reps/30) => weight = e1rm / (1 + reps/30)
    // 100 e1RM, 10 reps -> 100 / (1 + 10/30) = 100 / 1.3333 = 75
    expect(computeTargetWeight(100, 10)).toBe(75);

    // 100 e1RM, 5 reps -> 100 / (1 + 5/30) = 100 / 1.1666 = 85.7 -> rounded to nearest 2.5 is 85
    expect(computeTargetWeight(100, 5)).toBe(85); // 85.71 rounds to 85

    // 100 e1RM, 1 rep -> 100 / (1 + 1/30) = 100 / 1.0333 = 96.77 -> rounded to nearest 2.5 is 97.5
    expect(computeTargetWeight(100, 1)).toBe(97.5);
  });

  it("rounds to nearest 2.5kg plate increment", () => {
    // exact multiples of 2.5
    expect(computeTargetWeight(120, 6)).toBe(100); // 120 / 1.2 = 100

    // cases that round up
    expect(computeTargetWeight(105, 5)).toBe(90); // 105 / 1.1666 = 90
  });
});
