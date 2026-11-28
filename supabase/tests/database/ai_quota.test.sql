begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(34);

do $$
begin
  delete from public.ai_request_results;
  delete from public.ai_daily_usage;
  delete from public.ai_daily_global_usage;
  delete from public.free_allowance_usage;
  delete from public.ai_monthly_token_usage;
  delete from public.invite_grants;
  delete from public.invite_codes;
  delete from public.invite_redeem_attempts;
  delete from public.user_subscriptions;
  delete from public.processed_webhook_events;
  delete from public.pending_subscription_cancellations;
end $$;

-- 1. RLS enabled on all backend tables
select is(
  (
    select count(*)::integer
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in (
        'ai_daily_usage',
        'ai_daily_global_usage',
        'ai_request_results',
        'free_allowance_usage',
        'ai_monthly_token_usage',
        'invite_codes',
        'invite_grants',
        'invite_redeem_attempts',
        'user_subscriptions',
        'processed_webhook_events',
        'pending_subscription_cancellations'
      )
      and c.relrowsecurity = true
  ),
  11,
  'all backend tables have row level security enabled'
);

-- 2. service_role_full_access policy exists on all backend tables
select is(
  (
    select count(*)::integer
    from pg_policies
    where schemaname = 'public'
      and policyname = 'service_role_full_access'
      and 'service_role'::name = any(roles)
      and tablename in (
        'ai_daily_usage',
        'ai_daily_global_usage',
        'ai_request_results',
        'free_allowance_usage',
        'ai_monthly_token_usage',
        'invite_codes',
        'invite_grants',
        'invite_redeem_attempts',
        'user_subscriptions',
        'processed_webhook_events',
        'pending_subscription_cancellations'
      )
  ),
  11,
  'all backend tables define service_role_full_access RLS policy'
);

-- 3. Table & analytics view privileges restricted to service_role only (verified individually for all 11 tables and 2 views)
select ok(
  (
    select bool_and(
      not has_table_privilege('anon', tbl, 'SELECT, INSERT, UPDATE, DELETE')
      and not has_table_privilege('authenticated', tbl, 'SELECT, INSERT, UPDATE, DELETE')
      and has_table_privilege('service_role', tbl, 'SELECT')
      and has_table_privilege('service_role', tbl, 'INSERT')
      and has_table_privilege('service_role', tbl, 'UPDATE')
      and has_table_privilege('service_role', tbl, 'DELETE')
    )
    from unnest(array[
      'public.ai_daily_usage',
      'public.ai_daily_global_usage',
      'public.ai_request_results',
      'public.free_allowance_usage',
      'public.ai_monthly_token_usage',
      'public.invite_codes',
      'public.invite_grants',
      'public.invite_redeem_attempts',
      'public.user_subscriptions',
      'public.processed_webhook_events',
      'public.pending_subscription_cancellations'
    ]) as tbl
  )
  and (
    select bool_and(
      not has_table_privilege('anon', vw, 'SELECT')
      and not has_table_privilege('authenticated', vw, 'SELECT')
      and has_table_privilege('service_role', vw, 'SELECT')
    )
    from unnest(array[
      'public.v_ai_unit_economics_monthly',
      'public.v_ai_user_costs'
    ]) as vw
  ),
  'all backend table and analytics view privileges are restricted to service_role'
);

-- 4. All 8 RPC execute privileges restricted to service_role only
select ok(
  (
    select bool_and(
      not has_function_privilege('anon', fn_sig, 'EXECUTE')
      and not has_function_privilege('authenticated', fn_sig, 'EXECUTE')
      and has_function_privilege('service_role', fn_sig, 'EXECUTE')
    )
    from unnest(array[
      'public.get_entitlement_status(text, text, text)',
      'public.authorize_ai_request(text, text, text, text, integer, integer, integer, bigint)',
      'public.refund_ai_quota(text, text, date, text, boolean)',
      'public.record_ai_token_usage(text, date, text, text, text, boolean, bigint, bigint, bigint, bigint, bigint)',
      'public.check_invite_redeem_rate_limit(text, text, integer, integer, integer)',
      'public.redeem_invite_code(text, text)',
      'public.sync_subscription_webhook(text, bigint, text, text, text, text, text, text, boolean, timestamptz)',
      'public.delete_user_account_data(text, text, text, text)'
    ]) as fn_sig
  ),
  'all billing, invite, and quota RPC execute privileges restricted to service_role'
);

