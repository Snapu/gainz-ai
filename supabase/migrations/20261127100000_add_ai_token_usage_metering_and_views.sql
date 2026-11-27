-- Add O(1) daily AI spend cap tracking, monthly token usage metering, and service_role-only analytics views

begin;

create table if not exists public.ai_daily_global_usage (
  usage_date date not null default (now() at time zone 'utc')::date,
  coaching_count integer not null default 0 check (coaching_count >= 0),
  classify_count integer not null default 0 check (classify_count >= 0),
  estimated_cost_usd_micros bigint not null default 0 check (estimated_cost_usd_micros >= 0),
  updated_at timestamptz not null default now(),
  constraint ai_daily_global_usage_pkey primary key (usage_date)
);

alter table public.ai_daily_global_usage enable row level security;

drop policy if exists "service_role_full_access" on public.ai_daily_global_usage;
create policy "service_role_full_access"
on public.ai_daily_global_usage
for all
to service_role
using (true)
with check (true);

revoke all on table public.ai_daily_global_usage from public, anon, authenticated;
grant select, insert, update, delete on table public.ai_daily_global_usage to service_role;

alter table public.ai_daily_global_usage
  add column if not exists estimated_cost_usd_micros bigint not null default 0 check (estimated_cost_usd_micros >= 0);

drop function if exists public.authorize_ai_request(text, text, text, text, integer, integer, integer);

