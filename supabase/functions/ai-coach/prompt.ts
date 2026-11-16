import type { CoachActionRequestDto, CoachingMode, PlannedExercise } from "./schemas.ts";

const INITIAL_LOG_WINDOW_DAYS = 14;
const EXTENDED_LOG_WINDOW_DAYS = 28;
const MIN_INITIAL_LOG_ENTRIES = 12;
const MAX_CONVERSATION_TURNS = 40;
const MAX_PART_TEXT_LENGTH = 35_000;
const MAX_TOTAL_CONVERSATION_CHARS = 50_000;

export interface ConversationContent {
  role: "user" | "model";
  parts: Array<{ text: string }>;
}

export const BASE_SYSTEM_INSTRUCTION = `
You are an elite AI personal trainer providing data-driven feedback and workout planning.

1. CORE RESPONSIBILITIES:
- Generate a highly personalized workout plan for today based on goals, fitness level, available equipment, and time constraints.
- Factor in health/schedule events and distribute weekly volume across 'days'.
- You MUST strictly respect the number of workout days per week ('days' in the '# session' profile) when generating a 'trainingPlan'.
- Adapt programming to fitness goals:
  build_muscle      → 6–15 rep range (isolation up to 20), focus on mechanical tension & progressive overload
  lose_fat          → 6–12 rep range, maintain intensity to prevent muscle loss. Prioritize LISS cardio over HIIT (unless user explicitly requests intervals). Only generate a dedicated 30-45m LISS session if 'days' strictly exceeds the number of lifting sessions in the plan. Otherwise, append a conditioning finisher (e.g., Incline Walk, Stairmaster, Assault Bike) at the VERY END of the exercise array using 'targetDurationSeconds' or 'targetDistanceMeters'. If time is constrained (sessionMins ≤45), skip cardio entirely and increase workout density with supersets instead. Cardio must respect available equipment (e.g., no treadmill if no 'cardio_machine'; suggest Jogging or Jump Rope instead).
  improve_endurance → 8–15 rep range for compounds, 12–20 for isolation/bodyweight, with shorter rest. Incorporate cardio (e.g., Jogging, Running, Rowing) using 'targetDistanceMeters' or 'targetDurationSeconds'. Cardio must respect available equipment.
  increase_mobility → Integrate 2-3 mobility movements per session (e.g., hip openers, thoracic rotations, shoulder dislocates). Use bodyweight and 'targetDurationSeconds' for holds. Weave in as warm-up or active rest between sets targeting non-competing muscle groups (e.g., thoracic mobility between squats). Do NOT program static stretching for the prime movers between their working sets.
  general_fitness   → 8–15 rep range, balanced full-body. Mix strength, conditioning, and 1 mobility movement. Optionally include a short cardio finisher if time permits.
- When multiple goals are selected, use the first listed goal as the primary driver for rep ranges and structure. Layer in secondary goals where compatible (e.g., lose_fat + build_muscle → hypertrophy programming in a deficit; lose_fat + improve_endurance → include cardio more aggressively).

2. RULE HIERARCHY:
When constraints clash, strictly follow this priority order:
  1. Injury Prevention & Time Limits: Fatigue warnings, deloads, and strict time limits take precedence (drop redundant isolation/junk volume if short on time).
  2. Muscle Recovery & Maintenance: Do not train muscles over 'MRV' or if 'recoveryReady=✗'. If requested to "maintain", assign absolute minimum volume (max 2-3 sets TOTAL per week for that area, using just 1 exercise).
  3. Goal Overload: Progressive overload is the lowest priority; only push harder if safety allows.

3. TRAINING SCIENCE DATA (CRITICAL):
- TRUST the pre-calculated data in the sections. Do NOT recalculate them.

- '# workload' section:
  acwr: If >1.5 AND fatigue.risk >= 3, consider reducing volume. Otherwise, >1.3 is healthy during progressive overload.
  fatigue.deload: If true, set startDeload=true.

- '# muscles' section (Name: sets/directSets | landmark | freq | hoursRested | recoveryReady | trend):
  MEV=Min Effective, MAV=Max Adaptive, MRV=Max Recoverable.
  If >MRV, reduce sets to MAV. If →MRV, cap new primary sets to ≤2.
  If recoveryReady=✗: If last trained <24h ago, skip or halve volume. If 24-36h ago, allow at reduced intensity (70% vol/RPE). If >36h ago, allow normally.

- '# exercises' section (Name: e1rm:N [muscle] [wk] [rpe/rpe_trigger] [PLATEAU/SWAP] [hyp/str/inc] [trend]):
  'hyp'/'str' = Pre-computed target weight ranges for hypertrophy (6-15 reps) and strength (1-5 reps). USE THESE RANGES.
  'inc' = Pre-computed progressive overload weight increment.
  If 'SWAP' flag is present, switch to a mechanical variant using available equipment (e.g. Barbell → Dumbbell, Free weight → Cable/Machine).

- EXERCISE & OVERLOAD RULES:
  - If the user hit the TOP of the rep range on ALL sets previously, increase targetWeight by 'inc' and reset targetReps to bottom. Otherwise push reps higher.
  - RPE Auto-Regulation: If 'rpe_trigger:overload_ready' is present, push targetWeight or targetReps higher.
  - Target RPEs: strength (8.5-9.5), hypertrophy (7.5-9.0), endurance (7.0-8.0). Deload: drop by 2-3 points. ALWAYS populate 'targetRpe' for resistance exercises.
  - Variety Bias: Limit exercises to 1-2 heavy compound movements per muscle group. Favor higher sets of a few key exercises over a large variety of different exercises.
  - Overlap: Cap heavy pressing movements (Chest, Shoulders, Dips) to max 2 per session to avoid anterior deltoid burnout and CNS fatigue. Do not program 3+ pressing variations in one workout.

- TIME MANAGEMENT & SUPERSETS:
  - Estimate 3-4 minutes per set (execution + rest + setup). To respect time limits, strictly cap total session sets (e.g., max 12-15 sets for a 45-minute limit).
  - When time-constrained, reduce total exercises/sets or use antagonist paired sets ('supersetId') to pair non-competing muscles (e.g. Chest/Back, Biceps/Triceps). Do NOT simply slash rest periods below 90s for hypertrophy — this compromises ATP-PCr resynthesis and shifts the stimulus away from mechanical tension.
  - NEVER superset two heavy systemic compound movements (e.g., Squats and Deadlifts/RDLs) together, as this causes cardiovascular failure and compromises form.

- 'scratchpad' usage (max 2-3 short lines, written for the athlete's rationale):
  0. DATA: Sanity-check metrics.
  1. SETUP: Infer session intent & excluded recovering muscles.
  2. PLAN: Rationale for exercises/swaps.

4. STRICT OUTPUT RULES:
- Keep 'coachMessage' to 2-3 short, punchy paragraphs in the user's locale.
- MANDATORY CONSTRAINTS: Follow '# goals' explicitly.
- Use EXACT exerciseName from the '# exercises' section or '# logs'. DO NOT invent new variations of existing exercises. Exception: you may introduce well-known cardio, mobility, or conditioning movements (e.g., Jogging, Incline Walk, Cycling, Jump Rope, Sled Push, Kettlebell Swings, Battle Ropes, Hip 90/90 Stretch) that are not yet in the user's history.
- Do NOT give ranges for targetWeight, give a single number (e.g. '82.5kg'). For dumbbell exercises, ALWAYS output the TOTAL combined weight (e.g., for two 20kg dumbbells, output '40kg').
- Explicit Types: For time-based holds (e.g., Planks), output 'targetDurationSeconds' and OMIT 'targetReps'. For distance cardio (e.g., Running), output 'targetDistanceMeters' and OMIT 'targetReps'. Use 'targetReps' strictly for countable movements (e.g., '8-12').
- Prescribe 'targetRpe' (number between 6.0 and 10.0, e.g. 8.0, 8.5, 9.0) for every lifting/resistance exercise in 'recommendedWorkout' and 'trainingPlan'. Standard working sets are 8.0–9.0 (1–2 RIR), heavy strength is 8.5–9.5, deload is 6.0–6.5. Omit only for pure cardio or mobility.
- SUGGESTED FOLLOW-UP PROMPTS ('suggestedFollowUps'):
  - Output 2-4 context-aware follow-up questions tailored directly to the advice, prescribed exercises, weights, or fatigue metrics discussed.
  - Phrased strictly from the user's first-person perspective ('Can I...', 'Swap X for Y', 'I only have 30 mins...'). NEVER use coach-to-user phrasing ('Would you like to...').
  - 'label' and 'prompt' MUST be written strictly in the user's locale (matching coachMessage).
  - 'label': Concise 2-4 words for mobile pill buttons (e.g., 'Swap Leg Press', 'Warmup Guide', 'Condense to 30m').
  - 'prompt': The complete, detailed, realistic question sent to the coach.

5. MID-WORKOUT BEHAVIOR:
- Give a quick 1-2 sentence reaction to the latest set(s). No long scratchpad needed.
- During conversational Q&A mid-workout, OMIT 'recommendedWorkout' entirely unless the user explicitly asks for a change to the plan. This prevents accidental plan drift.
- During quick set reactions or ongoing chat, omit 'suggestedFollowUps' unless proposing new workout adjustments.

6. MESOCYCLE PROGRAMMING:
- When 'planStatus: active' is present in '# session':
  The user has an existing mesocycle. Look at the '# program' section. Sessions marked '[DONE]' have already been completed.
  The next session in the sequence is marked '[NEXT_SESSION]'. You MUST use the '[NEXT_SESSION]' as today's workout. Do NOT skip ahead to match the current calendar day — the user trains when they find time, so they just do the next session in order.
  If the user's fatigue and training history strongly suggest a rest day, do not output a 'recommendedWorkout' and advise rest instead. Adapt weights/reps from '# logs'. Do NOT regenerate 'trainingPlan' unless the user explicitly asks to create, change, or adjust their multi-week plan in '# question'.
- When phase is "planning" AND no '# program' section is present:
  Generate a 'trainingPlan' with a 2-week cycle. You MUST match EXACTLY the user's 'days' value (workout days per week) from the '# session' section. Do not generate more or fewer sessions per week.
  Name sessions clearly. Distribute weekly volume across sessions respecting recovery.
  ALSO output today's session as 'recommendedWorkout'.
- When '# program' is present:
  Use the session marked '[NEXT_SESSION]' as today's workout → output as 'recommendedWorkout'.
  Adapt weights/reps based on actual performance in '# logs'.
  Do NOT regenerate 'trainingPlan' unless the user explicitly asks.
- When the user asks for a new plan (detected via '# question'):
  Generate a fresh 'trainingPlan' (respecting EXACTLY the 'days' value in the '# session' profile), applying progressive overload from performance data.
  ALSO output today's session from the newly generated plan as 'recommendedWorkout'.

You receive sections in this order:
- # session, # goals, # workload, # muscles, # exercises, # program, # history, # logs, # events, # today, # update, # plan, # question
`;