-- 5. Legacy consume_ai_quota overload removed
select is(
  (
    select count(*)::integer
    from pg_proc
    where pronamespace = 'public'::regnamespace
      and proname = 'consume_ai_quota'
  ),
  0,
  'legacy consume_ai_quota function has been dropped'
);

set local role service_role;
set local search_path = public, extensions;

-- 6. NULL p_kind throws in authorize_ai_request
select throws_matching(
  $$ select * from public.authorize_ai_request('u1', 'v1:d1', null, null) $$,
  'Invalid quota kind',
  'authorize_ai_request rejects null p_kind'
);

-- 7. NULL p_kind throws in refund_ai_quota
select throws_matching(
  $$ select public.refund_ai_quota('u1', null) $$,
  'Invalid quota kind',
  'refund_ai_quota rejects null p_kind'
);

-- 8. Blank p_user_id throws in authorize_ai_request
select throws_matching(
  $$ select * from public.authorize_ai_request('   ', 'v1:d1', null, 'coach') $$,
  'p_user_id must not be empty',
  'authorize_ai_request rejects blank p_user_id'
);

-- 9. Blank p_subject_digest throws in authorize_ai_request
select throws_matching(
  $$ select * from public.authorize_ai_request('u1', '   ', null, 'coach') $$,
  'p_subject_digest must not be empty',
  'authorize_ai_request rejects blank p_subject_digest'
);

-- 10. 1st FreeAllowance coach call succeeds and increments free_coach_used and current_count to 1
select results_eq(
  $$
    select allowed, admitted_source, current_count, daily_limit, free_coach_used, global_capped
    from public.authorize_ai_request('u1', 'v1:d1', null, 'coach', 15, 2, 3, 5000000)
  $$,
  $$ values (true, 'free_allowance'::text, 1, 2, 1, false) $$,
  '1st FreeAllowance coach call increments daily and starter counts to 1'
);

-- 11. 2nd FreeAllowance coach call reaches p_free_daily_limit = 2
select results_eq(
  $$
    select allowed, admitted_source, current_count, free_coach_used, global_capped
    from public.authorize_ai_request('u1', 'v1:d1', null, 'coach', 15, 2, 3, 5000000)
  $$,
  $$ values (true, 'free_allowance'::text, 2, 2, false) $$,
  '2nd FreeAllowance coach call increments daily and starter counts to 2'
);

-- 12. 3rd coach call for u1 hits per-user free daily limit (not global cap)
select results_eq(
  $$
    select allowed, denial_reason, current_count, daily_limit, global_capped, entitlement_source
    from public.authorize_ai_request('u1', 'v1:d1', null, 'coach', 15, 2, 3, 5000000)
  $$,
  $$ values (false, 'rate-limit-exceeded'::text, 2, 2, false, 'free_allowance'::text) $$,
  '3rd coach call for u1 hits per-user free daily limit with global_capped = false'
);

-- 13. Per-user denial does not increment ai_daily_global_usage or free_allowance_usage
select results_eq(
  $$
    select
      (select coaching_count from public.ai_daily_global_usage where usage_date = (now() at time zone 'utc')::date),
      (select coach_used from public.free_allowance_usage where subject_digest = 'v1:d1')
  $$,
  $$ values (2, 2) $$,
  'per-user denial leaves global count and FreeAllowance starter counter unchanged'
);

-- 14. Different user u2 takes the 3rd global coach slot
select results_eq(
  $$
    select allowed, admitted_source, free_coach_used, global_capped
    from public.authorize_ai_request('u2', 'v1:d2', null, 'coach', 15, 5, 3, 5000000)
  $$,
  $$ values (true, 'free_allowance'::text, 1, false) $$,
  'different user u2 uses the 3rd global coach slot'
);

