# AI Response Improvement Backlog

Analysis from four perspectives: Sports Scientist, Fitness Coach, Professional Athlete, AI Architect.
Each item references the exact file/function to change.

---

## Priority Key

- 🔴 High impact
- 🟠 Medium impact
- 🟡 Low impact

---

## System Prompt Changes (`src/services/ai.ts` — `aiConfig.systemInstruction`)

### ✅ #7 — Encode double-progression protocol

**Problem:** The prompt says "use e1RM to set targetWeight" but gives no overload protocol.
The AI sets arbitrary weights session-to-session.

**Fix:** Add to system prompt under section 3 (STRICT OUTPUT & TONAL RULES):

```
- Progressive Overload Protocol (MANDATORY): Follow double-progression.
  Step 1: if user hit the TOP of the rep range on ALL sets in the previous session,
  increase targetWeight by 2.5–5kg and reset targetReps to the BOTTOM of the range.
  Step 2: otherwise, keep the same weight and push reps higher within the range.
  Never increase weight and reps simultaneously.
```

---

### ✅ #8 — Enforce compound-before-isolation ordering

**Problem:** No instruction exists on exercise ordering. The AI sometimes recommends isolation
movements before compounds.

**Fix:** Add to section 3:

```
- Exercise Order (MANDATORY): Always order recommendedWorkout compound multi-joint
  movements first (e.g. Squat, Bench Press, Deadlift, Row, OHP), isolation movements last
  (e.g. Curls, Flyes, Lateral Raises). Within each category, order by muscle group priority
  for the session.
```

---

### ✅ #15 — Give the scratchpad a structured template

**Problem:** The scratchpad is unguided free-form text. Chain-of-thought quality improves
significantly with a fixed reasoning scaffold.

**Fix:** Replace the current scratchpad description with:

```
- Scratchpad MUST follow this exact structure before writing coachMessage:
  1. VOLUME: Per muscle — current sets vs. MEV/MAV/MRV landmark.
  2. E1RM: Trend direction per exercise (increasing / plateau / declining).
  3. FATIGUE: shouldDeload flag + reason. ACWR if available.
  4. RECOVERY: Which muscles are recovered (>48h general, >72h Quads/Back/Hamstrings).
  5. WEIGHTS: Explicit calculation — e.g. "80% × 120kg e1RM = 96 → round to 97.5kg".
  6. PLAN: Proposed exercise order with brief rationale.
```

---

### ✅ #16 — Add missing few-shot examples

**Problem:** Both existing examples show the same scenario (below MEV + plateau). Edge cases
are unguided, causing hallucination.

**Fix:** Add these examples to the system prompt after the existing two:

```
EXAMPLE 3 (Deload Week):
User Data: fatigue.shouldDeload=true, reason="Volume increasing 4 consecutive weeks"
Coach Response: {"scratchpad": "Deload triggered. Reduce volume 50-60%, intensity 10-15%.",
  "coachMessage": "Your body has been under consistent load for 4 weeks — time for a planned
  deload. Today we drop intensity and let the nervous system recover. You'll come back stronger.",
  "recommendedWorkout": [{"exerciseName": "Bench Press", "targetSets": 2, "targetReps": "10-12",
  "targetWeight": "55kg", "reasoning": "Deload: 60% of normal volume, 15% weight reduction"}]}

EXAMPLE 4 (New User — No Data):
User Data: exerciseLogs=[], isFirstMessage=true
Coach Response: {"scratchpad": "No history. Cannot calculate e1RM or volume. Use conservative
  starting weights based on fitness level.",
  "coachMessage": "Welcome! Since this is our first session together, we'll start with a
  full-body assessment workout to establish your baselines. Focus on form — not load.",
  "recommendedWorkout": [{"exerciseName": "Squat", "targetSets": 3, "targetReps": "10-12",
  "targetWeight": "bodyweight or empty bar", "reasoning": "Baseline session — no e1RM data yet"}]}

EXAMPLE 5 (Fat Loss Goal):
User Data: fitnessGoal=["lose_fat"], phase="mid-workout"
Coach Response: {"scratchpad": "Fat loss goal. Prioritize metabolic stimulus: higher reps,
  shorter rest, superset to elevate EPOC.",
  "coachMessage": "Keeping rest short and intensity high — this is how we create the metabolic
  demand that burns fat for hours after the gym.",
  "recommendedWorkout": [{"exerciseName": "Goblet Squat", "targetSets": 3, "targetReps": "15-20",
  "targetWeight": "24kg", "supersetId": "A", "reasoning": "High rep superset for fat loss goal"},
  {"exerciseName": "Dumbbell Row", "targetSets": 3, "targetReps": "15-20", "targetWeight": "20kg",
  "supersetId": "A", "reasoning": "Paired compound to maximize metabolic demand"}]}
```

