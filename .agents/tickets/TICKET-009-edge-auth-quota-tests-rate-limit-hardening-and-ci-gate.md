# 09: Edge Auth/Quota Security Tests, Multi-Isolate Rate Limiting & CI Deploy Gate

**What to build:** Add real automated tests for `auth-token` and shared Edge security modules (`auth.ts`, `quota.ts`, `http.ts`), close rate-limiter bypasses in `auth-token`, and gate Supabase Edge deployments in CI behind passing tests.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

---

## Problem Statement

1. **Zero automated coverage on auth and quota modules:** While `ai-coach` handlers have Vitest specs, `auth-token` (`index.ts`, `rateLimiter.ts`) and `_shared/{auth,http,quota}.ts` have zero test files. Additionally, Vitest stubs `npm:jose@5` in `vite.config.ts`, meaning real Google JWKS signature verification is never exercised by tests, and `.github/workflows/supabase-deploy.yml` runs zero tests before deploying to Supabase.
2. **Rate limiter gaps on `auth-token`:** When `extractClientIp(req)` returns `undefined`, rate limiting is skipped completely. Moreover, its state lives only in an in-memory per-isolate `Map`, allowing parallel serverless isolates or cold starts to reset the 30-request window without even an explicit shortcut comment documenting the trade-off.

## Acceptance Criteria

- [ ] Automated unit tests cover `auth-token` request validation, OAuth error mapping, and `_shared/{auth,http,quota}.ts` (size limits, token claim checks, quota/refund RPC error handling), including execution under Deno (`deno test`) so `npm:jose` imports run against real code without Vitest stubs masking broken imports.
- [ ] Missing client IP headers on `auth-token` no longer bypass throttling silently (use a strict fallback bucket or reject untrusted unattributed flood requests cleanly, avoiding spoofable headers).
- [ ] Multi-isolate rate limiting for `auth-token` either uses shared backend state (e.g., Postgres table/RPC) or is documented with an explicit justification and bounded tight fallback if best-effort in-memory remains intentional.
- [ ] `.github/workflows/supabase-deploy.yml` runs the Edge test suite and fails before running `supabase functions deploy` on test failure.

## Testing Decisions

- Add tests covering missing IP header throttling, over-limit `429` responses with `Retry-After`, expired/invalid JWT audience/issuer rejection in `_shared/auth.ts`, `100 KB` body cap rejection in `_shared/http.ts`, and `consume_ai_quota` / `refund_ai_quota` error paths in `_shared/quota.ts`.
- Verify both `deno test` (for real Edge imports) and `pnpm test:unit` remain green.
