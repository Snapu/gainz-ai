# 19: Granular Gemini TokenUsage Metering, Daily Spend Cap & SQL Analytics Views

**Parent:** TICKET-017  
**Labels:** `ready-for-agent`, `tracer-bullet`, `infrastructure`  
**Blocked by:** TICKET-018  
**Status:** ready-for-agent

**What to build:** Give the product owner exact, real-time visibility into per-athlete and per-feature Gemini AI token costs in Supabase Studio—paired with an automatic `O(1)` global daily spend circuit breaker—so every model invocation (including failed primary attempts before fallback and mid-stream network aborts) is metered accurately in USD micro-units without ever being erased when a user's quota is refunded.

## Acceptance Criteria

- [ ] Shared Gemini client enforces explicit `maxOutputTokens` caps per request mode (`planning`, `execution`, `classify`) alongside at most 2 model attempts per logical request, and extracts/accumulates per-attempt `usageMetadata` (`promptTokenCount`, `cachedContentTokenCount`, `candidatesTokenCount`, `thoughtsTokenCount`) **before** checking `finishReason !== "STOP"` or running Zod response validation so billed tokens on failed primary attempts are captured accurately.
- [ ] When an upstream stream aborts at the transport layer before emitting `usageMetadata`, the invocation increments `unmeasured_count` and records a conservative character-based token estimate (`ceil(chars / 4)`) rather than silently recording zero cost.
- [ ] Database schema adds `estimated_cost_usd_micros bigint not null default 0 check (estimated_cost_usd_micros >= 0)` onto `ai_daily_global_usage` (PK `usage_date`) and creates `ai_monthly_token_usage` keyed by `(actor_key, year_month, model, request_kind, entitlement_source)` with strict `service_role`-only RLS and privileges.
- [ ] Server-side pricing rates cover all configured primary and fallback coaching/classification models (plus a conservative non-zero default fallback rate for unknown model IDs), computing `uncached_prompt = max(0, prompt - cached)`, `cached_prompt = cached`, and `billable_output = candidates + thoughts` in USD micro-units (`1 USD = 1_000_000 micros`) at write time.
- [ ] `ai-coach` classifies each invocation into granular `request_kind` (`initial_plan` for planning with zero prior logs/summaries, `plan_regeneration` for planning with existing training history, `plan_update` when plan modification is enabled in execution mode, `session_briefing` for auto-triggered advice without a user question, `chat` when a user question is present, and `classify` for exercise classification) and persists `TokenUsage` asynchronously via `waitUntil` on **both** `coach` and `classify` paths—across both successful and failed requests.
- [ ] User quota / `FreeAllowance` refunds never decrement or reverse recorded costs in `ai_monthly_token_usage` or `ai_daily_global_usage.estimated_cost_usd_micros`.
- [ ] Authorization RPC checks `AI_DAILY_COST_CAP_USD` in `O(1)` against `ai_daily_global_usage.estimated_cost_usd_micros`; when tripped, `ai-coach` returns `global_capped = true` -> HTTP `429 rate-limit-exceeded` (never `402`, so paying subscribers never see an Upgrade Card during a global cap event).
- [ ] Two read-only SQL analytics views (`v_ai_unit_economics_monthly` showing monthly active AI users, request & unmeasured counts, breakdown by `request_kind` and `entitlement_source`, USD/EUR totals, mean, P50 median, P95, max single-user cost, and margin; and `v_ai_user_costs` showing per-actor spend) are created with `WITH (security_invoker = true)`, `REVOKE ALL` from `public`, `anon`, and `authenticated`, and `GRANT SELECT` strictly to `service_role`.
- [ ] Automated seam tests verify multi-attempt fallback `usageMetadata` accumulation, mid-stream abort estimation, `request_kind` derivation, non-reversal of costs on refund, `O(1)` `AI_DAILY_COST_CAP_USD` `429` tripping, and SQL view privilege isolation.