create or replace function public.authorize_ai_request(
  p_user_id text,
  p_subject_digest text,
  p_previous_subject_digest text default null,
  p_kind text default 'coach',
  p_paid_daily_limit integer default 15,
  p_free_daily_limit integer default 5,
  p_global_cap integer default null,
  p_global_cost_cap_usd_micros bigint default null
)
returns table (
  allowed boolean,
  denial_reason text,
  admitted_source text,
  current_count integer,
  daily_limit integer,
  reset_at timestamptz,
  global_capped boolean,
  entitlement_source text,
  can_use_coach boolean,
  can_use_classify boolean,
  evaluated_at timestamptz,
  free_coach_used integer,
  free_coach_limit integer,
  free_classify_used integer,
  free_classify_limit integer
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_now timestamptz := now();
  v_today date := (v_now at time zone 'utc')::date;
  v_reset_at timestamptz := ((v_today + 1)::timestamp at time zone 'utc');
  v_global_daily_cap constant integer := 10000;
  v_default_global_cost_cap_micros constant bigint := 5000000;
  v_global_cap integer;
  v_global_cost_cap bigint;
  v_global_count integer;
  v_global_cost_micros bigint := 0;
  v_free_coach_limit constant integer := 30;
  v_free_classify_limit constant integer := 40;
  v_daily_count integer := 0;
  v_free_coach_used integer := 0;
  v_free_classify_used integer := 0;
  v_prev_coach_used integer := 0;
  v_prev_classify_used integer := 0;
  v_can_use_coach boolean;
  v_can_use_classify boolean;
  v_entitlement_source text;
begin
  if p_user_id is null or length(trim(p_user_id)) = 0 then
    raise exception 'p_user_id must not be empty';
  end if;

  if p_subject_digest is null or length(trim(p_subject_digest)) = 0 then
    raise exception 'p_subject_digest must not be empty';
  end if;

  if p_kind is null or p_kind not in ('coach', 'classify') then
    raise exception 'Invalid quota kind: %', p_kind;
  end if;

  if p_free_daily_limit is null or p_free_daily_limit <= 0 then
    raise exception 'p_free_daily_limit must be positive';
  end if;

  v_global_cap := coalesce(
    p_global_cap,
    case when p_kind = 'coach' then v_global_daily_cap else v_global_daily_cap * 2 end
  );
  v_global_cost_cap := coalesce(p_global_cost_cap_usd_micros, v_default_global_cost_cap_micros);

  -- Lock-free O(1) fast-path check against global daily request + spend caps (no writes or pruning on rejection)
  if v_global_cap > 0 and v_global_cost_cap > 0 then
    if p_kind = 'coach' then
      select g.coaching_count, g.estimated_cost_usd_micros
      into v_global_count, v_global_cost_micros
      from public.ai_daily_global_usage g
      where g.usage_date = v_today;
    else
      select g.classify_count, g.estimated_cost_usd_micros
      into v_global_count, v_global_cost_micros
      from public.ai_daily_global_usage g
      where g.usage_date = v_today;
    end if;
  end if;

  if v_global_cap <= 0
     or coalesce(v_global_count, 0) >= v_global_cap
     or v_global_cost_cap <= 0
     or coalesce(v_global_cost_micros, 0) >= v_global_cost_cap then
    select f.coach_used, f.classify_used
    into v_free_coach_used, v_free_classify_used
    from public.free_allowance_usage f
    where f.subject_digest = p_subject_digest;

    v_free_coach_used := coalesce(v_free_coach_used, 0);
    v_free_classify_used := coalesce(v_free_classify_used, 0);

    if p_previous_subject_digest is not null
       and length(trim(p_previous_subject_digest)) > 0
       and p_previous_subject_digest <> p_subject_digest then
      select f.coach_used, f.classify_used
      into v_prev_coach_used, v_prev_classify_used
      from public.free_allowance_usage f
      where f.subject_digest = p_previous_subject_digest;

      v_free_coach_used := greatest(v_free_coach_used, coalesce(v_prev_coach_used, 0));
      v_free_classify_used := greatest(v_free_classify_used, coalesce(v_prev_classify_used, 0));
    end if;

    v_can_use_coach := v_free_coach_used < v_free_coach_limit;
    v_can_use_classify := v_free_classify_used < v_free_classify_limit;
    v_entitlement_source := case when v_can_use_coach or v_can_use_classify then 'free_allowance' else 'none' end;

    return query select
      false,
      'rate-limit-exceeded'::text,
      'none'::text,
      p_free_daily_limit,
      p_free_daily_limit,
      v_reset_at,
      true,
      v_entitlement_source,
      v_can_use_coach,
      v_can_use_classify,
      v_now,
      v_free_coach_used,
      v_free_coach_limit,
      v_free_classify_used,
      v_free_classify_limit;
    return;
  end if;

  -- Probabilistically prune expired request recovery rows (30-minute hard TTL) on coach requests
  if p_kind = 'coach' and random() < 0.05 then
    delete from public.ai_request_results
    where expires_at <= v_now;
  end if;

  -- Probabilistically prune daily rows (30d) and FreeAllowance inactivity rows (24 months, separate TTL)
  if random() < 0.01 then
    delete from public.ai_daily_usage
    where usage_date < (v_today - 30);

    delete from public.ai_daily_global_usage
    where usage_date < (v_today - 30);

    delete from public.free_allowance_usage
    where updated_at < (v_now - interval '24 months');
  end if;

  -- Deadlock-free lock ordering matching refund_ai_quota:
  -- 1. ai_daily_usage(user_id, usage_date) -> 2. free_allowance_usage(subject_digest) -> 3. ai_daily_global_usage(usage_date)
  insert into public.ai_daily_usage (user_id, usage_date)
  values (p_user_id, v_today)
  on conflict (user_id, usage_date) do nothing;

  if p_kind = 'coach' then
    select u.coaching_count into v_daily_count
    from public.ai_daily_usage u
    where u.user_id = p_user_id and u.usage_date = v_today
    for update;
  else
    select u.classify_count into v_daily_count
    from public.ai_daily_usage u
    where u.user_id = p_user_id and u.usage_date = v_today
    for update;
  end if;

  if p_previous_subject_digest is not null
     and length(trim(p_previous_subject_digest)) > 0
     and p_previous_subject_digest <> p_subject_digest then
    select f.coach_used, f.classify_used
    into v_prev_coach_used, v_prev_classify_used
    from public.free_allowance_usage f
    where f.subject_digest = p_previous_subject_digest;
  end if;

  insert into public.free_allowance_usage (subject_digest, coach_used, classify_used, updated_at)
  values (
    p_subject_digest,
    coalesce(v_prev_coach_used, 0),
    coalesce(v_prev_classify_used, 0),
    v_now
  )
  on conflict (subject_digest) do update
  set coach_used = greatest(public.free_allowance_usage.coach_used, excluded.coach_used),
      classify_used = greatest(public.free_allowance_usage.classify_used, excluded.classify_used),
      updated_at = v_now
  where public.free_allowance_usage.coach_used < excluded.coach_used
     or public.free_allowance_usage.classify_used < excluded.classify_used;

  select f.coach_used, f.classify_used
  into v_free_coach_used, v_free_classify_used
  from public.free_allowance_usage f
  where f.subject_digest = p_subject_digest
  for update;

  v_can_use_coach := v_free_coach_used < v_free_coach_limit;
  v_can_use_classify := v_free_classify_used < v_free_classify_limit;
  v_entitlement_source := case when v_can_use_coach or v_can_use_classify then 'free_allowance' else 'none' end;

  -- Evaluate coach vs classify pools independently so exhausting 40 classify calls never blocks coach requests
  if (p_kind = 'coach' and v_free_coach_used >= v_free_coach_limit)
     or (p_kind = 'classify' and v_free_classify_used >= v_free_classify_limit) then
    return query select
      false,
      'payment-required'::text,
      'none'::text,
      v_daily_count,
      p_free_daily_limit,
      v_reset_at,
      false,
      v_entitlement_source,
      v_can_use_coach,
      v_can_use_classify,
      v_now,
      v_free_coach_used,
      v_free_coach_limit,
      v_free_classify_used,
      v_free_classify_limit;
    return;
  end if;

  -- Enforce free-phase daily limit before locking or modifying the global counter
  if v_daily_count >= p_free_daily_limit then
    return query select
      false,
      'rate-limit-exceeded'::text,
      'none'::text,
      v_daily_count,
      p_free_daily_limit,
      v_reset_at,
      false,
      v_entitlement_source,
      v_can_use_coach,
      v_can_use_classify,
      v_now,
      v_free_coach_used,
      v_free_coach_limit,
      v_free_classify_used,
      v_free_classify_limit;
    return;
  end if;

  insert into public.ai_daily_global_usage (usage_date, coaching_count, classify_count, updated_at)
  values (
    v_today,
    case when p_kind = 'coach' then 1 else 0 end,
    case when p_kind = 'classify' then 1 else 0 end,
    v_now
  )
  on conflict (usage_date) do update
  set coaching_count = public.ai_daily_global_usage.coaching_count + case when p_kind = 'coach' then 1 else 0 end,
      classify_count = public.ai_daily_global_usage.classify_count + case when p_kind = 'classify' then 1 else 0 end,
      updated_at = v_now
  where (
    case
      when p_kind = 'coach' then public.ai_daily_global_usage.coaching_count
      else public.ai_daily_global_usage.classify_count
    end
  ) < v_global_cap
    and public.ai_daily_global_usage.estimated_cost_usd_micros < v_global_cost_cap;

  if not found then
    return query select
      false,
      'rate-limit-exceeded'::text,
      'none'::text,
      p_free_daily_limit,
      p_free_daily_limit,
      v_reset_at,
      true,
      v_entitlement_source,
      v_can_use_coach,
      v_can_use_classify,
      v_now,
      v_free_coach_used,
      v_free_coach_limit,
      v_free_classify_used,
      v_free_classify_limit;
    return;
  end if;

  if p_kind = 'coach' then
    update public.ai_daily_usage
    set coaching_count = public.ai_daily_usage.coaching_count + 1,
        updated_at = v_now
    where public.ai_daily_usage.user_id = p_user_id
      and public.ai_daily_usage.usage_date = v_today
    returning public.ai_daily_usage.coaching_count into v_daily_count;

    update public.free_allowance_usage
    set coach_used = public.free_allowance_usage.coach_used + 1,
        updated_at = v_now
    where public.free_allowance_usage.subject_digest = p_subject_digest
    returning public.free_allowance_usage.coach_used into v_free_coach_used;
  else
    update public.ai_daily_usage
    set classify_count = public.ai_daily_usage.classify_count + 1,
        updated_at = v_now
    where public.ai_daily_usage.user_id = p_user_id
      and public.ai_daily_usage.usage_date = v_today
    returning public.ai_daily_usage.classify_count into v_daily_count;

    update public.free_allowance_usage
    set classify_used = public.free_allowance_usage.classify_used + 1,
        updated_at = v_now
    where public.free_allowance_usage.subject_digest = p_subject_digest
    returning public.free_allowance_usage.classify_used into v_free_classify_used;
  end if;

  v_can_use_coach := v_free_coach_used < v_free_coach_limit;
  v_can_use_classify := v_free_classify_used < v_free_classify_limit;
  v_entitlement_source := case when v_can_use_coach or v_can_use_classify then 'free_allowance' else 'none' end;

  return query select
    true,
    null::text,
    'free_allowance'::text,
    v_daily_count,
    p_free_daily_limit,
    v_reset_at,
    false,
    v_entitlement_source,
    v_can_use_coach,
    v_can_use_classify,
    v_now,
    v_free_coach_used,
    v_free_coach_limit,
    v_free_classify_used,
    v_free_classify_limit;
end;
$$;

revoke all on function public.authorize_ai_request(text, text, text, text, integer, integer, integer, bigint) from public, anon, authenticated;
grant execute on function public.authorize_ai_request(text, text, text, text, integer, integer, integer, bigint) to service_role;

create table if not exists public.ai_monthly_token_usage (
  actor_key text not null,
  year_month char(7) not null check (year_month ~ '^[0-9]{4}-[0-9]{2}$'),
  model text not null,
  request_kind text not null check (
    request_kind in (
      'initial_plan',
      'plan_regeneration',
      'plan_update',
      'session_briefing',
      'chat',
      'classify'
    )
  ),
  entitlement_source text not null check (
    entitlement_source in ('subscription', 'invite_grant', 'free_allowance', 'none')
  ),
  is_anonymized boolean not null default false,
  request_count integer not null default 0 check (request_count >= 0),
  unmeasured_count integer not null default 0 check (unmeasured_count >= 0),
  prompt_tokens bigint not null default 0 check (prompt_tokens >= 0),
  cached_tokens bigint not null default 0 check (cached_tokens >= 0),
  output_tokens bigint not null default 0 check (output_tokens >= 0),
  thinking_tokens bigint not null default 0 check (thinking_tokens >= 0),
  estimated_cost_usd_micros bigint not null default 0 check (estimated_cost_usd_micros >= 0),
  updated_at timestamptz not null default now(),
  constraint ai_monthly_token_usage_pkey primary key (
    actor_key,
    year_month,
    model,
    request_kind,
    entitlement_source
  )
);

create index if not exists idx_ai_monthly_token_usage_year_month
  on public.ai_monthly_token_usage (year_month);

alter table public.ai_monthly_token_usage enable row level security;

drop policy if exists "service_role_full_access" on public.ai_monthly_token_usage;
create policy "service_role_full_access"
on public.ai_monthly_token_usage
for all
to service_role
using (true)
with check (true);

revoke all on table public.ai_monthly_token_usage from public, anon, authenticated;
grant select, insert, update, delete on table public.ai_monthly_token_usage to service_role;

create or replace function public.record_ai_token_usage(
  p_actor_key text,
  p_usage_date date,
  p_model text,
  p_request_kind text,
  p_entitlement_source text,
  p_unmeasured boolean default false,
  p_prompt_tokens bigint default 0,
  p_cached_tokens bigint default 0,
  p_output_tokens bigint default 0,
  p_thinking_tokens bigint default 0,
  p_estimated_cost_usd_micros bigint default 0
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_usage_date date := coalesce(p_usage_date, (now() at time zone 'utc')::date);
  v_year_month char(7) := to_char(v_usage_date, 'YYYY-MM');
  v_now timestamptz := now();
  v_actor_key text := trim(p_actor_key);
  v_model text := trim(p_model);
  v_unmeasured integer := case when coalesce(p_unmeasured, false) then 1 else 0 end;
  v_prompt bigint := greatest(0, coalesce(p_prompt_tokens, 0));
  v_cached bigint := greatest(0, coalesce(p_cached_tokens, 0));
  v_output bigint := greatest(0, coalesce(p_output_tokens, 0));
  v_thinking bigint := greatest(0, coalesce(p_thinking_tokens, 0));
  v_cost_micros bigint := greatest(0, coalesce(p_estimated_cost_usd_micros, 0));
begin
  if p_actor_key is null or length(v_actor_key) = 0 then
    raise exception 'p_actor_key must not be empty';
  end if;

  if p_model is null or length(v_model) = 0 then
    raise exception 'p_model must not be empty';
  end if;

  if p_request_kind is null or p_request_kind not in (
    'initial_plan',
    'plan_regeneration',
    'plan_update',
    'session_briefing',
    'chat',
    'classify'
  ) then
    raise exception 'Invalid request_kind: %', p_request_kind;
  end if;

  if p_entitlement_source is null or p_entitlement_source not in (
    'subscription',
    'invite_grant',
    'free_allowance',
    'none'
  ) then
    raise exception 'Invalid entitlement_source: %', p_entitlement_source;
  end if;

  -- request_count records each billed upstream model invocation (including fallback attempts).
  insert into public.ai_monthly_token_usage (
    actor_key,
    year_month,
    model,
    request_kind,
    entitlement_source,
    request_count,
    unmeasured_count,
    prompt_tokens,
    cached_tokens,
    output_tokens,
    thinking_tokens,
    estimated_cost_usd_micros,
    updated_at
  )
  values (
    v_actor_key,
    v_year_month,
    v_model,
    p_request_kind,
    p_entitlement_source,
    1,
    v_unmeasured,
    v_prompt,
    v_cached,
    v_output,
    v_thinking,
    v_cost_micros,
    v_now
  )
  on conflict (actor_key, year_month, model, request_kind, entitlement_source) do update
  set request_count = public.ai_monthly_token_usage.request_count + 1,
      unmeasured_count = public.ai_monthly_token_usage.unmeasured_count + v_unmeasured,
      prompt_tokens = public.ai_monthly_token_usage.prompt_tokens + v_prompt,
      cached_tokens = public.ai_monthly_token_usage.cached_tokens + v_cached,
      output_tokens = public.ai_monthly_token_usage.output_tokens + v_output,
      thinking_tokens = public.ai_monthly_token_usage.thinking_tokens + v_thinking,
      estimated_cost_usd_micros =
        public.ai_monthly_token_usage.estimated_cost_usd_micros + v_cost_micros,
      updated_at = v_now;

  if v_cost_micros > 0 then
    insert into public.ai_daily_global_usage (usage_date, estimated_cost_usd_micros, updated_at)
    values (v_usage_date, v_cost_micros, v_now)
    on conflict (usage_date) do update
    set estimated_cost_usd_micros =
          public.ai_daily_global_usage.estimated_cost_usd_micros + v_cost_micros,
        updated_at = v_now;
  end if;
end;
$$;

revoke all on function public.record_ai_token_usage(text, date, text, text, text, boolean, bigint, bigint, bigint, bigint, bigint) from public, anon, authenticated;
grant execute on function public.record_ai_token_usage(text, date, text, text, text, boolean, bigint, bigint, bigint, bigint, bigint) to service_role;

create or replace view public.v_ai_user_costs
with (security_invoker = true) as
select
  year_month,
  actor_key,
  bool_or(is_anonymized) as is_anonymized,
  sum(request_count)::bigint as request_count,
  sum(unmeasured_count)::bigint as unmeasured_count,
  sum(prompt_tokens)::bigint as prompt_tokens,
  sum(cached_tokens)::bigint as cached_tokens,
  sum(output_tokens)::bigint as output_tokens,
  sum(thinking_tokens)::bigint as thinking_tokens,
  round((sum(estimated_cost_usd_micros) / 1000000.0)::numeric, 6) as total_cost_usd,
  round((sum(estimated_cost_usd_micros) * 0.92 / 1000000.0)::numeric, 6) as total_cost_eur
from public.ai_monthly_token_usage
group by year_month, actor_key;

revoke all on public.v_ai_user_costs from public, anon, authenticated;
grant select on public.v_ai_user_costs to service_role;

create or replace view public.v_ai_unit_economics_monthly
with (security_invoker = true) as
with user_totals as (
  select
    year_month,
    actor_key,
    sum(request_count)::bigint as user_requests,
    sum(unmeasured_count)::bigint as user_unmeasured,
    sum(estimated_cost_usd_micros)::bigint as user_cost_micros
  from public.ai_monthly_token_usage
  group by year_month, actor_key
),
kind_breakdown as (
  select
    year_month,
    jsonb_object_agg(request_kind, kind_cost_usd) as cost_usd_by_kind
  from (
    select
      year_month,
      request_kind,
      round((sum(estimated_cost_usd_micros) / 1000000.0)::numeric, 6) as kind_cost_usd
    from public.ai_monthly_token_usage
    group by year_month, request_kind
  ) k
  group by year_month
),
source_breakdown as (
  select
    year_month,
    jsonb_object_agg(entitlement_source, source_cost_usd) as cost_usd_by_source
  from (
    select
      year_month,
      entitlement_source,
      round((sum(estimated_cost_usd_micros) / 1000000.0)::numeric, 6) as source_cost_usd
    from public.ai_monthly_token_usage
    group by year_month, entitlement_source
  ) s
  group by year_month
),
-- Paying-subscriber unit economics: EUR/USD ~ 0.92 FX; 6.06 EUR net payout per 7.99 EUR incl. 19% VAT (~6.71 net - ~0.65 Stripe MoR fee)
subscriber_totals as (
  select
    year_month,
    count(*)::bigint as active_subscribers,
    round((avg(sub_cost_micros) / 1000000.0)::numeric, 6) as subscriber_mean_cost_usd,
    round((6.06 - (avg(sub_cost_micros) * 0.92 / 1000000.0))::numeric, 4) as estimated_margin_eur_per_subscriber
  from (
    select
      year_month,
      actor_key,
      sum(estimated_cost_usd_micros)::bigint as sub_cost_micros
    from public.ai_monthly_token_usage
    where entitlement_source = 'subscription'
    group by year_month, actor_key
  ) sub_users
  group by year_month
)
select
  u.year_month,
  count(*)::bigint as active_ai_users,
  sum(u.user_requests)::bigint as total_requests,
  sum(u.user_unmeasured)::bigint as unmeasured_requests,
  round((sum(u.user_cost_micros) / 1000000.0)::numeric, 6) as total_cost_usd,
  round((sum(u.user_cost_micros) * 0.92 / 1000000.0)::numeric, 6) as total_cost_eur,
  round((avg(u.user_cost_micros) / 1000000.0)::numeric, 6) as mean_cost_usd,
  round(
    ((percentile_cont(0.50) within group (order by u.user_cost_micros)) / 1000000.0)::numeric,
    6
  ) as p50_cost_usd,
  round(
    ((percentile_cont(0.95) within group (order by u.user_cost_micros)) / 1000000.0)::numeric,
    6
  ) as p95_cost_usd,
  round((max(u.user_cost_micros) / 1000000.0)::numeric, 6) as max_user_cost_usd,
  round((6.06 - (avg(u.user_cost_micros) * 0.92 / 1000000.0))::numeric, 4) as estimated_margin_eur_per_active_user,
  k.cost_usd_by_kind,
  s.cost_usd_by_source,
  coalesce(sub.active_subscribers, 0)::bigint as active_subscribers,
  sub.subscriber_mean_cost_usd,
  sub.estimated_margin_eur_per_subscriber
from user_totals u
join kind_breakdown k on k.year_month = u.year_month
join source_breakdown s on s.year_month = u.year_month
left join subscriber_totals sub on sub.year_month = u.year_month
group by
  u.year_month,
  k.cost_usd_by_kind,
  s.cost_usd_by_source,
  sub.active_subscribers,
  sub.subscriber_mean_cost_usd,
  sub.estimated_margin_eur_per_subscriber;

revoke all on public.v_ai_unit_economics_monthly from public, anon, authenticated;
grant select on public.v_ai_unit_economics_monthly to service_role;

commit;
