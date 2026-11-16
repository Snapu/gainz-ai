# 11: Linear-Time Weekly Volume Calculation (`calculateWeeklyVolume`)

**What to build:** Eliminate the 29x full-array log filtering loop inside `calculateWeeklyVolume` so weekly muscle volume insights run in linear time in production and cut `leveling.milestones.test.ts` from ~39s down to sub-second execution.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

---

## Problem Statement

`calculateWeeklyVolume` loops `daysBack = 28..0` (29 iterations) and invokes `accumulateMuscleVolume(logs, dayStart, dayEnd)`, which filters the entire `logs` array on each day (`29 * logs.length` comparisons per call). Across weekly simulations in `leveling.milestones.test.ts` (up to 238 weeks / 952 workouts) and every 60-second background recompute via `useNow` in `trainingInsightsStore`, this repeatedly scans old logs from months earlier, accounting for ~38.7 seconds of the ~39.6-second total unit test suite runtime.

## Acceptance Criteria

- [ ] `calculateWeeklyVolume` (and `calculateUserProgress` if looping weekly snapshots) filters logs to the relevant time window / buckets logs by local day once per call rather than rescanning the entire `logs` array 29 times.
- [ ] Computed weekly sets, effective sets, muscle attribution, and progression outputs match existing behavior bit-for-bit across all volume landmark and leveling tests.
- [ ] `pnpm test:unit` runs all 84+ test files cleanly with `leveling.milestones.test.ts` reduced from ~39s to well under 2 seconds.
- [ ] No external dependencies added; domain purity in `trainingInsights/domain` remains intact (`architecture.boundaries.test.ts` green).

## Testing Decisions

- Keep existing `leveling.milestones.test.ts`, `leveling.simulation.test.ts`, and `volumeLandmarks` unit tests untouched in assertions so output parity is strictly proven before measuring runtime speedup.
- Add an edge-case test with empty logs, boundary logs right on the 29-day cutoff, and multi-year unsorted logs.
