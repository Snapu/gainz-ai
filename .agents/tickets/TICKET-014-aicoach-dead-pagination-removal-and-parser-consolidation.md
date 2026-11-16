# 14: `aiCoach` Dead Chat Pagination Removal & Helper Consolidation

**What to build:** Remove dead paginated-chat code (`coachMessages` and `currentPageIndex`) and eliminate duplicate rep/duration and follow-up parsing logic while respecting hermetic Edge deployment boundaries.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

---

## Problem Statement

1. **Dead UI pagination state:** `useCoachChatViewModel` still computes `coachMessages`, watches its length to update `currentPageIndex`, and exposes `currentPageIndex`, even though `CoachTab.vue` uses `chatMessages` exclusively and no component anywhere reads `coachMessages` or `currentPageIndex` (only legacy tests exercise them).
2. **Duplicate pure parsers across client & Edge:** `isDuration`, `parseFirstRep`, and `splitReps` exist three times (`aiCoach/domain/upcaster.ts`, `aiCoach/presentation/helpers/aiCoachPageHelpers.ts`, `supabase/functions/ai-coach/postProcess.ts`), and `sanitizeSuggestedFollowUps` is duplicated verbatim between `aiCoach/domain/types.ts` and `supabase/functions/ai-coach/schemas.ts`. Because Edge Functions must deploy hermetically without importing `@/modules/*`, frontend copies should be unified internally while frontend/Edge parity is protected by tests (or a deploy-safe shared module if configured).

## Acceptance Criteria

- [ ] `coachMessages`, `currentPageIndex`, and the `watch` linking them are removed from `useCoachChatViewModel` along with their obsolete assertions in `aiOrchestratorStore.test.ts` and `useCoachChatViewModel.test.ts`.
- [ ] `aiCoach/presentation/helpers/aiCoachPageHelpers.ts` reuses `isDuration`, `parseFirstRep`, and `splitReps` exported through the `@/modules/aiCoach/domain` barrel instead of duplicating them in presentation.
- [ ] `architecture.boundaries.test.ts` and hermetic `supabase/functions/` isolation rules remain intact (`supabase/functions/` never imports from `@/modules/*` or `src/`), and contract tests verify parity between client and Edge `sanitizeSuggestedFollowUps` and rep/duration parsing edge cases (`45s`, `8-12`, `0m`).
- [ ] `pnpm knip`, `pnpm test:unit`, `pnpm type-check`, and `pnpm lint` pass cleanly.

## Testing Decisions

- Add explicit cross-boundary contract parity assertions comparing client domain helpers (`isDuration`, `parseFirstRep`, `splitReps`, `sanitizeSuggestedFollowUps`) against Edge `postProcess` and `schemas` outputs on identical edge-case inputs.