-- 15. User u3 is blocked when global coach request cap (3) is reached
select results_eq(
  $$
    select allowed, denial_reason, global_capped
    from public.authorize_ai_request('u3', 'v1:d3', null, 'coach', 15, 5, 3, 5000000)
  $$,
  $$ values (false, 'rate-limit-exceeded'::text, true) $$,
  'user u3 is blocked with global_capped = true when global coach request cap is reached'
);

-- 16. Globally capped u3 has no ai_daily_usage row created on read-only fast-path
select is(
  (
    select count(*)::integer
    from public.ai_daily_usage
    where user_id = 'u3'
      and usage_date = (now() at time zone 'utc')::date
  ),
  0,
  'globally capped u3 creates no ai_daily_usage row'
);

-- 17. record_ai_token_usage aggregates monthly token usage and daily global spend
do $$
begin
  perform public.record_ai_token_usage(
    'u1',
    (now() at time zone 'utc')::date,
    'gemini-2.5-flash',
    'chat',
    'free_allowance',
    false,
    100,
    20,
    50,
    10,
    500
  );
end $$;

select results_eq(
  $$
    select
      (select estimated_cost_usd_micros from public.ai_daily_global_usage where usage_date = (now() at time zone 'utc')::date),
      (select sum(estimated_cost_usd_micros)::bigint from public.ai_monthly_token_usage where actor_key = 'u1')
  $$,
  $$ values (500::bigint, 500::bigint) $$,
  'record_ai_token_usage records 500 USD micros in both global daily and monthly rollup tables'
);

-- 18. Global daily spend cap blocks classify when estimated_cost_usd_micros >= cap
select results_eq(
  $$
    select allowed, denial_reason, global_capped
    from public.authorize_ai_request('u3', 'v1:d3', null, 'classify', 50, 20, 100, 500)
  $$,
  $$ values (false, 'rate-limit-exceeded'::text, true) $$,
  'global spend circuit breaker blocks request once daily cost meets p_global_cost_cap_usd_micros'
);

-- 19. Classify succeeds independently for u3 once spend cap allows it
select results_eq(
  $$
    select allowed, admitted_source, free_classify_used, global_capped
    from public.authorize_ai_request('u3', 'v1:d3', null, 'classify', 50, 20, 100, 5000000)
  $$,
  $$ values (true, 'free_allowance'::text, 1, false) $$,
  'classify quota admits u3 independently while coach is capped'
);

-- 20. refund_ai_quota decrements daily usage, FreeAllowance, and global count without reversing recorded token cost
do $$
begin
  perform public.refund_ai_quota('u1', 'coach', (now() at time zone 'utc')::date, 'v1:d1', true);
end $$;

select results_eq(
  $$
    select
      (select coaching_count from public.ai_daily_usage where user_id = 'u1' and usage_date = (now() at time zone 'utc')::date),
      (select coach_used from public.free_allowance_usage where subject_digest = 'v1:d1'),
      (select coaching_count from public.ai_daily_global_usage where usage_date = (now() at time zone 'utc')::date),
      (select estimated_cost_usd_micros from public.ai_daily_global_usage where usage_date = (now() at time zone 'utc')::date)
  $$,
  $$ values (1, 1, 2, 500::bigint) $$,
  'refund_ai_quota refunds daily/global/FreeAllowance counts while preserving recorded API spend'
);

-- 21. Repeated refunds on u3 classify never underflow counts below 0
do $$
begin
  perform public.refund_ai_quota('u3', 'classify', (now() at time zone 'utc')::date, 'v1:d3', true);
  perform public.refund_ai_quota('u3', 'classify', (now() at time zone 'utc')::date, 'v1:d3', true);
  perform public.refund_ai_quota('nonexistent-user', 'coach', (now() at time zone 'utc')::date, 'v1:none', true);
end $$;

select results_eq(
  $$
    select
      (select classify_count from public.ai_daily_usage where user_id = 'u3' and usage_date = (now() at time zone 'utc')::date),
      (select classify_used from public.free_allowance_usage where subject_digest = 'v1:d3'),
      (select classify_count from public.ai_daily_global_usage where usage_date = (now() at time zone 'utc')::date)
  $$,
  $$ values (0, 0, 0) $$,
  'repeated or empty refunds clamp safely at 0 without stealing other counters'
);

