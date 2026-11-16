# 04: Profile Workout Duration Persistence & Restoration

**What to build:** Persist the athlete's configured workout session duration (`workoutDurationMinutes`) across Google Sheets saves and reloads so onboarding choices survive restarts, count as valid profile data, and reach the AI coach prompt as intended.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

---

## Problem Statement

The onboarding/profile setup wizard edits `workoutDurationMinutes`, and the AI coach prompt builder expects `workoutDurationMinutes` to include session length context (`sessionMins`). However, the Google Sheets profile repository omits `workoutDurationMinutes` from its column headers and serialization/deserialization logic, and `profileHasData` omits it when checking whether a loaded profile is complete. After saving and reloading the app, the user's session duration silently resets to `undefined`.

## Acceptance Criteria

- [ ] Google Sheets `UserProfile` persistence reads and writes `workoutDurationMinutes` cleanly (including existing sheets that lack the column yet—treated safely as `undefined` until saved).
- [ ] Numeric validation at the persistence boundary rejects non-positive or non-numeric cells without failing profile load.
- [ ] `profileHasData` includes `workoutDurationMinutes` when evaluating whether an athlete profile contains saved data.
- [ ] Saving a profile with `workoutDurationMinutes` in onboarding and reloading from the repository restores the exact value and supplies `sessionMins` to the AI coach request DTO.
- [ ] Existing `pnpm test:unit`, `pnpm type-check`, `pnpm lint`, and architecture boundary tests pass.

## Testing Decisions

- Add repository round-trip and legacy-column backward-compatibility unit tests covering `workoutDurationMinutes` serialization/parsing and invalid cell values.
- Add store unit tests verifying `profileHasData` and onboarding save-to-reload preservation.
