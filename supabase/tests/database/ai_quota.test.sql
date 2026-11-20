begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(23);

do $$
begin
  delete from public.ai_daily_usage;
  delete from public.ai_daily_global_usage;
end $$;

-- 1. RLS enabled on ai_daily_global_usage
select is(
  (select relrowsecurity from pg_class where oid = 'public.ai_daily_global_usage'::regclass),
  true,
  'ai_daily_global_usage has row level security enabled'
);

-- 2. service_role_full_access policy exists on ai_daily_global_usage
select ok(
  exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'ai_daily_global_usage'
      and policyname = 'service_role_full_access'
      and 'service_role'::name = any(roles)
  ),
  'ai_daily_global_usage has service_role_full_access RLS policy'
);

-- 3. Table privileges restricted to service_role only
select ok(
  not has_table_privilege('anon', 'public.ai_daily_global_usage', 'SELECT, INSERT, UPDATE, DELETE')
  and not has_table_privilege('authenticated', 'public.ai_daily_global_usage', 'SELECT, INSERT, UPDATE, DELETE')
  and has_table_privilege('service_role', 'public.ai_daily_global_usage', 'SELECT')
  and has_table_privilege('service_role', 'public.ai_daily_global_usage', 'INSERT')
  and has_table_privilege('service_role', 'public.ai_daily_global_usage', 'UPDATE')
  and has_table_privilege('service_role', 'public.ai_daily_global_usage', 'DELETE'),
  'ai_daily_global_usage table privileges restricted to service_role'
);

-- 4. Function execute privileges restricted to service_role only
select ok(
  not has_function_privilege('anon', 'public.consume_ai_quota(text, text, integer, integer)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.consume_ai_quota(text, text, integer, integer)', 'EXECUTE')
  and has_function_privilege('service_role', 'public.consume_ai_quota(text, text, integer, integer)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.refund_ai_quota(text, text, date)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.refund_ai_quota(text, text, date)', 'EXECUTE')
  and has_function_privilege('service_role', 'public.refund_ai_quota(text, text, date)', 'EXECUTE'),
  'quota RPC execute privileges restricted to service_role'
);

-- 5. Legacy 3-arg overload was dropped so only one consume_ai_quota signature exists
select is(
  (
    select count(*)::integer
    from pg_proc
    where pronamespace = 'public'::regnamespace
      and proname = 'consume_ai_quota'
  ),
  1,
  'only a single consume_ai_quota function overload exists'
);

set local role service_role;
set local search_path = public, extensions;

-- 6. NULL p_kind throws in consume_ai_quota
select throws_matching(
  $$ select * from public.consume_ai_quota('u1', null, 5) $$,
  'Invalid quota kind',
  'consume_ai_quota rejects null p_kind'
);

-- 7. NULL p_kind throws in refund_ai_quota
select throws_matching(
  $$ select public.refund_ai_quota('u1', null) $$,
  'Invalid quota kind',
  'refund_ai_quota rejects null p_kind'
);

-- 8. Blank p_user_id throws in consume_ai_quota
select throws_matching(
  $$ select * from public.consume_ai_quota('   ', 'coach', 5) $$,
  'p_user_id must not be empty',
  'consume_ai_quota rejects blank p_user_id'
);

-- 9. 3-arg call resolves unambiguously with default global cap
select results_eq(
  $$ select allowed, current_count, daily_limit, global_capped from public.consume_ai_quota('u1', 'coach', 2) $$,
  $$ values (true, 1, 2, false) $$,
  '3-arg consume_ai_quota call resolves cleanly and increments count to 1'
);

-- 10. 2nd coach call increments per-user count to limit
select results_eq(
  $$ select allowed, current_count, daily_limit, global_capped from public.consume_ai_quota('u1', 'coach', 2, 3) $$,
  $$ values (true, 2, 2, false) $$,
  '2nd coach call increments per-user count to 2'
);

-- 11. 3rd coach call is blocked by per-user daily limit (not global cap)
select results_eq(
  $$ select allowed, current_count, daily_limit, global_capped from public.consume_ai_quota('u1', 'coach', 2, 3) $$,
  $$ values (false, 2, 2, false) $$,
  '3rd coach call hits per-user daily limit with global_capped = false'
);

-- 12. Denied per-user call does not leak into ai_daily_global_usage
select is(
  (
    select coaching_count
    from public.ai_daily_global_usage
    where usage_date = (now() at time zone 'utc')::date
  ),
  2,
  'per-user quota denial does not increment global coaching_count'
);

-- 13. Different user u2 can consume remaining slot up to global cap (3)
select results_eq(
  $$ select allowed, current_count, daily_limit, global_capped from public.consume_ai_quota('u2', 'coach', 5, 3) $$,
  $$ values (true, 1, 5, false) $$,
  'different user u2 reaches global cap 3'
);

