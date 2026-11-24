# 16: Cross-Stepper Metric Inputs & Inline Step Controls for Set Logging

**Status:** done  
**Labels:** `presentation`, `done`

---

## Problem Statement

When logging sets in the set-logging sheet, athletes frequently get surprised when tapping the `+` or `-` buttons on the weight field. Today, the active step size is controlled by a small cycling badge (`±2.5` cycling blindly through `2.5 → 5 → 0.5`) tucked into the label corner, while the `+` and `-` buttons themselves show only bare icons without indicating the step size. As a result, athletes forget which step size is currently active and accidentally jump by an unwanted amount (such as `+5 kg` when adjusting from `42.5 kg`).

In addition, three practical friction points slow down set logging on mobile screens:

1. A **`1 kg` step size is missing** (only `0.5`, `2.5`, and `5` exist), which is frequently needed for machines, pin-loaded stacks, and smaller load adjustments.
2. **Rounding off fractional or off-grid values** (e.g., smoothing `42.5 kg` to `42` or `43`, or `1230 m` to `1250 m`) currently requires multiple taps and manual step-size switching.
3. The side-by-side 50/50 mobile layout leaves too little horizontal space inside the weight, distance, and duration fields to display explicit step labels alongside the numeric value.

## Solution

Replace the bare horizontal steppers in the set-logging sheet with a **Cross-Stepper** layout paired with **compact inline step-size mini-pills** directly in each field's label row:

- **Zero-surprise `+step` / `-step` controls:** The increment button sits above the editable numeric value and the decrement button sits below it, spanning the full width of the field and displaying the exact active step (e.g., `+1` / `-1`, `+2.5` / `-2.5`, `+50` / `-50`). Tapping the center value still opens the decimal keyboard for large jumps.
- **Contextual round-down / round-up buttons:** Whenever the current value is not already an exact multiple of the active step size, a round-down button (`↓<lower>`) appears to the left of the value and a round-up button (`↑<upper>`) appears to the right, snapping to the nearest multiple of the active step in one tap without shifting the vertical layout. When the value is already on-grid or empty, the side buttons hide cleanly.
- **1-tap inline step & unit selection:** Replace blind cycling with three compact, directly tappable step pills right inside the label row — `[0.5 | 1 | 2.5]` for weight (deterministic default `1 kg`), plus consistent unit-tailored 3-step pills alongside the unit switch for distance (`m`: `10 | 50 | 100`, `km`: `0.1 | 0.5 | 1`) and duration (`min`: `1 | 5 | 10`, `sec`: `5 | 15 | 30`).
- **Ergonomic mobile proportions:** Give Reps 1/3 width and Weight 2/3 width on the primary row, and render optional Distance and Duration fields full-width stacked below so all inline controls and 4-digit rounding targets remain spacious and thumb-friendly on 375 px mobile screens.

## User Stories

