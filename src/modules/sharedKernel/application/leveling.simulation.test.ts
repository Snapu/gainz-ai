import { describe, expect, it } from "vitest";

describe("Leveling Simulation", () => {
  it("should verify the 10-year curve", () => {
    // Simulate 10 years of training
    const WEEKS_IN_10_YEARS = 520;
    const SESSIONS_PER_WEEK = 3.5;
    const SETS_PER_SESSION = 12;
    const RPE_AVG = 8.5;

    const SESSION_XP = 50;
    const SET_XP_BASE = 10;
    const RPE_MULT = (rpe: number) => {
      if (rpe >= 9) return 2.5;
      if (rpe >= 7) return 1.5;
      return 0.5;
    };
    const PR_XP = 500;
    const PR_CHANCE_PER_SESSION = 0.15;
    const VOLUME_MAV_BONUS = 200;
    const MAV_CHANCE_PER_WEEK = 0.8;

    function xpForLevel(level: number): number {
      // 10 years = ~1.1M XP. Level 300 should be the cap.
      // Growth rate 1.011 yields ~1.1M XP for 300 levels.
      return Math.floor(600 * 1.011 ** level + 100);
    }

    let totalXP = 0;
    let level = 1;
    const readiness = 1.2;

    console.log("Year | Level | Total XP | XP/Year");
    console.log("---------------------------------");

    for (let year = 1; year <= 12; year++) {
      let yearlyXP = 0;
      for (let w = 0; w < 52; w++) {
        let weeklyXP = 0;
        for (let s = 0; s < SESSIONS_PER_WEEK; s++) {
          weeklyXP += SESSION_XP;
          for (let set = 0; set < SETS_PER_SESSION; set++) {
            weeklyXP += SET_XP_BASE * RPE_MULT(RPE_AVG);
          }
          if (Math.random() < PR_CHANCE_PER_SESSION) weeklyXP += PR_XP;
        }
        if (Math.random() < MAV_CHANCE_PER_WEEK) weeklyXP += VOLUME_MAV_BONUS;
        weeklyXP += 150; // Performance bonus
        yearlyXP += weeklyXP * readiness;
      }
      totalXP += yearlyXP;

      let tempXP = totalXP;
      let tempLevel = 1;
      while (tempXP >= xpForLevel(tempLevel)) {
        tempXP -= xpForLevel(tempLevel);
        tempLevel++;
      }
      level = tempLevel;
      console.log(
        `${year.toString().padStart(4)} | ${level.toString().padStart(5)} | ${Math.floor(totalXP).toString().padStart(8)} | ${Math.floor(yearlyXP).toString().padStart(7)}`,
      );
    }

    // Verify the simulation produces expected growth
    expect(level).toBeGreaterThan(50);
    expect(totalXP).toBeGreaterThan(10000);
  });
});
