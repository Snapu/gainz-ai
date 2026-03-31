// Simulate 10 years of training
const WEEKS_IN_10_YEARS = 520;
const SESSIONS_PER_WEEK = 3.5;
const SETS_PER_SESSION = 12;
const RPE_AVG = 8.5; // High effort

// XP Sources
const SESSION_XP = 50;
const SET_XP_BASE = 10;
const RPE_MULT = (rpe: number) => {
  if (rpe >= 9) return 2.5;
  if (rpe >= 7) return 1.5;
  return 0.5;
};
const PR_XP = 500;
const PR_CHANCE_PER_SESSION = 0.15; // Every 2 weeks approx
const VOLUME_MAV_BONUS = 200;
const MAV_CHANCE_PER_WEEK = 0.8; // Most weeks you hit MAV for at least one group

function simulateYear(currentXP: number, readiness: number) {
  let yearlyXP = 0;
  for (let w = 0; w < 52; w++) {
    let weeklyXP = 0;
    for (let s = 0; s < SESSIONS_PER_WEEK; s++) {
      // Session base
      weeklyXP += SESSION_XP;

      // Sets
      for (let set = 0; set < SETS_PER_SESSION; set++) {
        weeklyXP += SET_XP_BASE * RPE_MULT(RPE_AVG);
      }

      // PRs
      if (Math.random() < PR_CHANCE_PER_SESSION) {
        weeklyXP += PR_XP;
      }
    }

    // Volume bonus
    if (Math.random() < MAV_CHANCE_PER_WEEK) {
      weeklyXP += VOLUME_MAV_BONUS;
    }

    // Consistency bonus
    weeklyXP += 150;

    yearlyXP += weeklyXP * readiness;
  }
  return yearlyXP;
}

function xpForLevel(level: number): number {
  // We want total XP after Level 300 to be around the amount earned in 10 years
  // Let's test this curve:
  return Math.floor(600 * 1.011 ** level + 100);
}

function runSimulation() {
  let totalXP = 0;
  let level = 1;
  const readiness = 1.2; // Consistent high performer

  console.log("Year | Level | Total XP | XP/Year");
  console.log("---------------------------------");

  for (let year = 1; year <= 15; year++) {
    const earned = simulateYear(totalXP, readiness);
    totalXP += earned;

    // Resolve level
    while (totalXP >= xpForLevel(level)) {
      // Note: totalXP here is cumulative. xpForLevel should probably be XP *to advance* from that level.
      // The traditional way is: if (currentXP >= totalXPRequiredForLevel(level + 1))
    }

    // Correct level resolution:
    let tempXP = totalXP;
    let tempLevel = 1;
    while (tempXP >= xpForLevel(tempLevel)) {
      tempXP -= xpForLevel(tempLevel);
      tempLevel++;
    }
    level = tempLevel;

    console.log(
      `${year.toString().padStart(4)} | ${level.toString().padStart(5)} | ${Math.floor(totalXP).toString().padStart(8)} | ${Math.floor(earned).toString().padStart(7)}`,
    );
  }
}

runSimulation();