-- 22. InviteGrant redemption succeeds and normalizes uppercase code
do $$
begin
  insert into public.invite_codes (code, max_uses, grant_duration_days, is_active)
  values ('BETA-TEST-01', 5, 30, true);
end $$;

select results_eq(
  $$ select ok, error_code from public.redeem_invite_code('u_invite', 'beta-test-01') $$,
  $$ values (true, null::text) $$,
  'redeem_invite_code grants entitlement for active invite code'
);

-- 23. Redeemed InviteGrant admits coach with paid daily limit (15) without consuming FreeAllowance
select results_eq(
  $$
    select allowed, admitted_source, daily_limit, free_coach_used
    from public.authorize_ai_request('u_invite', 'v1:d_inv', null, 'coach', 15, 5, 100, 5000000)
  $$,
  $$ values (true, 'invite_grant'::text, 15, 0) $$,
  'invite_grant uses paid daily limit without consuming FreeAllowance'
);

-- 24. sync_subscription_webhook creates active subscription
select results_eq(
  $$
    select already_processed, applied, tombstoned
    from public.sync_subscription_webhook(
      'evt_sub_active',
      100,
      'u_invite',
      'stripe',
      'sub_live_1',
      'cus_live_1',
      'price_799',
      'active',
      false,
      now() + interval '30 days'
    )
  $$,
  $$ values (false, true, false) $$,
  'sync_subscription_webhook applies initial active subscription'
);

-- 25. Subscription entitlement takes precedence over invite_grant
select results_eq(
  $$ select entitlement_source from public.get_entitlement_status('u_invite', 'v1:d_inv', null) $$,
  $$ values ('subscription'::text) $$,
  'subscription takes entitlement precedence over active invite_grant'
);

-- 26. Stale out-of-order webhook event is ignored by monotonic guard
select results_eq(
  $$
    select already_processed, applied, tombstoned
    from public.sync_subscription_webhook(
      'evt_sub_stale',
      50,
      'u_invite',
      'stripe',
      'sub_live_1',
      'cus_live_1',
      'price_799',
      'past_due',
      false,
      now() + interval '30 days'
    )
  $$,
  $$ values (false, false, false) $$,
  'stale out-of-order webhook event does not overwrite newer subscription state'
);

-- 27. Live subscriber transition to canceled updates existing row cleanly
select results_eq(
  $$
    select already_processed, applied, tombstoned
    from public.sync_subscription_webhook(
      'evt_sub_cancel_live',
      150,
      'u_invite',
      'stripe',
      'sub_live_1',
      'cus_live_1',
      'price_799',
      'canceled',
      false,
      now()
    )
  $$,
  $$ values (false, true, false) $$,
  'live subscription transition to canceled updates existing user row'
);

-- 28. Post-deletion customer.subscription.deleted (canceled) never creates a new row
select results_eq(
  $$
    select already_processed, applied, tombstoned
    from public.sync_subscription_webhook(
      'evt_after_delete',
      200,
      'u_already_deleted',
      'stripe',
      'sub_deleted_already',
      'cus_deleted',
      'price_799',
      'canceled',
      false,
      now()
    )
  $$,
  $$ values (false, false, false) $$,
  'canceled webhook for deleted user reports applied = false'
);

-- 29. Confirm user_subscriptions has zero rows for u_already_deleted
select is(
  (select count(*)::integer from public.user_subscriptions where user_id = 'u_already_deleted'),
  0,
  'canceled webhook for deleted user never resurrects user_subscriptions'
);

