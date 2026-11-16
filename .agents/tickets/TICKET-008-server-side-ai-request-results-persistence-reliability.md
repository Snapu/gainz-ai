# 08: Server-Side `ai_request_results` Persistence Reliability & Quota Integrity

**What to build:** Make completion persistence in `public.ai_request_results` reliable and observable so transient Postgres/PostgREST failures during `markCompleted` do not strand screen-locked athletes after AI quota has already been charged.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

---

## Problem Statement

Client recovery polling was tightened in uncommitted store updates (adding a 90s wall-clock cap and 2-error transport circuit breaker), so polling clients no longer spin endlessly. However, on the server side (`ai-coach/requestResults.ts`), `patchEntry` / `markCompleted` still swallows HTTP and network errors with only `console.warn` and returns `void`. If a client screen-locks mid-generation (disconnecting SSE) and `markCompleted` fails or times out, quota stays deducted and `ai_request_results` remains stuck in `status: "processing"` until the 30-minute expiry—leaving `action: "recover"` unable to deliver the generated response or refund quota.

## Acceptance Criteria

- [ ] `patchEntry` / `markCompleted` returns a typed result or boolean/error indicating whether persistence in `ai_request_results` succeeded.
- [ ] Transient `completed` persistence failures are retried cleanly before giving up.
- [ ] If marking `completed` still fails after retries (when SSE delivery also cannot complete or post-commit persistence fails), `ai-coach` attempts to transition the record to `failed` (with error code), refunds the deducted quota when appropriate, and emits an `error` event if the SSE stream is still open—instead of emitting `complete` or stranding a `"processing"` row silently.
- [ ] Error logs keep strict GDPR Art. 9 zero-PII discipline (status/error classification only, no payloads).

## Testing Decisions

- Extend `ai-coach` handler and `requestResults` unit tests to simulate `markCompleted` HTTP 503 / timeout failures on first try (verifying retry succeeds) and persistent failure (verifying fallback error/refund path instead of silent success).