---

### ✅ #17 — Explicit weight calculation formula

**Problem:** The prompt says "typically 70-85% of e1RM" but the AI produces inconsistent
or vague weight targets.

**Fix:** Replace the vague guidance with an explicit lookup table in section 3:

```
- Weight Calculation (MANDATORY):
  Rep range 1–5   → use 85–95% of e1RM (strength focus)
  Rep range 6–12  → use 65–80% of e1RM (hypertrophy)
  Rep range 12–20 → use 50–65% of e1RM (metabolic/endurance)
  Always round to the nearest 2.5kg increment.
  Always provide a single concrete number in targetWeight (e.g. "82.5kg"), never a range.
```

---

### ✅ #9 — Goal-based protocol differentiation

**Problem:** `fitnessGoal` exists in the profile but the prompt handles all goals with
hypertrophy-centric language.

**Fix:** Add to section 1 (CORE RESPONSIBILITIES):

```
- Adapt programming to the user's fitness goal(s):
  build_muscle     → 6–12 rep range, 60–90s rest, progressive overload focus
  lose_fat         → 12–20 rep range, 30–60s rest, supersets preferred, avoid heavy 1–5 rep work
  improve_endurance → 15–25 rep range, circuit format, include cardio machine exercises from equipment list
  increase_mobility → add 1 mobility/stretching movement per session; avoid maximal loading
  general_fitness  → balanced: 1 compound lower, 1 compound upper, 1 isolation, full-body preference
```

---

### ✅ #10 — Add rest periods to recommended workout

**Problem:** `recommendedWorkout` items have no rest period field. Rest is a critical training
variable (hypertrophy: 60–90s, strength: 3–5min).

**Fix (two parts):**

1. Add `restSeconds` to `aiResponseSchema` in `src/services/ai.ts`:
```typescript
restSeconds: {
  type: Type.NUMBER,
  description: "Recommended rest between sets in seconds. 60-90 for hypertrophy, 120-180 for strength, 30-45 for fat loss circuits.",
},
```

2. Add `restSeconds?: number` to the `AiResponseData` interface `recommendedWorkout` items.

3. Add to system prompt section 3:
```
- Prescribe restSeconds for every exercise based on goal + rep range:
  1-5 reps (strength) → 180–300s
  6-12 reps (hypertrophy) → 60–90s
  12-20 reps (fat loss / endurance) → 30–60s
```

---

## Architecture Changes (`src/services/ai.ts`)

### ✅ #18 — Strip scratchpad from conversation history

**Problem:** `buildConversationContents()` stores full assistant JSON responses as history,
including verbose `scratchpad` content. This wastes ~30-50% of context window tokens
across multi-turn sessions.

**Fix:** In `buildConversationContents()`, parse and strip `scratchpad` from stored assistant
messages before adding them to the conversation:

```typescript
// When adding assistant messages to history, strip scratchpad to save context
const strippedContent = (() => {
  try {
    const parsed = JSON.parse(msg.content);
    const { scratchpad: _, ...rest } = parsed;
    return JSON.stringify(rest);
  } catch {
    return msg.content;
  }
})();
```

---

### ✅ #20 — Set explicit temperature for structured output

**Problem:** `aiConfig` sets no `temperature` or `topP`. The model defaults to its own
sampling parameters, which may be too high for a task requiring precise numerical reasoning.

**Fix:** Add to `aiConfig` in `src/services/ai.ts`:

```typescript
export const aiConfig: GenerateContentConfig = {
  responseMimeType: "application/json",
  responseSchema: aiResponseSchema,
  temperature: 0.4,   // Low: reduces hallucination for numeric targets (weights, reps)
  topP: 0.85,
  systemInstruction: `...`,
};
```

---

## `trainingScience.ts` Calculation Improvements

### ✅ #3 — Add `weeklyTonnage` to fatigue tracking

**File:** `src/services/trainingScience.ts` — `calculateFatigueInsight()` and `FatigueInsight`

**Problem:** `weeklyTotalSets` counts all sets equally. A 4×10@120kg set and a 4×10@40kg set
both count as 4. Fatigue is load-dependent.

**Fix:** Add `weeklyTonnage: number[]` to `FatigueInsight` (sum of weight×reps per set per week):

```typescript
export interface FatigueInsight {
  shouldDeload: boolean;
  reason?: string;
  weeklyTotalSets: number[];
  weeklyTonnage: number[];  // ADD: sum of weight × reps per week
}
```

