# 12: Stable Workout Card Keys on Home Tab

**What to build:** Generate deterministic group IDs in `groupWorkout` so logging sets on the Today's Workout view patches exercise cards in place instead of destroying and remounting DOM nodes via random UUID keys.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

---

## Problem Statement

Whenever reactive dependencies of `allWorkoutGroups` update (such as logging or editing a set), `groupWorkout` assigns `id: crypto.randomUUID()` to each non-superset exercise group. `HomeTab.vue` binds `:key="group.id"` on both the sticky segmented stepper buttons and the swipe gallery cards, causing Vue to unmount and recreate unchanged `WorkoutExerciseCard` components on every set save.

## Acceptance Criteria

- [ ] `groupWorkout` assigns deterministic, stable group IDs derived from the group content and position (e.g., superset identifier or normalized exercise name/index) rather than `crypto.randomUUID()`.
- [ ] Calling `groupWorkout` twice with identical exercise sequences produces identical `group.id` values.
- [ ] Logging a set on the Home tab updates the target card's progress bar, logged sets list, and stepper dot cleanly without remounting cards or resetting child scroll/UI state.

## Testing Decisions

- Add a unit test on `groupWorkout` verifying identical calls yield identical `id` values (plus unique keys even if an exercise appears twice in the same workout).
- Add or extend a Vue component / view-model test confirming card elements keep identity when logged sets update.