-- 14. User u3 is blocked when global cap (3) is reached
select results_eq(
  $$ select allowed, current_count, daily_limit, global_capped from public.consume_ai_quota('u3', 'coach', 5, 3) $$,
  $$ values (false, 5, 5, true) $$,
  'user u3 is blocked with global_capped = true once global cap is reached'
);

-- 15. Global-capped u3 has no row inserted in ai_daily_usage
select is(
  (
    select count(*)::integer
    from public.ai_daily_usage
    where user_id = 'u3'
      and usage_date = (now() at time zone 'utc')::date
  ),
  0,
  'global-capped user has no ai_daily_usage row created'
);

-- 16. Non-positive p_global_cap = 0 denies immediately with global_capped = true
select results_eq(
  $$ select allowed, current_count, daily_limit, global_capped from public.consume_ai_quota('u3', 'coach', 5, 0) $$,
  $$ values (false, 5, 5, true) $$,
  'p_global_cap <= 0 returns global_capped = true without mutating counters'
);

-- 17. Classify quota operates independently while coach is globally capped
select results_eq(
  $$ select allowed, current_count, daily_limit, global_capped from public.consume_ai_quota('u3', 'classify', 5, 1) $$,
  $$ values (true, 1, 5, false) $$,
  'classify quota succeeds independently while coach is globally capped'
);

-- 18. 2nd classify call hits classify global cap
select results_eq(
  $$ select allowed, current_count, daily_limit, global_capped from public.consume_ai_quota('u3', 'classify', 5, 1) $$,
  $$ values (false, 5, 5, true) $$,
  'classify quota enforces classify global cap independently'
);

-- 19. Refund targeting specific p_usage_date decrements only that date across both tables
do $$
declare
  v_past date := (now() at time zone 'utc')::date - 2;
begin
  insert into public.ai_daily_usage (user_id, usage_date, coaching_count, classify_count)
  values ('u1', v_past, 2, 1);

  insert into public.ai_daily_global_usage (usage_date, coaching_count, classify_count)
  values (v_past, 2, 1);

  perform public.refund_ai_quota('u1', 'coach', v_past);
end $$;

select results_eq(
  $$
    select
      (select coaching_count from public.ai_daily_usage where user_id = 'u1' and usage_date = (now() at time zone 'utc')::date - 2),
      (select coaching_count from public.ai_daily_global_usage where usage_date = (now() at time zone 'utc')::date - 2),
      (select coaching_count from public.ai_daily_global_usage where usage_date = (now() at time zone 'utc')::date)
  $$,
  $$ values (1, 1, 3) $$,
  'refund_ai_quota decrements only the specified p_usage_date across both tables'
);

-- 20. Refunding today's u1 slot decrements today's global coaching_count from 3 to 2
do $$
declare
  v_today date := (now() at time zone 'utc')::date;
begin
  perform public.refund_ai_quota('u1', 'coach', v_today);
end $$;

select is(
  (
    select coaching_count
    from public.ai_daily_global_usage
    where usage_date = (now() at time zone 'utc')::date
  ),
  2,
  'refund_ai_quota on today restores global coaching_count to 2'
);

-- 21. Re-opened global capacity allows u3 to consume a coach slot again (global returns to 3)
select results_eq(
  $$ select allowed, current_count, daily_limit, global_capped from public.consume_ai_quota('u3', 'coach', 5, 3) $$,
  $$ values (true, 1, 5, false) $$,
  'refunded global slot allows u3 to consume quota again'
);

-- 22. Duplicate or nonexistent refunds never decrement global counters past the user's positive count
do $$
begin
  perform public.refund_ai_quota('u2', 'coach');
  perform public.refund_ai_quota('u2', 'coach');
  perform public.refund_ai_quota('nonexistent-user', 'classify');
end $$;

select results_eq(
  $$
    select
      (select coaching_count from public.ai_daily_usage where user_id = 'u2' and usage_date = (now() at time zone 'utc')::date),
      (select coaching_count from public.ai_daily_global_usage where usage_date = (now() at time zone 'utc')::date),
      (select classify_count from public.ai_daily_global_usage where usage_date = (now() at time zone 'utc')::date)
  $$,
  $$ values (0, 2, 1) $$,
  'duplicate and empty refunds do not underflow or steal other users global counts'
);

-- 23. Positive classify refund decrements both per-user and global classify_count
do $$
begin
  perform public.refund_ai_quota('u3', 'classify');
end $$;

select results_eq(
  $$
    select
      (select classify_count from public.ai_daily_usage where user_id = 'u3' and usage_date = (now() at time zone 'utc')::date),
      (select classify_count from public.ai_daily_global_usage where usage_date = (now() at time zone 'utc')::date)
  $$,
  $$ values (0, 0) $$,
  'positive classify refund decrements both per-user and global classify_count to 0'
);

reset role;
select * from finish();

rollback;