Compute alongside `weeklyTotalSets` in `calculateFatigueInsight()`:

```typescript
const weekTonnage = weekLogs.reduce((sum, l) => {
  return sum + (l.weight ?? 0) * (l.reps ?? 0);
}, 0);
weeklyTonnage.push(weekTonnage);
```

Update the system prompt to reference tonnage when available:
```
- 'fatigue.weeklyTonnage': Total kg moved per week (weight × reps). Use this alongside
  weeklyTotalSets for load-aware fatigue assessment. A 20% week-over-week tonnage jump is a
  red flag even if set count is stable.
```

---

### [🔴] #4 — Add Acute:Chronic Workload Ratio (ACWR)

**File:** `src/services/trainingScience.ts` — new export function + `TrainingInsights`

**Problem:** No load-management safeguard exists. ACWR (acute load / chronic load) is the
sports science gold standard for overuse injury prevention. Sweet spot: 0.8–1.3. Above 1.5
= high injury risk.

**Fix:** Add to `TrainingInsights`:
```typescript
export interface TrainingInsights {
  muscleGroups: Partial<Record<MuscleGroup, MuscleGroupInsight>>;
  e1rm: Record<string, ExerciseE1RM>;
  fatigue: FatigueInsight;
  phase: SystemicPhase;
  acwr: number | null;  // ADD: Acute:Chronic Workload Ratio
}
```

Compute in `calculateTrainingInsights()`:
```typescript
// ACWR: (last 7 days tonnage) / (last 28 days tonnage / 4)
function computeACWR(logs: ExerciseLog[], targetDate: Date): number | null {
  const msPerDay = 86400000;
  const now = targetDate.getTime();

  const acuteLogs = logs.filter(l => now - l.loggedAt.getTime() <= 7 * msPerDay);
  const chronicLogs = logs.filter(l => now - l.loggedAt.getTime() <= 28 * msPerDay);

  const acuteLoad = acuteLogs.reduce((s, l) => s + (l.weight ?? 0) * (l.reps ?? 0), 0);
  const chronicLoad = chronicLogs.reduce((s, l) => s + (l.weight ?? 0) * (l.reps ?? 0), 0);
  const chronicWeekly = chronicLoad / 4;

  if (chronicWeekly === 0) return null;
  return Math.round((acuteLoad / chronicWeekly) * 100) / 100;
}
```

Update system prompt section 2:
```
- 'acwr': Acute:Chronic Workload Ratio. Safe zone: 0.8–1.3. If > 1.3, reduce today's volume
  by 15–20%. If > 1.5, strongly recommend rest. If < 0.8, the athlete is detraining.
```

---

### ✅ #5 — Make deload threshold relative, not absolute

**File:** `src/services/trainingScience.ts` — `calculateFatigueInsight()`

**Problem:** `weeklyTotalSets[3]! > 40` is a hardcoded absolute threshold. An advanced
athlete may train 60+ sets/week comfortably. The trigger should fire relative to the
athlete's established baseline.

**Fix:** Replace the absolute check with a relative one (25% above rolling 3-week average):

```typescript
// Instead of: weeklyTotalSets[3]! > 40
// Use: current week > 125% of prior 3-week average
const priorAvg =
  (weeklyTotalSets[0]! + weeklyTotalSets[1]! + weeklyTotalSets[2]!) / 3;
const volumeSpike = priorAvg > 0 && weeklyTotalSets[3]! > priorAvg * 1.25;

if (volumeIncreasing && volumeSpike) { ... }
```

---

### [🟠] #6 — Add mesocycle week counter

**File:** `src/services/trainingScience.ts` + `TrainingInsights`

**Problem:** The AI has no concept of where the user is in a mesocycle (week 1 = easy ramp,
week 4 = peak before deload). This prevents structured periodization.

**Fix:** Add `mesocycleWeek: number` to `TrainingInsights`, calculated as weeks since the
last deload (or since first log if no deload detected):

```typescript
export interface TrainingInsights {
  // ... existing fields
  mesocycleWeek: number;  // 1 = first week after deload/start
}
```

Add to system prompt section 2:
```
- 'mesocycleWeek': How many weeks into the current training block (since last deload).
  Typical mesocycle = 4 weeks. Week 1: conservative volume (MEV). Week 2-3: progressive
  increase. Week 4: peak volume (approaching MAV). Week 5+: deload recommended.
```

---

### ✅ #11 — Plateau → exercise variation directive

**File:** `src/services/ai.ts` — system prompt