1. As an athlete logging a set, I want the increment button above the weight field to display the exact active step (e.g., `+1` or `+2.5`), so that I immediately know what value change will happen before tapping.
2. As an athlete logging a set, I want the decrement button below the weight field to display the exact active step (e.g., `-1` or `-2.5`), so that I am never surprised when lowering load.
3. As an athlete logging a set, I want `+` positioned above the number and `-` positioned below the number, so that the spatial direction naturally matches increasing and decreasing load while maximizing thumb target width.
4. As an athlete logging a set, I want to choose between exactly three weight step sizes (`0.5`, `1`, and `2.5` kg) via inline pills in the label row, so that I can switch to the exact increment I need in one tap instead of cycling blindly.
5. As an athlete using pin-loaded machines or dumbbells, I want a `1 kg` weight step size available directly, so that I no longer have to approximate 1 kg adjustments with multiple `0.5 kg` taps.
6. As an athlete logging a set, I want the `5 kg` weight step removed from the selector, so that the inline control stays compact and uncluttered while `+5 kg` remains two quick taps on `+2.5`.
7. As an athlete switching to a different exercise, I want the weight step size to always reset deterministically to `1 kg`, so that the stepper never unexpectedly carries over a larger step size or guesses a surprising step from history.
8. As an athlete logging consecutive sets of the same exercise, I want my manually selected weight step size (e.g., `2.5 kg`) to stay active across sets of that exercise, so that I do not have to re-select it on every set.
9. As an athlete facing a fractional weight like `42.5 kg` while `1 kg` is active, I want contextual round-down (`↓42`) and round-up (`↑43`) buttons to appear to the left and right of the value, so that I can smooth the number to a clean step multiple in one tap.
10. As an athlete facing an off-grid weight like `42.3 kg` while `2.5 kg` is active, I want contextual round-down (`↓40`) and round-up (`↑42.5`) buttons to appear to the left and right of the value, so that I can snap to the nearest `2.5 kg` grid increment in one tap.
11. As an athlete using a cable machine with offset increments (e.g., `12.5 kg` with `1 kg` step), I want the top `+1` and bottom `-1` buttons to still add or subtract the exact step (`13.5` / `11.5`) without silently snapping, so that I can choose explicitly between exact stepping and rounding.
12. As an athlete whose current value already lies cleanly on the active step grid (e.g., `42.5 kg` with `2.5 kg` step, or `43 kg` with `1 kg` step), I want the left and right rounding buttons to stay hidden, so that the input remains visually calm and the number gets full center width.
13. As an athlete tapping a rounding button to snap an off-grid value onto the grid, I want the top `+step` and bottom `-step` buttons to remain at the exact same vertical position with zero layout shift, so that follow-up taps never hit the wrong control.
14. As an athlete starting a new exercise with an empty weight field, I want the rounding buttons to remain hidden until a numeric value is entered, so that I never see meaningless rounding targets.
15. As an athlete decrementing or rounding down near zero (e.g., `0.5 kg` with `1 kg` step), I want values to clamp cleanly at `0` and never become negative, so that invalid negative loads cannot be logged.
16. As an athlete making large weight changes (e.g., `40 kg` to `100 kg`), I want tapping the center numeric value to still allow direct decimal keyboard entry, so that big jumps stay fast.
17. As an athlete on a narrow mobile phone (375 px width), I want Reps to occupy 1/3 width and Weight to occupy 2/3 width on the first metric row, so that the weight cross-stepper, side rounding buttons, and `[0.5 | 1 | 2.5]` pills fit comfortably without cramped tap targets.
18. As an athlete logging repetitions, I want the Reps field to use the same vertical `+1` / value / `-1` cross-stepper style (without step pills or side rounding buttons), so that Reps and Weight align visually at the exact same height.
19. As an athlete logging cardio or conditioning exercises, I want the optional Distance field to use the same cross-stepper pattern with full-width layout, so that 4-digit values and rounding targets (`↓1200 | 1230 | ↑1250`) are easy to read and tap.
20. As an athlete logging Distance in meters, I want inline step pills `[10 | 50 | 100]` (defaulting to `50`) alongside a `[m | km]` unit switch in the label row, so that I can adjust short drills or longer distances precisely in one tap.
21. As an athlete logging Distance in kilometers, I want switching from `m` to `km` to convert the displayed value and automatically switch the inline step pills to `[0.1 | 0.5 | 1]` (defaulting to `0.5`), so that step sizes always match the active unit.
22. As an athlete logging Distance in kilometers with a value like `1.23 km` and step `0.1`, I want the contextual rounding buttons to show `↓1.2` and `↑1.3` accurately without floating-point artifacts, so that decimal distances round cleanly.
23. As an athlete logging Duration, I want the optional Duration field to use the same full-width cross-stepper pattern with a `[min | sec]` unit switch and tailored inline step pills (`min`: `[1 | 5 | 10]` defaulting to `1`; `sec`: `[5 | 15 | 30]` defaulting to `5`), so that time adjustments follow the exact same interaction model as weight and distance.
24. As an athlete logging Duration in seconds (e.g., `42 s` with `5 s` step), I want contextual rounding buttons `↓40` and `↑45` to appear on the left and right, so that I can snap irregular stopwatch times to clean 5-second marks in one tap.
25. As an athlete saving a set after using Distance or Duration unit switches and step pills, I want the persisted `ExerciseLog` to continue storing canonical meters and canonical minutes, so that downstream `trainingSummary` and `trainingInsights` calculations remain unchanged.
26. As a German- or English-speaking athlete, I want step labels, rounding targets, and ARIA labels to respect my active locale formatting (e.g., comma vs. dot decimals) and language, so that the controls read naturally and stay accessible.
27. As a new athlete completing onboarding in the profile setup wizard, I want the age, height, and bodyweight numeric fields to keep their compact horizontal layout without cross-stepper or rounding buttons, so that the onboarding screen stays concise.

