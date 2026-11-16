# 13: Athletic Rank Terminology & Migration Button Copy Alignment

**What to build:** Replace lingering anime/fantasy rank titles in progression leveling and fix stale plan-linking button labels on the exercise weight migration screen so all copy matches Gainz AI's grounded athletic terminology.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

---

## Problem Statement

Two user-facing text violations remain:

1. **Fantasy rank copy (`leveling.ts`):** `TITLES` still contains an `"Anime-inspired rank titles"` comment and fantasy strings (`"Demon King"`, `"Legendary Slayer"`, `"Thunder God"`, `"The dragon within has awakened"`), violating the repository's strict "Athletic & Scientific Nüchternheit" rule in `AGENTS.md`.
2. **Wrong migration labels (`ExerciseMigration.vue`):** When `activeExerciseName === candidate.exerciseName`, action buttons display `"Keep Unlinked"` / `"Convert to AI Coach"` from an obsolete feature instead of clear weight-migration wording.

## Acceptance Criteria

- [ ] `TITLES` and comments in `sharedKernel/application/leveling.ts` contain zero anime, fantasy, or RPG roleplay terminology (`Demon King`, `Slayer`, `God`, `Dragon`, `Awakened`, etc.) and use concise athletic progression terminology while preserving existing level thresholds and progression semantics.
- [ ] All leveling and milestone tests/scripts referencing title names (`leveling.milestones.test.ts`, `leveling.test.ts`, `simulate_leveling.ts`, any UI specs) are updated in lockstep.
- [ ] Action buttons in `ExerciseMigration.vue` accurately describe the exercise weight migration action rather than showing `"Keep Unlinked"` / `"Convert to AI Coach"`.
- [ ] All unit tests, Biome lint/format checks, and type-checks pass.

## Testing Decisions

- Verify zero anime/fantasy terms match across `src/modules/sharedKernel/application/leveling.ts` and confirm `leveling.milestones.test.ts` + `ExerciseMigration` tests (add one if absent) pass cleanly.
