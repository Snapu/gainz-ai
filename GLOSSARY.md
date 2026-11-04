# Gainz AI – Domain Glossary & Ubiquitous Language

This glossary establishes the **Ubiquitous Language** for Gainz AI across all Bounded Contexts. All agents, specifications, tests, and code implementations must adhere to these definitions and naming conventions.

---

## 1. Bounded Contexts (`src/modules/`)

| Bounded Context        | Responsibility                                                                                   | Key Domain Aggregates & Types                                                            |
| :--------------------- | :----------------------------------------------------------------------------------------------- | :--------------------------------------------------------------------------------------- |
| **`aiCoach`**          | AI-driven mesocycle planning, workout generation, exercise classification, and coaching advice.  | `TrainingPlan`, `PlannedSession`, `PlannedExercise`, `CoachingAdvice`, `CoachingMode`    |
| **`trainingInsights`** | Exercise science calculations: fatigue detection, ACWR, e1RM, volume landmarks, rest intervals.  | `VolumeLandmarks`, `ACWR`, `ExerciseE1RM`, `FatigueDetectionResult`, `ExerciseMuscleMap` |
| **`trainingLogs`**     | Workout recording, set logging (weight, reps, RIR), and exercise history.                        | `ExerciseLog`, `WorkoutSession`, `LoggedSet`                                             |
| **`trainingSummary`**  | Aggregated session stats, weekly training tonnage, and volume rollups.                           | `TrainingSummary`, `WeeklySummary`                                                       |
| **`deload`**           | Fatigue-driven deload lifecycles, volume reduction recommendations, and snapshot history.        | `DeloadPhase`, `DeloadSnapshot`                                                          |
| **`events`**           | Real-world life and health events affecting training (sickness, travel, injury).                 | `HealthEvent`, `ScheduleEvent`                                                           |
| **`profile`**          | Athlete biometrics, lifting experience, equipment access, API keys, and leveling.                | `AthleteProfile`, `AthleteLevel`, `EquipmentAccess`                                      |
| **`sharedKernel`**     | Cross-domain domain primitives, muscle group definitions, fatigue triggers, date/time utils.     | `MuscleGroup`, `FatigueTriggerId`, `DateIsoString`                                       |
| **`platform`**         | Technical infrastructure adapters: Google Sheets sync, LocalStorage, rest timer, network status. | `SheetsClient`, `OfflineQueue`, `RestTimer`                                              |
| **`auth`**             | Google OAuth authentication, session tokens, and identity state.                                 | `AuthSession`, `UserIdentity`                                                            |
| **`migration`**        | Schema upcasters and historical data migrations.                                                 | `SchemaMigration`, `LegacyExerciseUpcaster`                                              |

---

## 2. Sports Science & Training Primitives

### `TrainingPlan`

- **Definition**: The central Aggregate Root in `aiCoach`. Represents a structured mesocycle consisting of 1 to 4 microcycle weeks (`cycleWeeks`) and scheduled sessions (`PlannedSession[]`).
- **Invariants**:
  - `cycleWeeks` is constrained between 1 and 4 weeks.
  - Days of the week (`dayOfWeek`) are normalized (0–6) without duplicate scheduling on the same day within a single week.
  - Next session determination and cycle completion are methods on the aggregate, never recomputed in UI layers.

### `VolumeLandmarks` (Dr. Mike Israetel Hypertrophy Model)

Scientific set thresholds per muscle group over a rolling weekly window:
- **`MEV` (Minimum Effective Volume)**: The minimum weekly direct/effective sets required to stimulate muscle hypertrophy.
- **`MAV` (Maximum Adaptive Volume)**: The optimal volume range (`mavLow` to `mavHigh`) yielding the greatest hypertrophic gains.
- **`MRV` (Maximum Recoverable Volume)**: The upper limit of volume from which an athlete can recover. Exceeding MRV results in accumulated systemic fatigue and performance regression.
- **Landmark States**:
  - `detraining`: Weekly volume is zero or near zero.
  - `below_MEV`: Insufficient volume for muscle growth.
  - `at_MEV`: Maintenance to minimal growth threshold.
  - `at_MAV`: Optimal hypertrophy corridor.
  - `approaching_MRV`: High fatigue accumulation; deload approaching.
  - `above_MRV`: Overreaching / overtraining state requiring immediate deload.

