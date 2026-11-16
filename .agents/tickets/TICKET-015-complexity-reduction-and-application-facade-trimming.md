# 15: Reduce Cognitive Complexity Warnings & Trim Pass-Through Application Wrappers

**What to build:** Split overly complex domain/orchestration functions cleanly below Biome's cognitive complexity threshold of 15, ensure `clearPendingRequest()` resets all attempt-lock state consistently on logout, and remove trivial pass-through forwarders where barrel facades do not require them.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

---

## Problem Statement

1. **High cognitive complexity hotspots:** Biome reports 73 warnings across the codebase, led by `calculateFatigueInsight` (`fatigueDetection.ts`, score `72`), `calculateUserProgress` (`leveling.ts`, score `57`), `architecture.boundaries.test.ts` (scores `57`/`29`/`28`), and newly introduced high-complexity functions from recent SSE/recovery changes (`aiOrchestratorStore.ts` scores `36`, `22`, `19`; `aiEdgeClient.ts` score `18`; `authStore.ts` score `16`).
2. **Incomplete attempt-token reset on logout:** In `aiOrchestratorStore.clearPendingRequest()`, `activeAttemptRequestId` is cleared, whereas `activeAttemptToken`, `inFlightMode`, and `chatStore.isLoading` remain untouched until an in-flight network attempt settles—leaving immediate logout/re-login sequences queued behind stale loading state.
3. **Pass-through one-line application wrappers:** Four `application/` files (`trainingLogs/application/useCases.ts`, `deload/application/useCases.ts`, `profile/application/metrics.ts`, `trainingInsights/application/useCases.ts`) define trivial single-line forwarding functions that add navigation hops without orchestration logic.

## Acceptance Criteria

- [ ] `calculateFatigueInsight` and recent high-complexity functions (`aiOrchestratorStore`, `aiEdgeClient`, `authStore`) are decomposed into small, single-purpose pure/helper functions with shallow nesting so Biome complexity warnings on modified files drop below `15`.
- [ ] `clearPendingRequest()` cleanly resets `activeAttemptToken`, `inFlightMode`, and `chatStore.isLoading` alongside `activeAttemptRequestId` and `pendingCoachRequest`, preventing stale in-flight attempts from blocking immediate re-login sessions.
- [ ] Pure domain pass-through functions in `application/` that add zero policy/port injection are simplified or re-exported cleanly without violating `AGENTS.md` layer-facade rules (`architecture.boundaries.test.ts` stays green).
- [ ] `pnpm exec biome check .` warning count drops materially, and `pnpm test:unit`, `pnpm type-check`, and `pnpm knip` remain green.

## Testing Decisions

- Add a logout -> immediate re-login test in `aiOrchestratorStore.test.ts` while an earlier request is still pending before settlement, verifying the newly logged-in session is not stalled behind the logged-out request.
- Rely on existing full unit suites for `fatigueDetection`, `aiEdgeClient`, `authStore`, and `architecture.boundaries.test.ts` to guarantee zero behavior or boundary regressions during decomposition.
