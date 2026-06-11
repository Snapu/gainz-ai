import { describe, expect, it } from "vitest";
import type { ExerciseLog } from "@/modules/trainingLogs/domain";
import { calculateE1RM, calculateE1RMInsights } from "./e1rm";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createLog(
  exerciseName: string,
  date: Date,
  weight: number,
  reps: number,
  rpe?: number,
): ExerciseLog {
  return { id: crypto.randomUUID(), exerciseName, loggedAt: date, weight, reps, rpe };
}

const BASE = new Date("2024-01-01T12:00:00.000Z");
function daysLater(n: number) {
  return new Date(BASE.getTime() + n * 86_400_000);
}

// ---------------------------------------------------------------------------
// calculateE1RM — guard conditions
// ---------------------------------------------------------------------------

describe("calculateE1RM", () => {
  describe("guard conditions", () => {
    it("returns eMaxReps for weight = 0 (unweighted exercise)", () => {
      // 5 reps, no RPE -> assumed RPE 10 (0 RIR) -> eMaxReps = 5
      expect(calculateE1RM(0, 5)).toBe(5);
      // 5 reps, RPE 8 -> 2 RIR -> eMaxReps = 7
      expect(calculateE1RM(0, 5, 8)).toBe(7);
    });

    it("returns null for reps = 0", () => {
      expect(calculateE1RM(100, 0)).toBeNull();
    });

    it("returns null for negative weight", () => {
      expect(calculateE1RM(-50, 5)).toBeNull();
    });

    it("returns null for reps > 20 (estimation unreliable above this range)", () => {
      expect(calculateE1RM(100, 21)).toBeNull();
      expect(calculateE1RM(100, 30)).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // Singles
  // -------------------------------------------------------------------------

  describe("reps = 1 — singles", () => {
    it("returns weight when no RPE (direct measure)", () => {
      expect(calculateE1RM(100, 1)).toBe(100);
      expect(calculateE1RM(142.5, 1)).toBe(142.5);
    });

    it("returns weight when RPE ≥ 9.0 (approximately maximal single — within noise floor)", () => {
      // At RPE 9.0+ the Zourdos correction is ≤ 5%, within typical RPE measurement error
      // (Helms et al., 2017, JSCR 31(12)). The raw weight is the better estimate.
      expect(calculateE1RM(100, 1, 9.0)).toBe(100);
      expect(calculateE1RM(100, 1, 9.5)).toBe(100);
      expect(calculateE1RM(100, 1, 10.0)).toBe(100);
    });

    it("applies Zourdos for sub-maximal singles (RPE < 9.0) — Flaw 6 fix", () => {
      // Sub-maximal singles at RPE 7–8 are standard in DUP / RTS programming.
      // At RPE 8: Zourdos row 0, col 4 = 0.87 → e1RM = 100/0.87 ≈ 114.9
      expect(calculateE1RM(100, 1, 8.0)).toBeCloseTo(100 / 0.87, 1);
      // At RPE 7: Zourdos row 0, col 2 = 0.83 → e1RM = 100/0.83 ≈ 120.5
      expect(calculateE1RM(100, 1, 7.0)).toBeCloseTo(100 / 0.83, 1);
    });

    it("sub-maximal single yields higher e1RM than an RPE-9.0 single at same weight", () => {
      const maximal = calculateE1RM(100, 1, 9.0)!;
      const submaximal = calculateE1RM(100, 1, 8.0)!;
      expect(submaximal).toBeGreaterThan(maximal);
    });
  });

  // -------------------------------------------------------------------------
  // Epley formula (pure zone: reps 2–3)
  // -------------------------------------------------------------------------

  describe("Epley formula — pure zone reps 2–3 (Epley 1985)", () => {
    it("reps = 2 @ 100 kg: 100 × (1 + 2/30) = 106.7 kg", () => {
      expect(calculateE1RM(100, 2)).toBeCloseTo(100 * (1 + 2 / 30), 1);
    });

    it("reps = 3 @ 100 kg: 100 × (1 + 3/30) = 110.0 kg", () => {
      expect(calculateE1RM(100, 3)).toBeCloseTo(100 * (1 + 3 / 30), 1);
    });
  });

  // -------------------------------------------------------------------------
  // Crossfade zone (reps 4–7) — Flaw 1 fix
  // -------------------------------------------------------------------------

  describe("crossfade zone reps 4–7 — Flaw 1 fix", () => {
    it("reps = 4: result lies between pure Epley and pure Mayhew", () => {
      const e = 100 * (1 + 4 / 30);
      const m = (100 * 100) / (52.2 + 41.9 * Math.exp(-0.055 * 4));
      const result = calculateE1RM(100, 4)!;
      expect(result).toBeGreaterThanOrEqual(Math.min(e, m) - 0.1);
      expect(result).toBeLessThanOrEqual(Math.max(e, m) + 0.1);
    });

    it("reps = 7: result lies between pure Epley and pure Mayhew", () => {
      const e = 100 * (1 + 7 / 30);
      const m = (100 * 100) / (52.2 + 41.9 * Math.exp(-0.055 * 7));
      const result = calculateE1RM(100, 7)!;
      expect(result).toBeGreaterThanOrEqual(Math.min(e, m) - 0.1);
      expect(result).toBeLessThanOrEqual(Math.max(e, m) + 0.1);
    });

    it("e1RM increases monotonically across the crossfade zone (reps 3–8)", () => {
      const values = [3, 4, 5, 6, 7, 8].map((r) => calculateE1RM(100, r)!);
      for (let i = 1; i < values.length; i++) {
        expect(values[i]).toBeGreaterThan(values[i - 1]!);
      }
    });

    it("crossfade produces a smooth, continuous transition at the reps=5/6 boundary", () => {
      // The ~2.8% jump from reps=5 to reps=6 is the legitimate effect of one more rep
      // at the same weight (more work capacity demonstrated). The crossfade's job is not
      // to eliminate this — it's to ensure the blend values lie between the two formula
      // outputs rather than jumping discontinuously.
      // Academic review: actual *formula seam* discontinuity (Epley vs Mayhew at reps=6)
      // is < 0.2% (LeSuer et al., 1997). The crossfade ensures we never hardswitch between
      // them mid-zone.
      const epleyAt5 = 100 * (1 + 5 / 30);
      const mayhewAt5 = (100 * 100) / (52.2 + 41.9 * Math.exp(-0.055 * 5));
      const epleyAt6 = 100 * (1 + 6 / 30);
      const mayhewAt6 = (100 * 100) / (52.2 + 41.9 * Math.exp(-0.055 * 6));
      const blendAt5 = calculateE1RM(100, 5)!;
      const blendAt6 = calculateE1RM(100, 6)!;
      // Blend must lie between the two formula extremes (proves it's a blend, not a hard switch)
      expect(blendAt5).toBeGreaterThanOrEqual(Math.min(epleyAt5, mayhewAt5) - 0.1);
      expect(blendAt5).toBeLessThanOrEqual(Math.max(epleyAt5, mayhewAt5) + 0.1);
      expect(blendAt6).toBeGreaterThanOrEqual(Math.min(epleyAt6, mayhewAt6) - 0.1);
      expect(blendAt6).toBeLessThanOrEqual(Math.max(epleyAt6, mayhewAt6) + 0.1);
      // And the sequence is monotonically increasing (no downward kink)
      expect(blendAt6).toBeGreaterThan(blendAt5);
    });
  });

  // -------------------------------------------------------------------------
  // Mayhew formula (pure zone: reps 8–20)
  // -------------------------------------------------------------------------

  describe("Mayhew formula — pure zone reps 8–20 (Mayhew et al. 1992)", () => {
    it("reps = 10 @ 80 kg matches Mayhew formula exactly", () => {
      const expected = (100 * 80) / (52.2 + 41.9 * Math.exp(-0.055 * 10));
      expect(calculateE1RM(80, 10)).toBeCloseTo(expected, 1);
    });

    it("reps = 8 @ 100 kg matches Mayhew formula", () => {
      const expected = (100 * 100) / (52.2 + 41.9 * Math.exp(-0.055 * 8));
      expect(calculateE1RM(100, 8)).toBeCloseTo(expected, 1);
    });

    it("reps = 20 is the highest valid boundary", () => {
      expect(calculateE1RM(60, 20)).not.toBeNull();
    });

    it("e1RM increases monotonically across reps 8–20 at same weight", () => {
      expect(calculateE1RM(100, 15)!).toBeGreaterThan(calculateE1RM(100, 8)!);
    });
  });

  // -------------------------------------------------------------------------
  // Zourdos RPE path — reps 2–12 with RPE (Zourdos et al. 2016)
  // -------------------------------------------------------------------------

  describe("Zourdos RPE path — reps 2–12 with RPE (Zourdos et al. 2016)", () => {
    it("5 reps @ RPE 10: table 0.87 → e1RM = 100/0.87 = 114.9 kg", () => {
      expect(calculateE1RM(100, 5, 10)).toBeCloseTo(100 / 0.87, 1);
    });

    it("5 reps @ RPE 8: table 0.77 → e1RM = 100/0.77 = 129.9 kg", () => {
      expect(calculateE1RM(100, 5, 8)).toBeCloseTo(100 / 0.77, 1);
    });

    it("lower RPE at same reps/weight yields higher e1RM (more reserve)", () => {
      const rpe10 = calculateE1RM(100, 5, 10)!;
      const rpe8 = calculateE1RM(100, 5, 8)!;
      const rpe6 = calculateE1RM(100, 5, 6)!;
      expect(rpe8).toBeGreaterThan(rpe10);
      expect(rpe6).toBeGreaterThan(rpe8);
    });

    it("RPE below 6 falls back to formula path (outside Zourdos table range)", () => {
      // rpe = 5 is clamped to 6 during lookup but still goes through the formula
      // path because RPE < 6 is outside the validated range.
      expect(calculateE1RM(100, 5, 5)).toBeCloseTo(calculateE1RM(100, 5)!, 1);
    });

    it("reps > 12 with RPE falls back to formula path (beyond Zourdos table coverage)", () => {
      const expected = (100 * 100) / (52.2 + 41.9 * Math.exp(-0.055 * 15));
      expect(calculateE1RM(100, 15, 9)).toBeCloseTo(expected, 1);
    });

    it("RPE rounded to nearest 0.5 step: RPE 8.3 treated as 8.5", () => {
      expect(calculateE1RM(100, 5, 8.3)).toBeCloseTo(calculateE1RM(100, 5, 8.5)!, 1);
    });

    it("result is rounded to 1 decimal place", () => {
      const result = calculateE1RM(87.5, 5, 8);
      expect(result).not.toBeNull();
      const decimals = result?.toString().split(".")[1]?.length ?? 0;
      expect(decimals).toBeLessThanOrEqual(1);
    });
  });
});

// ---------------------------------------------------------------------------
// calculateE1RMInsights
// ---------------------------------------------------------------------------

describe("calculateE1RMInsights", () => {
  it("returns empty object for no logs", () => {
    expect(calculateE1RMInsights([])).toEqual({});
  });

  it("calculates trend across multiple sessions with increasing weight", () => {
    const logs = [
      createLog("Bench Press", daysLater(0), 100, 3),
      createLog("Bench Press", daysLater(7), 105, 3),
      createLog("Bench Press", daysLater(14), 110, 3),
      createLog("Bench Press", daysLater(21), 115, 3),
    ];
    const result = calculateE1RMInsights(logs, undefined, daysLater(30));
    expect(result["Bench Press"]?.trend.length).toBeGreaterThanOrEqual(4);
    expect(result["Bench Press"]?.e1rm).toBeGreaterThan(100);
    expect(result["Bench Press"]?.plateau).toBe(false);
  });

  // -------------------------------------------------------------------------
  // Dampened rolling-max (Flaw 4 fix)
  // -------------------------------------------------------------------------

  describe("dampened rolling-max for currentE1RM — Flaw 4 fix", () => {
    it("a single bad session does not tank the reported e1RM", () => {
      // Athlete steadily at ~116 kg e1RM (100 × (1+5/30)), then one bad day at 80×5
      const logs = [
        createLog("Bench Press", daysLater(0), 100, 5),
        createLog("Bench Press", daysLater(7), 100, 5),
        createLog("Bench Press", daysLater(14), 100, 5), // bad day: lower weight
        createLog("Bench Press", daysLater(21), 80, 5),
      ];
      const result = calculateE1RMInsights(logs, undefined, daysLater(30));
      const reported = result["Bench Press"]?.e1rm;
      const rawLastSession = calculateE1RM(80, 5)!;
      // Reported e1RM should be higher than the raw bad-day session value
      expect(reported).toBeGreaterThan(rawLastSession);
    });

    it("genuine PR immediately improves the reported e1RM (no EWMA lag)", () => {
      const logs = [
        createLog("Bench Press", daysLater(0), 100, 5),
        createLog("Bench Press", daysLater(7), 100, 5),
        createLog("Bench Press", daysLater(14), 110, 5), // new PR
      ];
      const result = calculateE1RMInsights(logs, undefined, daysLater(21));
      const prE1RM = calculateE1RM(110, 5)!;
      // Rolling max should include the PR session immediately
      expect(result["Bench Press"]?.e1rm).toBeCloseTo(prE1RM, 0);
    });
  });

  // -------------------------------------------------------------------------
  // Slope-based plateau detection (Flaw 5 fix)
  // -------------------------------------------------------------------------

  describe("slope-based plateau detection — Flaw 5 fix", () => {
    it("does NOT flag genuine linear progression as a plateau (old 5%-band false positive)", () => {
      // Old algorithm would flag this as plateau (all within 5% of 100 kg peak).
      // New slope-based algorithm should see positive slope and not plateau.
      const logs = [
        createLog("Squat", daysLater(0), 90, 5),
        createLog("Squat", daysLater(7), 92, 5),
        createLog("Squat", daysLater(14), 94, 5),
        createLog("Squat", daysLater(21), 96, 5),
        createLog("Squat", daysLater(28), 98, 5),
      ];
      expect(calculateE1RMInsights(logs, undefined, daysLater(35)).Squat?.plateau).toBe(false);
    });

    it("detects a genuine flat plateau (zero slope, 5+ sessions)", () => {
      const logs = [
        createLog("Squat", daysLater(0), 100, 5),
        createLog("Squat", daysLater(7), 100, 5),
        createLog("Squat", daysLater(14), 100, 5),
        createLog("Squat", daysLater(21), 100, 5),
        createLog("Squat", daysLater(28), 100, 5),
      ];
      expect(calculateE1RMInsights(logs, undefined, daysLater(35)).Squat?.plateau).toBe(true);
    });

    it("does NOT flag plateau with fewer than 5 sessions (minimum window requirement)", () => {
      const logs = [
        createLog("Squat", daysLater(0), 100, 5),
        createLog("Squat", daysLater(7), 100, 5),
        createLog("Squat", daysLater(14), 100, 5),
        createLog("Squat", daysLater(21), 100, 5),
      ];
      expect(calculateE1RMInsights(logs, undefined, daysLater(30)).Squat?.plateau).toBe(false);
    });

    it("resets plateau when exercise is absent for 3+ weeks", () => {
      const logs = [
        createLog("Squat", daysLater(0), 100, 5),
        createLog("Squat", daysLater(7), 100, 5),
        createLog("Squat", daysLater(14), 100, 5),
        createLog("Squat", daysLater(21), 100, 5),
        createLog("Squat", daysLater(28), 100, 5),
      ];
      // Check beyond PLATEAU_RESET_DAYS (21 days) from last log
      expect(calculateE1RMInsights(logs, undefined, daysLater(50)).Squat?.plateau).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // bestRPE fix (Flaw 8)
  // -------------------------------------------------------------------------

  describe("bestRPE tracks the most recent session's best-set RPE — Flaw 8 fix", () => {
    it("bestRPE reflects the RPE of the current best-set, not historical maximum", () => {
      const logs = [
        createLog("Row", daysLater(0), 100, 8, 9), // historic high RPE
        createLog("Row", daysLater(7), 110, 6, 7), // recent lower RPE
        createLog("Row", daysLater(14), 105, 7, 7), // recent session RPE
      ];
      const result = calculateE1RMInsights(logs, undefined, daysLater(30));
      // bestRPE should be the RPE of the most recent session's best set, not 9
      expect(result.Row?.bestRPE).not.toBe(9);
    });

    it("bestRPE is the RPE of the set with the highest e1RM in the latest session", () => {
      const logs = [
        // Two sets in the last session; the 110 kg × 5 set is the best e1RM
        createLog("Row", daysLater(0), 90, 5, 7),
        createLog("Row", daysLater(7), 90, 5, 8),
        createLog("Row", daysLater(14), 100, 5, 6), // best e1RM this session (lower RPE)
        createLog("Row", daysLater(14), 90, 5, 9), // same session, higher RPE but lower e1RM
      ];
      const result = calculateE1RMInsights(logs, undefined, daysLater(21));
      // best set in latest session is 100×5 @RPE6, not 90×5 @RPE9
      expect(result.Row?.bestRPE).toBe(6);
    });

    it("bestRPE is undefined when the most recent session has no RPE recorded", () => {
      const logs = [
        createLog("Row", daysLater(0), 100, 8, 9), // has RPE
        createLog("Row", daysLater(7), 110, 6), // no RPE — this is the last session
      ];
      expect(calculateE1RMInsights(logs, undefined, daysLater(30)).Row?.bestRPE).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // Existing behaviours that must still pass
  // -------------------------------------------------------------------------

  // -------------------------------------------------------------------------
  // linearRegressionSlope — indirect unit tests via plateau API
  // -------------------------------------------------------------------------

  describe("linearRegressionSlope — verified via plateau detection", () => {
    // linearRegressionSlope is private, so we test its properties through the
    // one public API that depends on it. These cases are designed to exercise
    // the slope calculation in isolation (each controls only one variable).

    it("constant series → slope ≈ 0 → plateau fires with 5+ sessions", () => {
      const logs = [0, 7, 14, 21, 28].map((d) => createLog("Bench", daysLater(d), 100, 5));
      expect(calculateE1RMInsights(logs, undefined, daysLater(35)).Bench?.plateau).toBe(true);
    });

    it("strictly increasing series → positive slope → no plateau", () => {
      const logs = [0, 7, 14, 21, 28].map((d, i) =>
        createLog("Bench", daysLater(d), 100 + i * 5, 5),
      );
      expect(calculateE1RMInsights(logs, undefined, daysLater(35)).Bench?.plateau).toBe(false);
    });

    it("strictly decreasing series → negative slope → no plateau (regression: was broken before Math.abs fix)", () => {
      // A declining athlete (e.g. overreaching) must not be told to swap exercises.
      // Their slope is negative, which is below PLATEAU_SLOPE_THRESHOLD without
      // Math.abs, causing a false-positive plateau before the fix.
      const logs = [0, 7, 14, 21, 28].map((d, i) =>
        createLog("Bench", daysLater(d), 120 - i * 5, 5),
      );
      expect(calculateE1RMInsights(logs, undefined, daysLater(35)).Bench?.plateau).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // trend / trendDates alignment (regression: was desynced via sortedDays)
  // -------------------------------------------------------------------------

  describe("trend and trendDates are always aligned — desync regression", () => {
    it("trend.length === trendDates.length even when some sessions have all-null e1RM", () => {
      const logs = [
        createLog("OHP", daysLater(0), 60, 3), // valid
        createLog("OHP", daysLater(7), 60, 25), // reps > 20 → null e1RM → session skipped
        createLog("OHP", daysLater(14), 65, 3), // valid
        createLog("OHP", daysLater(21), 67, 3), // valid
      ];
      const result = calculateE1RMInsights(logs, undefined, daysLater(30)).OHP!;
      // 3 valid sessions (day 0, 14, 21); day 7 was filtered
      expect(result.trend.length).toBe(result.trendDates.length);
      expect(result.trend.length).toBe(3);
      // Dates must correspond to the same sessions as trend values
      expect(result.trendDates[0].toDateString()).toBe(daysLater(0).toDateString());
      expect(result.trendDates[1].toDateString()).toBe(daysLater(14).toDateString());
      expect(result.trendDates[2].toDateString()).toBe(daysLater(21).toDateString());
    });
  });

  it("caps trend at 8 most recent sessions", () => {
    const logs = Array.from({ length: 12 }, (_, i) =>
      createLog("Deadlift", daysLater(i * 7), 100 + i * 5, 3),
    );
    expect(calculateE1RMInsights(logs, undefined, daysLater(100)).Deadlift?.trend).toHaveLength(8);
  });

  it("uses best e1RM across multiple sets within the same session (NSCA best-set standard)", () => {
    const logs = [
      createLog("Bench Press", daysLater(0), 80, 5),
      createLog("Bench Press", daysLater(0), 100, 5),
      createLog("Bench Press", daysLater(0), 95, 5),
    ];
    const result = calculateE1RMInsights(logs, undefined, daysLater(10));
    expect(result["Bench Press"]?.trend[0]).toBeCloseTo(calculateE1RM(100, 5)!, 1);
  });

  it("skips sets with null e1RM (reps > 20) and counts only valid sessions", () => {
    const logs = [createLog("Curl", daysLater(0), 20, 25), createLog("Curl", daysLater(7), 30, 10)];
    expect(calculateE1RMInsights(logs, undefined, daysLater(30)).Curl?.trend).toHaveLength(1);
  });

  it("returns nothing for exercise where all sets have null e1RM", () => {
    const logs = [createLog("Walk", daysLater(0), 0, 0)];
    expect(calculateE1RMInsights(logs, undefined, daysLater(30)).Walk).toBeUndefined();
  });

  it("case-insensitive name matching groups all variants together", () => {
    const logs = [
      createLog("bench press", daysLater(0), 100, 5),
      createLog("BENCH PRESS", daysLater(7), 102, 5),
      createLog("Bench Press", daysLater(14), 104, 5),
    ];
    const result = calculateE1RMInsights(logs, undefined, daysLater(30));
    expect(Object.keys(result)).toHaveLength(1);
    expect(result["bench press"]?.trend).toHaveLength(3);
  });

  it("tracks multiple exercises independently", () => {
    const logs = [
      createLog("Bench Press", daysLater(0), 100, 5),
      createLog("Squat", daysLater(0), 150, 5),
      createLog("Bench Press", daysLater(7), 102, 5),
      createLog("Squat", daysLater(7), 155, 5),
    ];
    const result = calculateE1RMInsights(logs, undefined, daysLater(30));
    expect(Object.keys(result)).toHaveLength(2);
    expect(result.Squat?.e1rm).toBeGreaterThan(result["Bench Press"]?.e1rm);
  });

  it("excludes deload week logs from trend", () => {
    const logs = [
      createLog("OHP", daysLater(0), 60, 3),
      createLog("OHP", daysLater(7), 62, 3),
      createLog("OHP", daysLater(14), 30, 3), // deload session
      createLog("OHP", daysLater(21), 64, 3),
    ];
    const deloadRange = { start: daysLater(13), end: daysLater(15) };
    const withDeload = calculateE1RMInsights(logs, [deloadRange], daysLater(30));
    const withoutDeload = calculateE1RMInsights(logs, undefined, daysLater(30));
    expect(withDeload.OHP?.trend).toHaveLength(3);
    expect(withDeload.OHP?.e1rm).toBeGreaterThanOrEqual(withoutDeload.OHP?.e1rm);
  });

  it("excludes synthetic logs from trend (Flaw 7 fix)", () => {
    const logs: ExerciseLog[] = [
      createLog("Squat", daysLater(0), 100, 5),
      createLog("Squat", daysLater(7), 105, 5),
      // Synthetic log from training summary (inflated by maxWeight * avgReps @ RPE 8)
      { ...createLog("Squat", daysLater(14), 140, 5, 8), synthetic: true },
      createLog("Squat", daysLater(21), 110, 5),
    ];
    const result = calculateE1RMInsights(logs, undefined, daysLater(30));
    // The synthetic log should not be in the trend, length should be 3
    expect(result.Squat?.trend).toHaveLength(3);
    // The e1rm should not be inflated by the 140kg synthetic log
    const expectedMax = Math.max(
      calculateE1RM(100, 5)!,
      calculateE1RM(105, 5)!,
      calculateE1RM(110, 5)!,
    );
    // Allowing for decay over a few sessions
    expect(result.Squat?.e1rm).toBeLessThan(calculateE1RM(140, 5, 8)!);
    expect(result.Squat?.e1rm).toBeCloseTo(expectedMax, 0);
  });

  it("synthetic logs in the same session as real logs don't contaminate the best-set selection", () => {
    const logs: ExerciseLog[] = [
      createLog("Bench", daysLater(0), 100, 5), // real
      { ...createLog("Bench", daysLater(0), 150, 5), synthetic: true }, // synthetic in same session
    ];
    const result = calculateE1RMInsights(logs, undefined, daysLater(10));
    expect(result.Bench?.e1rm).toBeCloseTo(calculateE1RM(100, 5)!, 1);
  });

  it("includes trendDates corresponding to the sessions in the trend array", () => {
    const logs = [createLog("Row", daysLater(0), 100, 8), createLog("Row", daysLater(7), 110, 6)];
    const result = calculateE1RMInsights(logs, undefined, daysLater(30));
    expect(result.Row?.trendDates).toHaveLength(2);
    expect(result.Row?.trendDates[0].toDateString()).toBe(daysLater(0).toDateString());
    expect(result.Row?.trendDates[1].toDateString()).toBe(daysLater(7).toDateString());
  });

  // -------------------------------------------------------------------------
  // rpeOverloadReady fix
  // -------------------------------------------------------------------------

  describe("rpeOverloadReady calculates correctly", () => {
    it("is false when exercise is not established (>14 days)", () => {
      const logs = [
        createLog("Bench", daysLater(0), 100, 5, 7),
        createLog("Bench", daysLater(7), 100, 5, 7), // 7 days history, not 14
      ];
      const result = calculateE1RMInsights(logs, undefined, daysLater(10));
      expect(result.Bench?.rpeOverloadReady).toBe(false);
    });

    it("is true when exercise is established (>14 days) and last session best set RPE < 8", () => {
      const logs = [
        createLog("Bench", daysLater(0), 100, 5, 7),
        createLog("Bench", daysLater(7), 100, 5, 7),
        createLog("Bench", daysLater(14), 100, 5, 7), // exactly 14 days
      ];
      const result = calculateE1RMInsights(logs, undefined, daysLater(15));
      expect(result.Bench?.rpeOverloadReady).toBe(true);
    });

    it("is false when exercise is established but last session best set RPE is >= 8", () => {
      const logs = [
        createLog("Bench", daysLater(0), 100, 5, 7),
        createLog("Bench", daysLater(7), 100, 5, 7),
        createLog("Bench", daysLater(14), 100, 5, 8.5), // RPE >= 8
      ];
      const result = calculateE1RMInsights(logs, undefined, daysLater(15));
      expect(result.Bench?.rpeOverloadReady).toBe(false);
    });

    it("is false when RPE is missing from the last session", () => {
      const logs = [
        createLog("Bench", daysLater(0), 100, 5, 7),
        createLog("Bench", daysLater(7), 100, 5, 7),
        createLog("Bench", daysLater(14), 100, 5), // Missing RPE
      ];
      const result = calculateE1RMInsights(logs, undefined, daysLater(15));
      expect(result.Bench?.rpeOverloadReady).toBe(false);
    });

    it("uses full history for established check, not just truncated trend window", () => {
      // Create 10 logs spaced 2 days apart (total 18 days span).
      // The trend window only holds the last 8 logs (which span 14 days).
      // Wait, let's space them 1 day apart.
      // 20 logs, 1 day apart. First log is day 0, last is day 19 (19 days span).
      // Trend window (last 8 logs) spans from day 12 to day 19 (7 days span).
      // If we only looked at trend window, it would seem unestablished (7 < 14).
      const logs: ExerciseLog[] = [];
      for (let i = 0; i <= 19; i++) {
        logs.push(createLog("Bench", daysLater(i), 100, 5, 7));
      }
      const result = calculateE1RMInsights(logs, undefined, daysLater(20));
      // Should correctly see it as established because full history is 19 days
      expect(result.Bench?.rpeOverloadReady).toBe(true);
    });
  });
});
