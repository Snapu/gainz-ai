# 10: Global Daily AI Cap Counter Scaling (`consume_ai_quota`)

**What to build:** Replace the full-day table scan in Postgres `consume_ai_quota` with an O(1) daily aggregate counter (or covering index-only lookup) so daily global quota checks stay constant-time as active users grow.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

---

## Problem Statement

On every AI request, `public.consume_ai_quota` calculates global daily usage via `select coalesce(sum(coaching_count), 0) ... from public.ai_daily_usage where usage_date = v_today` (and likewise for `classify_count`). At thousands of daily active users during peak gym hours, every request scans and sums thousands of rows inside Postgres before incrementing the caller's quota.

## Acceptance Criteria

- [ ] A new Supabase migration (plus declarative schema update in `supabase/schemas/`) eliminates per-request full-day summation across all user rows in `consume_ai_quota` (e.g., an atomic daily global counter table `(usage_date)` with `coaching_count` and `classify_count` decremented/refunded alongside `ai_daily_usage` in `refund_ai_quota`).
- [ ] All SQL security controls match project standards (`ENABLE ROW LEVEL SECURITY`, `REVOKE ALL FROM PUBLIC, anon, authenticated`, `GRANT ... TO service_role`, `SECURITY INVOKER` + `SET search_path = ''`).
- [ ] Concurrent calls enforce the exact `10,000` coach / `20,000` classify daily global caps and `refund_ai_quota` restores both per-user and global daily counters accurately for `usage_date`.
- [ ] Schema declarations (`supabase/schemas/`) and migrations remain in sync with zero drift.

## Testing Decisions

- Add SQL / Edge contract test cases verifying global cap enforcement (`p_global_cap`), per-user cap enforcement (`p_daily_limit`), and accurate refund across specific `p_usage_date` boundaries.
