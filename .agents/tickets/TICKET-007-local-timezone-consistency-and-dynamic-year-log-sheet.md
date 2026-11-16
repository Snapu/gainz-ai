# 07: Local Timezone Consistency & Dynamic Year Log Sheet Routing

**What to build:** Ensure midnight sessions, workout-day counting, 28-day chat retention cleanup, and New Year yearly log tab selection all use consistent local-time calendar boundaries computed dynamically at runtime.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

---

## Problem Statement

Three places mix local time and UTC or freeze timestamps at startup:

1. **Frozen year tab name:** The training logs Sheets repository computes `"Logs" + new Date().getFullYear()` once at module load time, so leaving the PWA open past midnight on Dec 31 routes January workouts into the prior year's tab until a full reload.
2. **UTC workout days inside local months:** Monthly summary computation groups logs by local year/month (`getFullYear()`, `getMonth() + 1`) while counting distinct `workoutDays` using `toISOString().slice(0, 10)` (UTC), splitting late-evening sessions across calendar boundaries.
3. **UTC cutoff vs local session IDs:** Chat history cleanup compares UTC `toISOString().slice(0, 10)` cutoffs against local-date session IDs produced with `isoDateString`.

## Acceptance Criteria

- [ ] `trainingLogs` resolves the target yearly sheet tab dynamically at read/write time based on the active date or `log.loggedAt.getFullYear()`.
- [ ] Monthly summary `workoutDays` uses the shared domain local-date formatter (`isoDateString`) instead of UTC `.toISOString().slice(0, 10)`.
- [ ] Chat session retention cleanup in `LocalStorageMessageRepository` computes the `MAX_SESSION_AGE_DAYS` cutoff using `isoDateString` (or an explicit local-date domain helper) matching `coachChatStore` session IDs.
- [ ] Behavior is deterministic across timezones where local date and UTC date differ (e.g., late evening in UTC-5 or early morning in UTC+2).

## Testing Decisions

- Add timezone/boundary unit tests using fake clocks:
  - Dec 31 -> Jan 1 rollover verifying dynamic year tab resolution without module re-import.
  - Late-night log close to UTC midnight verifying local `workoutDays` grouping matches its local month.
  - Chat cleanup around the 28-day local cutoff boundary matching local-date session keys.