**Problem:** When `e1rm.plateau = true` for an exercise that has appeared in 4+ consecutive
sessions, the AI should suggest a mechanical variant, not just the same exercise again.

**Fix:** Add to system prompt section 2 under e1rm guidance:

```
- If an exercise shows plateau=true AND appears in the last 4 session logs, SWITCH to a
  mechanical variant for that movement pattern:
  Bench Press → Incline Dumbbell Press or Cable Flyes
  Squat → Bulgarian Split Squat or Leg Press
  Pull-Ups → Lat Pulldown or Chest-Supported Row
  Overhead Press → Dumbbell Shoulder Press or Arnold Press
  Deadlift → Romanian Deadlift or Trap Bar Deadlift
```

---

### ✅ #14 — Pre-compute recovery readiness per muscle

**File:** `src/services/trainingScience.ts` — `MuscleGroupInsight`

**Problem:** `hoursSinceLastTrained` is provided but the AI must manually decide if a muscle
is recovered. Pre-computing a `recoveryReady` boolean reduces reasoning errors.

**Fix:** Add `recoveryReady: boolean` to `MuscleGroupInsight`:

```typescript
export interface MuscleGroupInsight {
  sets: number;
  landmark: VolumeLandmark;
  frequencyPerWeek: number;
  hoursSinceLastTrained: number | null;
  recoveryReady: boolean;  // ADD: true if hours >= minimum recovery window
}
```

Recovery windows:
```typescript
const RECOVERY_HOURS: Record<MuscleGroup, number> = {
  Chest: 48, Back: 72, Quads: 72, Hamstrings: 72, Shoulders: 48,
  Biceps: 48, Triceps: 48, Abs: 24, Calves: 24, Glutes: 48,
};
```

Compute in `calculateMuscleGroupInsights()`:
```typescript
const minRecovery = RECOVERY_HOURS[group];
const recoveryReady = hoursSince === null ? true : hoursSince >= minRecovery;
result[group] = { ..., recoveryReady };
```

---

### [🟡] #1 — Ensemble e1RM formula

**File:** `src/services/trainingScience.ts` — `calculateE1RM()`

**Problem:** Epley formula alone overestimates at rep ranges 12–20. A weighted blend of
Epley + Brzycki would be more accurate across all rep ranges.

**Fix:**

```typescript
export function calculateE1RM(weight: number, reps: number, rpe?: number): number {
  if (reps <= 0 || weight <= 0) return 0;
  if (reps > 30) return 0;

  const effectiveReps = reps + (10 - (rpe ?? 10));
  if (effectiveReps === 1) return weight;

  // Ensemble: Epley (better for low reps) + Brzycki (better for high reps)
  const epley = weight * (1 + effectiveReps / 30);
  const brzycki = weight * (36 / (37 - effectiveReps));
  
  // Weight blend: Epley dominates below 10 reps, Brzycki above
  const t = Math.min(effectiveReps / 20, 1); // 0 at low reps, 1 at 20+ reps
  const blended = epley * (1 - t) + brzycki * t;

  return Math.round(blended * 10) / 10;
}
```

Note: this changes e1RM values and will affect existing tests in `trainingScience.test.ts`.
Update test expectations accordingly.

---

### ✅ #2 — Fix `Glutes.mev = 0`

**File:** `src/services/trainingScience.ts` — `VOLUME_LANDMARKS`

**Problem:** `Glutes: { mev: 0, ... }` means insufficient glute volume is never flagged.
Research consensus is MEV ≥ 4 sets/week for hypertrophy.

**Fix (one line):**
```typescript
// Before:
Glutes: { mev: 0, mavLow: 4, mavHigh: 12, mrv: 16 },

// After:
Glutes: { mev: 4, mavLow: 6, mavHigh: 12, mrv: 16 },
```

---

## Implementation Order (recommended)

1. ✅ **Quick wins (system prompt only, zero test impact):** *(all done)*
   #2 (Glutes MEV), #7 (double progression), #8 (exercise order), #17 (weight formula), #15 (scratchpad template), #16 (few-shot examples)

2. ✅ **Low-risk architecture:** *(all done)*
   #18 (strip scratchpad from history), #20 (set temperature)

3. ✅ **Medium complexity (new fields + prompt updates):** *(all done)*
   #9 (goal protocols), #10 (rest periods schema), #14 (recovery readiness), #5 (relative deload threshold)

4. **Higher complexity (new calculations + tests required):**
   #3 (weekly tonnage), #4 (ACWR), #6 (mesocycle week), #11 (plateau variation), #1 (ensemble e1RM)
