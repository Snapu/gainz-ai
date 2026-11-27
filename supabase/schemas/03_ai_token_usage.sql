-- Declarative schema: Monthly Granular Token Usage & Unit Economics Analytics Views

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