const PLAN_UPDATE_INTENT_RE =
  /\b(training\s*plan|workout\s*plan|mesocycle|split|weekly\s*plan|days\s*(?:per|a)\s*week|new\s*plan|change\s*(?:my|the)\s*(?:training\s*)?plan|update\s*(?:my|the)\s*(?:training\s*)?plan|adjust\s*(?:my|the)\s*(?:training\s*)?plan|rebuild\s*(?:my|the)\s*(?:training\s*)?plan|regenerate\s*(?:my\s*)?plan|switch\s*to\s*(?:ppl|upper\/?lower|full\s*body|push\s*pull\s*legs)|trainingsplan|mesozyklus|wochenplan|tage\s*pro\s*woche|plan\s*(?:anpassen|ändern|umstellen)|neuen?\s*(?:trainings)?plan)\b/i;

export function sanitizePromptText(value: string): string {
  return value
    .replace(/\r\n/g, "\n")
    .replace(/^\s*#+\s+/gm, "")
    .replace(/\[\s*(?:NEXT_SESSION|DONE)\s*\]/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function shouldAllowPlanUpdate(mode: CoachingMode, question?: string): boolean {
  if (mode === "planning") return true;
  if (!question) return false;
  return PLAN_UPDATE_INTENT_RE.test(sanitizePromptText(question));
}

export function buildSystemInstruction(mode: CoachingMode): string {
  const modeDirective =
    mode === "planning"
      ? `\n7. ACTIVE MODE DIRECTIVE (PLANNING):\n- You MUST generate a complete 2-week 'trainingPlan' (matching the user's 'days' per week in '# session') AND output today's first workout session in 'recommendedWorkout' (or an empty array [] ONLY if sickness, injury, or severe fatigue requires a rest day today). Never omit 'trainingPlan'. Always output 2-4 context-aware 'suggestedFollowUps' regarding the newly generated plan (e.g. asking to adjust split days, swap an exercise in the plan, or progress weekly weights).`
      : `\n7. ACTIVE MODE DIRECTIVE (EXECUTION):\n- Follow '# program' and use '[NEXT_SESSION]' for today's 'recommendedWorkout' (unless mid-workout Q&A or advising a rest day). Only output 'trainingPlan' if the user explicitly asked to create, change, or adjust their multi-week training plan in '# question'. When you do, 'trainingPlan' REPLACES the existing plan, so it MUST be the complete updated plan with ALL sessions of every week (unchanged sessions included), never only the modified sessions. Output 2-4 context-aware 'suggestedFollowUps' when prescribing today's initial workout (omit during mid-workout set logging).`;

  return `${BASE_SYSTEM_INSTRUCTION}${modeDirective}`;
}

type LogEntry = CoachActionRequestDto["recentLogs"][number];

function getDaysSinceLastWorkout(
  logs: LogEntry[],
  sessionStartBoundaryMs: number,
  currentLocalDate: string,
): number | null {
  const pastLogs = logs.filter((log) => Date.parse(log.loggedAt) < sessionStartBoundaryMs);
  if (pastLogs.length === 0) return null;

  let maxMs = 0;
  let lastLocalDate: string | null = null;
  for (const log of pastLogs) {
    const ms = Date.parse(log.loggedAt);
    if (Number.isFinite(ms) && ms > maxMs) {
      maxMs = ms;
      lastLocalDate = log.localDate;
    }
  }
  if (!lastLocalDate) return null;

  const todayUtcMs = Date.parse(`${currentLocalDate}T00:00:00Z`);
  const lastUtcMs = Date.parse(`${lastLocalDate}T00:00:00Z`);
  if (!Number.isFinite(todayUtcMs) || !Number.isFinite(lastUtcMs)) return null;

  return Math.max(0, Math.round((todayUtcMs - lastUtcMs) / 86_400_000));
}

function getTrainingPattern(logs: LogEntry[], nowMs: number): string | null {
  const fourWeeksAgoMs = nowMs - 28 * 86_400_000;
  const recentLogs = logs.filter((log) => Date.parse(log.loggedAt) >= fourWeeksAgoMs);
  if (recentLogs.length === 0) return null;

  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const dayCounts = new Map<number, number>();
  const seenDates = new Set<string>();
  for (const log of recentLogs) {
    if (seenDates.has(log.localDate)) continue;
    seenDates.add(log.localDate);
    const day = new Date(`${log.localDate}T00:00:00Z`).getUTCDay();
    dayCounts.set(day, (dayCounts.get(day) ?? 0) + 1);
  }

  const activeDays = [...dayCounts.entries()]
    .filter(([, count]) => count >= 2)
    .sort(([a], [b]) => a - b)
    .map(([day]) => dayNames[day]);

  return activeDays.length > 0 ? activeDays.join(",") : null;
}

function formatSetEntry(s: LogEntry): string {
  if (typeof s.distance === "number" && typeof s.reps !== "number") {
    const rpe = typeof s.rpe === "number" ? `@${s.rpe}` : "";
    return `${s.distance}m${rpe}`;
  }
  if (typeof s.duration === "number" && typeof s.reps !== "number") {
    const rpe = typeof s.rpe === "number" ? `@${s.rpe}` : "";
    return `${s.duration}min${rpe}`;
  }
  const reps = typeof s.reps === "number" ? `${s.reps}` : "";
  const weight = typeof s.weight === "number" ? `×${s.weight}` : "";
  const rpe = typeof s.rpe === "number" ? `@${s.rpe}` : "";
  const suffix = typeof s.weight !== "number" && typeof s.reps === "number" ? "r" : "";
  return `${reps}${suffix}${weight}${rpe}`;
}

function compactLogs(logs: LogEntry[]): string {
  if (logs.length === 0) return "(none)";

  const byDate = new Map<string, LogEntry[]>();
  for (const log of logs) {
    const existing = byDate.get(log.localDate) ?? [];
    existing.push(log);
    byDate.set(log.localDate, existing);
  }

  const lines: string[] = [];
  for (const [date, dayLogs] of byDate) {
    lines.push(`${date}:`);
    const byExercise = new Map<string, LogEntry[]>();
    for (const log of dayLogs) {
      const safeName = sanitizePromptText(log.exerciseName);
      const existing = byExercise.get(safeName) ?? [];
      existing.push(log);
      byExercise.set(safeName, existing);
    }

    for (const [name, sets] of byExercise) {
      lines.push(`  ${name}: ${sets.map(formatSetEntry).join(", ")}`);
    }
  }

  return lines.join("\n");
}

function getInitialLogsWindow(
  logs: LogEntry[],
  nowMs: number,
): { logs: LogEntry[]; label: string } {
  const filterSince = (days: number) =>
    logs.filter((l) => Date.parse(l.loggedAt) >= nowMs - days * 86_400_000);

  const last2WeeksLogs = filterSince(INITIAL_LOG_WINDOW_DAYS);
  if (last2WeeksLogs.length >= MIN_INITIAL_LOG_ENTRIES) {
    return {
      logs: last2WeeksLogs,
      label: `logs (last ${INITIAL_LOG_WINDOW_DAYS / 7} weeks)`,
    };
  }

  const last4WeeksLogs = filterSince(EXTENDED_LOG_WINDOW_DAYS);
  if (last4WeeksLogs.length >= MIN_INITIAL_LOG_ENTRIES || logs.length <= last4WeeksLogs.length) {
    return {
      logs: last4WeeksLogs,
      label: `logs (last ${EXTENDED_LOG_WINDOW_DAYS / 7} weeks)`,
    };
  }

  return {
    logs: filterSince(90),
    label: "logs (last 13 weeks)",
  };
}

function extractExerciseNamesFromCoachContent(content: string): string[] {
  try {
    const parsed = JSON.parse(content) as Record<string, unknown>;
    if (!parsed || !Array.isArray(parsed.recommendedWorkout)) return [];
    const names: string[] = [];
    for (const ex of parsed.recommendedWorkout) {
      if (
        ex &&
        typeof ex === "object" &&
        "exerciseName" in ex &&
        typeof (ex as { exerciseName?: unknown }).exerciseName === "string"
      ) {
        names.push(sanitizePromptText((ex as { exerciseName: string }).exerciseName));
      }
    }
    return names;
  } catch {
    return [];
  }
}

function getRecentExerciseNames(dto: CoachActionRequestDto, nowMs: number): Set<string> {
  const names = new Set<string>();
  const cutoffMs = nowMs - 90 * 86_400_000;

  for (const log of dto.recentLogs) {
    if (Date.parse(log.loggedAt) >= cutoffMs) {
      names.add(sanitizePromptText(log.exerciseName));
    }
  }

  for (const msg of dto.previousMessages) {
    if (msg.role !== "coach") continue;
    for (const name of extractExerciseNamesFromCoachContent(msg.content)) {
      names.add(name);
    }
  }
  return names;
}

const TREND_SYMBOL: Record<string, string> = {
  improving: "↑",
  stable: "→",
  plateau: "→",
  dropping: "↓",
};

function formatWorkload(insights: CoachActionRequestDto["insights"]): string {
  const lines: string[] = [];
  if (insights.acwr !== null) lines.push(`acwr: ${insights.acwr.toFixed(2)}`);

  const { fatigue } = insights;
  const lw = fatigue.loadWindow;
  const fatigueParts = [`risk: ${fatigue.riskScore}`, `deload: ${fatigue.shouldDeload}`];
  if (fatigue.decliningExercises) fatigueParts.push(`declining: ${fatigue.decliningExercises}`);
  if (fatigue.hasSufficientHistory) fatigueParts.push("sufficient: true");
  if (fatigue.reason) fatigueParts.push(`reason: ${sanitizePromptText(fatigue.reason)}`);
  lines.push(`fatigue: {${fatigueParts.join(", ")}}`);

  if (fatigue.hasSufficientHistory) {
    const s = lw.sets;
    const t = lw.tonnage;
    const sRatio = s.ratioVsPriorAvg !== null ? `, ratio: ${s.ratioVsPriorAvg.toFixed(2)}` : "";
    const tRatio = t.ratioVsPriorAvg !== null ? `, ratio: ${t.ratioVsPriorAvg.toFixed(2)}` : "";
    lines.push("load:");
    lines.push(
      `  sets: {w-3: ${Math.round(s.weekMinus3)}, w-2: ${Math.round(s.weekMinus2)}, w-1: ${Math.round(s.weekMinus1)}, now: ${Math.round(s.current)}, avg: ${Math.round(s.prior3WeekAvg)}${sRatio}}`,
    );
    lines.push(
      `  tonnage: {w-3: ${Math.round(t.weekMinus3)}, w-2: ${Math.round(t.weekMinus2)}, w-1: ${Math.round(t.weekMinus1)}, now: ${Math.round(t.current)}, avg: ${Math.round(t.prior3WeekAvg)}${tRatio}}`,
    );
  }

  const deload = insights.deloadStatus;
  if (deload !== "none") {
    const parts = [`status: ${deload}`];
    if (insights.deloadEndsAt) {
      parts.push(`ended: ${sanitizePromptText(insights.deloadEndsAt).slice(0, 10)}`);
    }
    if (insights.deloadTriggerSnapshot) {
      const safeTriggers = insights.deloadTriggerSnapshot.triggeredBy.map((t) =>
        sanitizePromptText(t),
      );
      parts.push(`triggers: [${safeTriggers.join(",")}]`);
      parts.push(`risk: ${insights.deloadTriggerSnapshot.riskScore}`);
    }
    if (deload === "active" && insights.deloadTimeRemainingMs !== null) {
      parts.push(`daysLeft: ${Math.ceil(insights.deloadTimeRemainingMs / 86_400_000)}`);
    }
    lines.push(`deload: {${parts.join(", ")}}`);
  }

  return lines.join("\n");
}

function formatMuscles(insights: CoachActionRequestDto["insights"]): string {
  const LANDMARK_SHORT: Record<string, string> = {
    below_MEV: "bMEV",
    at_MEV: "MEV",
    at_MAV: "MAV",
    approaching_MRV: "→MRV",
    above_MRV: ">MRV",
  };

  const lines = ["# sets/direct | landmark | freq | hours | ready | trend"];
  for (const [name, data] of Object.entries(insights.muscleGroups)) {
    if (!data) continue;
    const hours =
      data.hoursSinceLastTrained !== null ? `${Math.round(data.hoursSinceLastTrained)}h` : "—";
    const ready = data.recoveryReady ? "✓" : "✗";
    const trend = data.trendStatus ? (TREND_SYMBOL[data.trendStatus] ?? "?") : "";
    const landmark = LANDMARK_SHORT[data.landmark] ?? data.landmark;
    const parts = [
      `${data.sets}/${data.directSets}`,
      landmark,
      `${data.frequencyPerWeek}x`,
      hours,
      ready,
    ];
    if (trend) parts.push(trend);
    lines.push(`${sanitizePromptText(name)}: ${parts.join(" | ")}`);
  }
  return lines.join("\n");
}

function formatExercises(
  dto: CoachActionRequestDto,
  recentExerciseNames: Set<string>,
  nowMs: number,
): string {
  const sevenDaysAgoMs = nowMs - 7 * 86_400_000;
  const weeklyCounts = new Map<string, number>();
  for (const log of dto.recentLogs) {
    if (Date.parse(log.loggedAt) >= sevenDaysAgoMs) {
      const safeName = sanitizePromptText(log.exerciseName);
      weeklyCounts.set(safeName, (weeklyCounts.get(safeName) ?? 0) + 1);
    }
  }

  const lines: string[] = [];
  for (const [rawName, data] of Object.entries(dto.insights.e1rm)) {
    const safeName = sanitizePromptText(rawName);
    if (recentExerciseNames.size > 0 && !recentExerciseNames.has(safeName)) continue;

    const parts: string[] = [`e1rm:${data.e1rm}`];
    if (data.primaryMuscle) parts.push(`muscle:${sanitizePromptText(data.primaryMuscle)}`);
    const weeklySets = weeklyCounts.get(safeName);
    if (weeklySets) parts.push(`wk:${weeklySets}`);
    if (data.rpeOverloadReady) parts.push("rpe_trigger:overload_ready");
    else if (data.bestRPE != null) parts.push(`rpe:${data.bestRPE}`);

    if (data.swapRecommended) parts.push("SWAP");
    else if (data.plateau) parts.push("PLATEAU");

    if (data.targetWeightHyp)
      parts.push(`hyp:${data.targetWeightHyp.low}-${data.targetWeightHyp.high}`);
    if (data.targetWeightStr)
      parts.push(`str:${data.targetWeightStr.low}-${data.targetWeightStr.high}`);
    if (data.e1rm > 0) parts.push(`inc:+${data.progressionIncrementKg}kg`);

    const trendSlice = data.trend.slice(-3);
    const trendParts = trendSlice.map((e1rm, i) => {
      const dateOffset = data.trendDates.length - trendSlice.length + i;
      const trendDate = data.trendDates[dateOffset];
      if (!trendDate) return `${e1rm}`;
      return `${sanitizePromptText(trendDate).slice(5, 10)}→${e1rm}`;
    });
    if (trendParts.length > 0) parts.push(`trend:${trendParts.join(" ")}`);

    lines.push(`${safeName}: ${parts.join(" ")}`);
  }

  return lines.join("\n");
}

function formatPlanExercise(ex: PlannedExercise): string {
  let repsStr = "";
  if (ex.targetDistanceMeters != null) repsStr = `${ex.targetDistanceMeters}m`;
  else if (ex.targetDurationSeconds != null) repsStr = `${ex.targetDurationSeconds}s`;
  else repsStr = ex.targetReps ? sanitizePromptText(ex.targetReps) : "";

  const parts = [`${ex.targetSets}×${repsStr}`];
  if (ex.targetWeight) parts.push(`@${sanitizePromptText(ex.targetWeight)}`);
  if (ex.targetRpe) parts.push(`@RPE${ex.targetRpe}`);
  if (ex.restSeconds) parts.push(`${ex.restSeconds}s`);
  if (ex.supersetId) parts.push(`[SS:${sanitizePromptText(ex.supersetId)}]`);
  if (ex.notes) parts.push(`(${sanitizePromptText(ex.notes)})`);
  return `  ${sanitizePromptText(ex.exerciseName)}: ${parts.join(" ")}`;
}

function formatPlanForPrompt(
  plan: NonNullable<CoachActionRequestDto["activePlan"]>,
  completedKeys: ReadonlySet<string>,
): string {
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const lines: string[] = [
    `cycle: ${plan.cycleWeeks}w, created: ${sanitizePromptText(plan.createdAt).slice(0, 10)}`,
  ];

  for (const session of plan.sessions) {
    const dayStr = dayNames[session.dayOfWeek] ?? `Day${session.dayOfWeek}`;
    const sessionKey = `W${session.weekNumber}-D${session.dayOfWeek}`;
    let marker = "";
    if (completedKeys.has(sessionKey)) {
      marker = " [DONE]";
    } else if (sessionKey === plan.nextUncompletedSessionKey) {
      marker = " [NEXT_SESSION]";
    }

    const label = sanitizePromptText(session.sessionLabel);
    const focus = sanitizePromptText(session.focusDescription);
    lines.push(`W${session.weekNumber}-${dayStr} ${label} (${focus}):${marker}`);
    for (const ex of session.exercises) {
      lines.push(formatPlanExercise(ex));
    }
  }

  return lines.join("\n");
}

const PRIOR_PLAN_TEXT_FIELDS = [
  "targetReps",
  "targetWeight",
  "notes",
  "supersetId",
  "primaryMuscle",
] as const;

const PRIOR_PLAN_NUMBER_FIELDS = [
  "targetDurationSeconds",
  "targetDistanceMeters",
  "targetRpe",
  "restSeconds",
] as const;

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function sanitizeSecondaryMuscles(
  raw: unknown,
): NonNullable<PlannedExercise["secondaryMuscles"]> | undefined {
  if (!Array.isArray(raw)) return undefined;
  const cleaned: NonNullable<PlannedExercise["secondaryMuscles"]> = [];
  for (const item of raw) {
    if (!isPlainRecord(item) || typeof item.muscleGroup !== "string") continue;
    const muscleGroup = sanitizePromptText(item.muscleGroup);
    if (!muscleGroup) continue;
    cleaned.push({
      muscleGroup,
      ...(typeof item.contribution === "number" && Number.isFinite(item.contribution)
        ? { contribution: item.contribution }
        : {}),
    });
  }
  return cleaned.length > 0 ? cleaned : undefined;
}

function sanitizePriorPlanExercise(raw: unknown): PlannedExercise | null {
  if (!isPlainRecord(raw) || typeof raw.exerciseName !== "string") return null;
  const exerciseName = sanitizePromptText(raw.exerciseName);
  if (!exerciseName) return null;

  const targetSets =
    typeof raw.targetSets === "number" && Number.isFinite(raw.targetSets) ? raw.targetSets : 0;
  const sanitized: PlannedExercise = { exerciseName, targetSets };

  for (const field of PRIOR_PLAN_TEXT_FIELDS) {
    const val = raw[field];
    if (typeof val === "string") sanitized[field] = sanitizePromptText(val);
  }
  for (const field of PRIOR_PLAN_NUMBER_FIELDS) {
    const val = raw[field];
    if (typeof val === "number" && Number.isFinite(val)) sanitized[field] = val;
  }
  if (typeof raw.isMetabolicProtocol === "boolean") {
    sanitized.isMetabolicProtocol = raw.isMetabolicProtocol;
  }
  const secondaryMuscles = sanitizeSecondaryMuscles(raw.secondaryMuscles);
  if (secondaryMuscles) {
    sanitized.secondaryMuscles = secondaryMuscles;
  }
  return sanitized;
}

function buildPriorPlanSummary(
  previousMessages: CoachActionRequestDto["previousMessages"],
  todayLogs: LogEntry[],
): string | null {
  const coachMessages = previousMessages.filter((m) => m.role === "coach");

  let parsedPlan: { recommendedWorkout: unknown[] } | null = null;
  for (let i = coachMessages.length - 1; i >= 0; i--) {
    try {
      const parsed = JSON.parse(coachMessages[i].content) as {
        recommendedWorkout?: unknown;
      };
      if (
        isPlainRecord(parsed) &&
        Array.isArray(parsed.recommendedWorkout) &&
        parsed.recommendedWorkout.length > 0
      ) {
        parsedPlan = { recommendedWorkout: parsed.recommendedWorkout };
        break;
      }
    } catch {
      // ignore non-JSON assistant replies
    }
  }

  if (!parsedPlan) return null;

  const sanitizedWorkout = parsedPlan.recommendedWorkout
    .map(sanitizePriorPlanExercise)
    .filter((ex): ex is PlannedExercise => ex !== null);
  if (sanitizedWorkout.length === 0) return null;

  const todayExercises = new Map<string, number>();
  for (const log of todayLogs) {
    const safeName = sanitizePromptText(log.exerciseName);
    todayExercises.set(safeName, (todayExercises.get(safeName) ?? 0) + 1);
  }

  const lines = sanitizedWorkout.map((ex) => {
    const safeName = ex.exerciseName;
    const done = todayExercises.get(safeName) ?? 0;
    const target = ex.targetSets ?? 0;
    let status: string;
    if (target > 0 && done >= target) status = "✓";
    else if (done > 0) status = `${done}/${target}`;
    else if (target > 0) status = `0/${target}`;
    else status = "pending";

    const parts = [status];
    if (ex.targetDistanceMeters != null) parts.push(`${ex.targetDistanceMeters}m`);
    else if (ex.targetDurationSeconds != null) parts.push(`${ex.targetDurationSeconds}s`);
    else if (ex.targetReps) parts.push(`${ex.targetReps}r`);
    if (ex.targetWeight) parts.push(`@${ex.targetWeight}`);
    if (ex.restSeconds) parts.push(`${ex.restSeconds}s`);
    return `  ${safeName}: ${parts.join(" ")}`;
  });

  const jsonText = `prior plan:\n\`\`\`json\n${JSON.stringify(sanitizedWorkout)}\n\`\`\``;
  if (todayLogs.length === 0) return jsonText;
  return `progress:\n${lines.join("\n")}\n\n${jsonText}`;
}

function buildSessionSection(
  dto: CoachActionRequestDto,
  isFirstMessage: boolean,
  nowMs: number,
): string {
  const activePlan = dto.mode === "planning" ? null : (dto.activePlan ?? null);
  const parts: string[] = [
    `date: ${dto.localDate}`,
    `status: ${sanitizePromptText(dto.workoutStatus)}`,
    `phase: ${dto.workoutPhase}`,
  ];

  const restDays = getDaysSinceLastWorkout(
    dto.recentLogs,
    dto.sessionStartBoundaryMs,
    dto.localDate,
  );
  if (restDays !== null) parts.push(`restDays: ${restDays}`);

  if (activePlan) {
    parts.push("planStatus: active");
    parts.push(`cycleWeek: ${activePlan.currentWeekNumber}`);
  }

  if (isFirstMessage) {
    const pattern = getTrainingPattern(dto.recentLogs, nowMs);
    if (pattern) parts.push(`pattern: ${pattern}`);
  }

  const p = dto.userProfile;
  const profileParts: string[] = [];
  if (p.age != null) profileParts.push(`age: ${p.age}`);
  if (p.heightCm != null) profileParts.push(`height: ${p.heightCm}`);
  if (p.weightKg != null) profileParts.push(`weight: ${p.weightKg}`);
  if (p.fitnessGoal?.length) profileParts.push(`goal: ${p.fitnessGoal.join(",")}`);
  if (p.fitnessLevel) profileParts.push(`level: ${p.fitnessLevel}`);
  if (p.workoutDaysPerWeek != null) profileParts.push(`days: ${p.workoutDaysPerWeek}`);
  if (p.workoutDurationMinutes != null)
    profileParts.push(`sessionMins: ${p.workoutDurationMinutes}`);
  if (p.workoutLocation) profileParts.push(`location: ${p.workoutLocation}`);
  if (profileParts.length) parts.push(`profile: {${profileParts.join(", ")}}`);

  if (p.equipmentAccess?.length) {
    parts.push(`equipment: [${p.equipmentAccess.join(", ")}]`);
  }

  parts.push(`locale: ${sanitizePromptText(dto.locale)}`);
  parts.push("units: kg/min/m");
  return `# session\n${parts.join("\n")}`;
}

function buildHistorySection(summaries: CoachActionRequestDto["trainingSummaries"]): string {
  if (summaries.length === 0) return "";
  const lines: string[] = [];
  const byMonth = new Map<string, CoachActionRequestDto["trainingSummaries"]>();
  for (const s of summaries.slice(-12)) {
    const key = `${s.year}-${String(s.month).padStart(2, "0")}`;
    const existing = byMonth.get(key) ?? [];
    existing.push(s);
    byMonth.set(key, existing);
  }
  for (const [monthKey, entries] of byMonth) {
    const workoutDays = entries[0]?.workoutDays ?? 0;
    lines.push(`${monthKey} (${workoutDays}d):`);
    for (const s of entries) {
      const parts: string[] = [`${s.sets}s`];
      if (s.totalReps) parts.push(`${s.totalReps}r`);
      if (s.maxWeight) parts.push(`max:${s.maxWeight}`);
      if (s.totalVolume && s.totalReps && s.totalReps > 0) {
        parts.push(`avg:${Math.round((s.totalVolume / s.totalReps) * 10) / 10}`);
      }
      lines.push(`  ${sanitizePromptText(s.exerciseName)}: ${parts.join(" ")}`);
    }
  }
  return `# history\n${lines.join("\n")}`;
}

function getMidWorkoutNewLogs(
  previousMessages: CoachActionRequestDto["previousMessages"],
  todayLogs: LogEntry[],
): LogEntry[] {
  const coachMessages = previousMessages.filter((m) => m.role === "coach");
  if (coachMessages.length === 0) return [];
  const lastCoach = coachMessages[coachMessages.length - 1];
  const cutoff = lastCoach?.timestamp ? Date.parse(lastCoach.timestamp) : 0;
  return todayLogs.filter((l) => Date.parse(l.loggedAt) > cutoff);
}

/**
 * Assembles the coaching prompt with prefix-stable sections first (# session, # goals,
 * # workload, # muscles, # exercises, # program, # history, # logs, # events)
 * and volatile per-turn sections last (# today, # update, # plan, # question)
 * to maximize Gemini context caching across conversation turns.
 */
export function assembleCoachingPrompt(dto: CoachActionRequestDto): string {
  const nowMs = Date.parse(dto.nowIso) || Date.now();
  const isFirstMessage = dto.previousMessages.length === 0;
  const activePlan = dto.mode === "planning" ? null : (dto.activePlan ?? null);
  const completedKeys = new Set(dto.completedSessionKeys ?? []);
  const safeQuestion = dto.question ? sanitizePromptText(dto.question) : "";

  const todayLogs = dto.recentLogs.filter(
    (l) => Date.parse(l.loggedAt) >= dto.sessionStartBoundaryMs,
  );
  const recentExerciseNames = getRecentExerciseNames(dto, nowMs);
  const initialWindow = getInitialLogsWindow(dto.recentLogs, nowMs);

  const sections: string[] = [buildSessionSection(dto, isFirstMessage, nowMs)];

  if (isFirstMessage || safeQuestion) {
    const freeInput = dto.userProfile.freeUserInput
      ? sanitizePromptText(dto.userProfile.freeUserInput)
      : "";
    if (freeInput) sections.push(`# goals\n${freeInput}`);
  }

  if (
    dto.mode === "planning" ||
    dto.workoutPhase === "planning" ||
    isFirstMessage ||
    safeQuestion
  ) {
    sections.push(`# workload\n${formatWorkload(dto.insights)}`);
    sections.push(`# muscles\n${formatMuscles(dto.insights)}`);
    const exercisesText = formatExercises(dto, recentExerciseNames, nowMs);
    if (exercisesText || Object.keys(dto.insights.e1rm).length === 0) {
      sections.push(`# exercises\n${exercisesText}`);
    }
  } else {
    const e1rmCompact = Object.entries(dto.insights.e1rm)
      .filter(([name]) => recentExerciseNames.has(sanitizePromptText(name)))
      .map(
        ([name, d]) =>
          `${sanitizePromptText(name)}: ${d.e1rm}kg${d.plateau ? " PLATEAU" : ""}${d.bestRPE != null ? ` @RPE${d.bestRPE}` : ""}`,
      )
      .join(", ");
    if (e1rmCompact) sections.push(`# e1rm\n${e1rmCompact}`);
  }

  if (activePlan) {
    sections.push(`# program\n${formatPlanForPrompt(activePlan, completedKeys)}`);
  }

  if (isFirstMessage || safeQuestion) {
    const hist = buildHistorySection(dto.trainingSummaries);
    if (hist) sections.push(hist);
  }

  if (isFirstMessage) {
    const historicalLogs = initialWindow.logs.filter(
      (l) => Date.parse(l.loggedAt) < dto.sessionStartBoundaryMs,
    );
    if (historicalLogs.length > 0) {
      sections.push(`# ${initialWindow.label}\n${compactLogs(historicalLogs)}`);
    }
  }

  if (dto.events && dto.events.length > 0) {
    sections.push(
      `# events\n${dto.events
        .map(
          (e) =>
            `${sanitizePromptText(e.type)}: ${e.dates.map((d) => sanitizePromptText(d)).join(", ")}`,
        )
        .join("\n")}`,
    );
  }

  // Volatile per-turn sections last for prefix cache stability
  if (todayLogs.length > 0) {
    sections.push(`# today\n${compactLogs(todayLogs)}`);
  }

  if (dto.previousMessages.length > 0) {
    if (dto.workoutPhase === "mid-workout") {
      const newLogs = getMidWorkoutNewLogs(dto.previousMessages, todayLogs);
      if (newLogs.length > 0) {
        sections.push(`# update\n${compactLogs(newLogs)}`);
      }
    }
    const planSummary = buildPriorPlanSummary(dto.previousMessages, todayLogs);
    if (planSummary) {
      sections.push(`# plan\n${planSummary}`);
    }
  }

  if (safeQuestion) {
    sections.push(`# question\n${safeQuestion}`);
  }

  return sections.join("\n\n");
}

function clampPartText(text: string): string {
  return text.length > MAX_PART_TEXT_LENGTH ? text.slice(0, MAX_PART_TEXT_LENGTH) : text;
}

function totalContentsLength(contents: ConversationContent[]): number {
  return contents.reduce((sum, item) => sum + (item.parts[0]?.text.length ?? 0), 0);
}

function normalizeAlternatingHistory(history: ConversationContent[]): ConversationContent[] {
  const normalized: ConversationContent[] = [];

  for (const turn of history) {
    if (normalized.length === 0 && turn.role !== "user") continue;

    const previous = normalized.at(-1);
    if (previous && previous.role === turn.role) {
      const mergedText = clampPartText(
        `${previous.parts[0]?.text ?? ""}\n\n${turn.parts[0]?.text ?? ""}`.trim(),
      );
      previous.parts = [{ text: mergedText }];
      continue;
    }

    normalized.push({ role: turn.role, parts: [{ text: turn.parts[0]?.text ?? "" }] });
  }

  while (normalized.at(-1)?.role === "user") {
    normalized.pop();
  }

  return normalized;
}

function mapPreviousMessageToContent(
  msg: CoachActionRequestDto["previousMessages"][number],
): ConversationContent {
  if (msg.role === "user") {
    const clean = sanitizePromptText(msg.content);
    return {
      role: "user",
      parts: [
        {
          text: clean || "Please evaluate my workout readiness and recommend today's session.",
        },
      ],
    };
  }

  let text = msg.content;
  try {
    const parsed = JSON.parse(msg.content) as { coachMessage?: unknown };
    if (parsed && typeof parsed.coachMessage === "string") {
      text = parsed.coachMessage;
    }
  } catch {
    // plain text reply
  }

  return {
    role: "model",
    parts: [{ text: sanitizePromptText(text) }],
  };
}

export function buildBoundedConversationContents(
  previousMessages: CoachActionRequestDto["previousMessages"],
  currentPrompt: string,
): ConversationContent[] {
  const activeText = clampPartText(currentPrompt);
  const historyCharBudget = MAX_TOTAL_CONVERSATION_CHARS - activeText.length;
  let remainingChars = historyCharBudget;
  const maxHistoryItems = MAX_CONVERSATION_TURNS - 1;

  const recentCandidates = previousMessages.slice(-maxHistoryItems);
  const keptHistory: ConversationContent[] = [];

  for (let i = recentCandidates.length - 1; i >= 0; i--) {
    const mapped = mapPreviousMessageToContent(recentCandidates[i]);
    const partText = clampPartText(mapped.parts[0]?.text ?? "");
    if (partText.length > remainingChars) break;
    remainingChars -= partText.length;
    keptHistory.unshift({
      role: mapped.role,
      parts: [{ text: partText }],
    });
  }

  const normalized = normalizeAlternatingHistory(keptHistory);
  while (normalized.length > 0 && totalContentsLength(normalized) > historyCharBudget) {
    normalized.shift();
    if (normalized[0]?.role === "model") {
      normalized.shift();
    }
  }

  return [...normalized, { role: "user", parts: [{ text: activeText }] }];
}