## Implementation Decisions

- **Layer Ownership & Architecture Boundaries:** All changes remain strictly within the presentation layer (`shared/presentation` for the reusable numeric stepper component and `trainingLogs/presentation` for the set-logging sheet, plus presentation i18n strings). No `domain/`, `application/`, or `infrastructure/` layers, Google Sheets schemas, or API contracts are modified. All DDD boundary rules enforced by the architecture boundary test suite remain intact.
- **Reusable `UiNumberField` Interface Extension:**
  - Extend the shared `UiNumberField` component (backed by Reka UI's `NumberField` primitives) with an optional `layout` prop supporting `"horizontal"` (default) and `"cross"`.
  - Keep `"horizontal"` behavior identical to today so the onboarding `WizardFlow` view remains completely unaffected.
  - In `"cross"` layout:
    - Render a 3-row container of fixed vertical height: top full-width increment button (`+<formattedStep>`), middle row containing the decimal `NumberFieldInput` flanked conditionally by round-down (`↓<formattedLower>`) and round-up (`↑<formattedUpper>`) buttons, and bottom full-width decrement button (`-<formattedStep>`).
    - Keep `stepSnapping` set to `false` on Reka UI's root so top/bottom `+step` and `-step` buttons always perform exact arithmetic.
    - Compute off-grid status and nearest step multiples (`floorToStep` and `ceilToStep`) using floating-point-safe scaling (e.g., integer scaling derived from decimal precision or epsilon-safe division) so binary floating-point drift on steps like `0.1` or `0.5` never produces false rounding buttons or ugly decimals like `1.3000000000000003`.
    - Hide both side rounding buttons whenever `modelValue` is `null`/`undefined`, `step <= 0`, or the value is already on-grid. Clamp `floorToStep` to `min` (when defined) and `ceilToStep` to `max` (when defined); suppress an individual rounding button if its clamped target equals the current value.
    - Format button labels (`+<step>`, `-<step>`, `↓<lower>`, `↑<upper>`) using the active locale (`bcp47Locale`) and preserve haptic feedback and focus/disabled accessibility states.
- **Inline Step & Unit Controls in `LogExerciseSheet`:**
  - Replace the single cycling `±` button on Weight and the combined unit/step toggle buttons on Distance and Duration with compact inline segmented mini-pills in the `#label-trailing` slot (reusing existing design-token pill styling with `rounded-lg`, `text-micro`, `active:scale-95`, and `duration-200`).
  - Configure static step option sets and defaults:
    - Weight (kg): options `[0.5, 1, 2.5]`, default `1`.
    - Distance (`m`): options `[10, 50, 100]`, default `50`; Distance (`km`): options `[0.1, 0.5, 1]`, default `0.5`.
    - Duration (`min`): options `[1, 5, 10]`, default `1`; Duration (`sec`): options `[5, 15, 30]`, default `5`.
  - Switching Distance (`m ↔ km`) or Duration (`min ↔ sec`) via the inline unit pills converts the displayed metric value (preserving existing canonical save logic: meters for distance, minutes for duration) and resets that metric's active step to the newly selected unit's default.
  - Switching exercises (or opening the sheet for a different exercise) resets `weightStep` deterministically to `1`, and resets distance/duration steps to the inferred unit's default. Re-opening for the same exercise preserves the chosen step within the current session only (no `localStorage` persistence, no history-based inference).
- **Responsive Grid Proportions in `LogExerciseSheet`:**
  - Update the primary metrics row from an equal 2-column split to a 1:2 proportional split (`Reps` 1/3 width, `Weight` 2/3 width) so `Reps` (`+1` / value / `-1`) stays compact while `Weight` comfortably accommodates both the cross-stepper side buttons and the `[0.5 | 1 | 2.5]` label-row pills on 375 px mobile screens.
  - Render the expandable `Distance` and `Duration` fields stacked at full width (1 column each) so the label row comfortably holds the metric label, unit switch (`[m | km]` or `[min | sec]`), and 3-step pills with generous spacing, and 4-digit rounding buttons (`↓1200` / `↑1250`) never crowd the center input.
- **Internationalization & Accessibility:**
  - Add/update German and English i18n keys for step selection, unit selection, and round-down / round-up accessible ARIA labels (removing obsolete cycle-only ARIA strings where replaced).
  - Ensure all interactive controls carry explicit `aria-label` or `aria-pressed` semantics and conform strictly to Gainz AI Design Tokens (`rounded-xl`, `rounded-lg`, `hover:bg-white/10`, `active:bg-white/15`, `active:scale-95`, `duration-200`, `focus-visible:ring-2 focus-visible:ring-primary`, `tabular-nums`, no `font-normal`).

## Testing Decisions

- **What Makes a Good Test:** Tests must exercise external, user-observable behavior through public component seams — clicking rendered buttons/pills, inspecting visible labels/values, and asserting persisted `ExerciseLog` payloads — rather than reading internal component refs, private helper functions, or CSS class details.
- **Primary Seam (Existing — Highest Seam): `LogExerciseSheet` component test suite**
  - Prior art: existing `LogExerciseSheet` Vitest suite, which already mounts the real `UiNumberField` component alongside mocked stores and bottom-sheet wrapper.
  - Behavior to verify:
    - Weight defaults to step `1` with inline step pills `[0.5, 1, 2.5]` and explicit `+1` / `-1` labels; tapping `2.5` or `0.5` updates the step labels immediately in one tap.
    - Weight resets deterministically to `1` when switching to a different exercise, and retains the chosen step when reopening for the same exercise.
    - Off-grid values (e.g., `42.5` with step `1`, `1230 m` with step `50`, `42 s` with step `5`) render contextual round-down and round-up buttons (`↓42` / `↑43`, `↓1200` / `↑1250`, `↓40` / `↑45`); tapping them snaps cleanly onto the grid and hides the rounding buttons; tapping `+step`/`-step` performs exact arithmetic (`42.5 + 1 = 43.5`).
    - Distance and Duration unit pills (`m ↔ km`, `min ↔ sec`) convert displayed values, switch available step pills and defaults, and still persist canonical meters and minutes in the saved `ExerciseLog`.
- **Secondary Seam (New — Shared Component Contract): `UiNumberField` component test suite**
  - Prior art: existing shared UI Vitest suites (`UiDropdownMenu`, `UiProgressionLine`, `UiTelemetryLoader`).
  - Behavior to verify:
    - Default `layout="horizontal"` renders standard icon decrement/increment controls without cross-stepper or rounding buttons (protecting the onboarding `WizardFlow` view).
    - `layout="cross"` handles floating-point decimal edge cases accurately (e.g., `1.23` with step `0.1` shows `↓1.2` / `↑1.3`, `1.2` with step `0.1` shows no rounding buttons), hides rounding buttons when `modelValue` is `null`, and clamps cleanly at `min = 0` without allowing negative values.
- **Architecture Boundary Guard (Existing):** Run the existing architecture boundary test suite to guarantee all DDD layer rules remain green.

## Out of Scope

- Persisting step-size preferences per exercise in `localStorage` or syncing them to Google Sheets.
- Automatically inferring default step sizes from historical `ExerciseLog` entries or equipment keywords.
- Adding `5 kg` or `1.25 kg` weight increments (only `0.5`, `1`, and `2.5` kg are included).
- Changing the onboarding `WizardFlow` numeric fields away from their horizontal layout.
- Alternative input widgets such as dropdown lists, vertical wheel pickers, or horizontal ruler/dial sliders.
- Any changes to domain aggregates, `GLOSSARY.md` definitions, database/Sheets schemas, or AI coaching prompts.

## Further Notes

- **Domain Modeling & ADR Check:** Because step selection is purely deterministic presentation state with zero persisted domain model or cross-context contract, no new `GLOSSARY.md` entry and no ADR are required (easily reversible UI decision).
- **Floating-Point Precision Note:** JavaScript's `%` operator on decimals (e.g., `0.3 % 0.1` or `1.2 % 0.1`) produces non-zero remainders due to IEEE-754 representation. The cross-stepper's on-grid check and `floorToStep` / `ceilToStep` arithmetic must normalize decimal precision before evaluating remainders so valid multiples like `0.3`, `1.2`, or `42.5` are always recognized as on-grid.
- **Mobile Ergonomics:** On 375 px mobile viewports (327 px inner content width), giving Weight 2/3 width (~195 px) fits `WEIGHT (KG)` plus `[0.5 | 1 | 2.5]` cleanly on one label row, and stacking Distance/Duration at full width (327 px) leaves >100 px of breathing room between the label, unit switch, and 3-step pills.