### `ACWR` (Acute:Chronic Workload Ratio)

- **Definition**: Ratio of acute training workload (fatigue, 7-day EWMA) to chronic training workload (fitness, 28-day EWMA).
- **Sweet Spot**: Values between **0.8 and 1.3** denote safe, progressive overload.
- **Danger Zone**: Values **$\ge 1.5$** trigger injury risk and fatigue alerts.

### `EWMA` (Exponentially Weighted Moving Average)

- **Definition**: Statistical smoothing method applied to daily sets and tonnage.
- **Purpose**: Prevents single-day boundary spikes or schedule shifts (e.g. moving a session from Sunday to Monday) from creating artificial volume anomalies.

### `e1RM` (Estimated 1-Repetition Maximum)

- **Definition**: The calculated maximal load an athlete could lift for a single rep with good form.
- **Formulas**: Computed using validated models (Brzycki, Epley, Wathan) based on logged weight, reps completed, and `RIR`.

### `RIR` (Reps in Reserve)

- **Definition**: The number of additional repetitions an athlete could have performed before reaching technical failure (0 RIR = failure, 1 RIR = 1 rep left in tank, etc.).

### `FatigueTrigger`

- **Definition**: Deterministic signals that flag excessive fatigue accumulation:
  - `volumeSpike`: Weekly set volume increased $>30\%$ week-over-week.
  - `tonnageSpike`: Total weekly tonnage (weight $\times$ reps) escalated sharply.
  - `performanceDecline`: Sustained drops in e1RM across primary compound lifts.
  - `volumeIncreasing`: Consecutive weeks of volume increases approaching MRV.

### `DeloadPhase`

- **Definition**: A planned 1-week recovery period designed to dissipate systemic fatigue while maintaining adaptations.
- **Lifecycle**: `normal` $\to$ `deload` $\to$ `recovery` $\to$ `return`.
- **Standard Protocol**: Volume reduced by $\approx 50\%$, intensity (load) reduced by $\approx 20\text{--}30\%$.

### `Superset`

- **Definition**: Two or more exercises performed back-to-back with zero or minimal rest between them. Represented visually in training plan tables with continuous vertical accent indicator lines.

---

## 3. Architecture & Codebase Concepts

### Strict DDD Layering (4 Layers)

1. **`domain/`**: Pure business logic, entities, value objects, domain rules. **Zero** external, infrastructure, or UI dependencies.
2. **`application/`**: Use cases, ports, and orchestrators. Coordinates domain objects and returns `neverthrow` Result types.
3. **`infrastructure/`**: Adapters for external I/O (Google Sheets, GenAI SDK, LocalStorage). Implements Anti-Corruption Layers (ACL).
4. **`presentation/`**: Pinia stores, view-model composables (`use*ViewModel`), and Vue components. Top-level tab views delegate strictly to view-models.

### Layer Facades

- All imports across modules and layers must pass through barrel index files (`@/modules/{module}/{layer}`). Deep imports into module internals (e.g. `@/modules/aiCoach/domain/trainingPlan`) are strictly banned by `architecture.boundaries.test.ts`.

### Anti-Corruption Layer (ACL)

- An infrastructure translation layer (built with `Zod` schemas) that validates and transforms raw external vendor data (Google Sheets rows, Gemini AI JSON responses) into trusted domain entities before entering the application.

### Seam

- The public boundary where a module's behavior is tested without reaching into internal private details. Tests are written against seams, never internal state.

### `neverthrow` Flow

- Functional error handling primitives (`Result<T, E>`, `ResultAsync<T, E>`, `ok`, `err`). Used across application and infrastructure layers to eliminate thrown runtime exceptions and force compile-time error handling.