-- 30. delete_user_account_data erases personal rows atomically after sync Stripe cancel
do $$
begin
  insert into public.free_allowance_usage (subject_digest, coach_used, classify_used)
  values ('v1:d_gdpr', 30, 12);

  insert into public.invite_grants (user_id, code)
  values ('u_gdpr', 'BETA-TEST-01');

  insert into public.ai_daily_usage (user_id, usage_date, coaching_count)
  values ('u_gdpr', (now() at time zone 'utc')::date, 4);

  insert into public.ai_request_results (user_id, client_request_id, action, status)
  values ('u_gdpr', '00000000-0000-0000-0000-000000000001'::uuid, 'coach', 'completed');

  perform public.sync_subscription_webhook(
    'evt_gdpr_sub',
    300,
    'u_gdpr',
    'stripe',
    'sub_gdpr_sync',
    'cus_gdpr',
    'price_799',
    'active',
    false,
    now() + interval '30 days'
  );

  perform public.record_ai_token_usage('u_gdpr', date '2026-10-15', 'gemini-2.5-flash', 'chat', 'subscription', false, 10, 0, 10, 0, 100);
  perform public.record_ai_token_usage('u_gdpr', date '2026-10-20', 'gemini-3.8-flash', 'plan_update', 'subscription', false, 20, 0, 20, 0, 200);
  perform public.record_ai_token_usage('u_gdpr', date '2026-11-05', 'gemini-2.5-flash', 'chat', 'subscription', false, 15, 0, 15, 0, 150);
end $$;

select results_eq(
  $$ select billing_cancellation_pending from public.delete_user_account_data('u_gdpr', 'sub_gdpr_sync', null, null) $$,
  $$ values (false) $$,
  'delete_user_account_data returns billing_cancellation_pending = false when sub matches canceled ID'
);

-- 31. Verify personal row erasure, FreeAllowance preservation, and per-month random UUID cost anonymization
select results_eq(
  $$
    with oct as (
      select array_agg(distinct actor_key) as keys, bool_and(is_anonymized) as anon_ok
      from public.ai_monthly_token_usage
      where year_month = '2026-10' and estimated_cost_usd_micros in (100, 200)
    ),
    nov as (
      select actor_key, is_anonymized
      from public.ai_monthly_token_usage
      where year_month = '2026-11' and estimated_cost_usd_micros = 150
    )
    select
      (select count(*)::integer from public.user_subscriptions where user_id = 'u_gdpr'),
      (select count(*)::integer from public.invite_grants where user_id = 'u_gdpr'),
      (select count(*)::integer from public.ai_daily_usage where user_id = 'u_gdpr'),
      (select count(*)::integer from public.ai_request_results where user_id = 'u_gdpr'),
      (select coach_used from public.free_allowance_usage where subject_digest = 'v1:d_gdpr'),
      cardinality(oct.keys),
      (oct.keys[1] like 'deleted:%' and oct.anon_ok),
      (nov.actor_key like 'deleted:%' and nov.is_anonymized and nov.actor_key <> oct.keys[1])
    from oct, nov
  $$,
  $$ values (0, 0, 0, 0, 30, 1, true, true) $$,
  'erased personal rows stay deleted, FreeAllowance persists, and monthly cost keys are unlinked per month'
);

-- 32. Concurrent subscription detected under advisory lock creates tombstone
do $$
begin
  perform public.sync_subscription_webhook(
    'evt_race_sub',
    400,
    'u_race',
    'stripe',
    'sub_concurrent_new',
    'cus_race',
    'price_799',
    'active',
    false,
    now() + interval '30 days'
  );
end $$;

select results_eq(
  $$ select billing_cancellation_pending from public.delete_user_account_data('u_race', null, null, null) $$,
  $$ values (true) $$,
  'delete_user_account_data queues concurrent subscription into tombstone and returns pending = true'
);

-- 33. Subsequent webhook for tombstoned subscription returns tombstoned = true
select results_eq(
  $$
    select already_processed, applied, tombstoned
    from public.sync_subscription_webhook(
      'evt_after_race_tombstone',
      410,
      'u_race',
      'stripe',
      'sub_concurrent_new',
      'cus_race',
      'price_799',
      'active',
      false,
      now() + interval '30 days'
    )
  $$,
  $$ values (false, false, true) $$,
  'tombstoned webhook returns tombstoned = true without applying'
);

-- 34. Tombstone webhook leaves processed_webhook_events un-burned and user_subscriptions empty
select results_eq(
  $$
    select
      (select count(*)::integer from public.processed_webhook_events where event_id = 'evt_after_race_tombstone'),
      (select count(*)::integer from public.user_subscriptions where user_id = 'u_race')
  $$,
  $$ values (0, 0) $$,
  'tombstoned webhook cleans processed_webhook_events for retry and never recreates user_subscriptions'
);

reset role;
select * from finish();

rollback;
