-- Declarative schema: AI Daily Usage, Free Allowance & Atomic Entitlement Authorization
create table if not exists public.ai_daily_usage (
  user_id text not null,
  usage_date date not null default (now() at time zone 'utc')::date,
  coaching_count integer not null default 0 check (coaching_count >= 0),
  classify_count integer not null default 0 check (classify_count >= 0),
  updated_at timestamptz not null default now(),
  constraint ai_daily_usage_pkey primary key (user_id, usage_date)
);

create index if not exists idx_ai_daily_usage_usage_date on public.ai_daily_usage (usage_date);

alter table public.ai_daily_usage enable row level security;

create policy "service_role_full_access"
on public.ai_daily_usage
for all
to service_role
using (true)
with check (true);

revoke all on table public.ai_daily_usage from public, anon, authenticated;
grant select, insert, update, delete on table public.ai_daily_usage to service_role;

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

create table if not exists public.free_allowance_usage (
  subject_digest text primary key,
  coach_used integer not null default 0 check (coach_used >= 0),
  classify_used integer not null default 0 check (classify_used >= 0),
  updated_at timestamptz not null default now()
);

create index if not exists idx_free_allowance_usage_updated_at
  on public.free_allowance_usage (updated_at);

alter table public.free_allowance_usage enable row level security;

create policy "service_role_full_access"
on public.free_allowance_usage
for all
to service_role
using (true)
with check (true);

revoke all on table public.free_allowance_usage from public, anon, authenticated;
grant select, insert, update, delete on table public.free_allowance_usage to service_role;

create or replace function public.get_entitlement_status(
  p_user_id text,
  p_subject_digest text,
  p_previous_subject_digest text default null
)
returns table (
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
  v_free_coach_limit constant integer := 30;
  v_free_classify_limit constant integer := 40;
  v_coach_used integer := 0;
  v_classify_used integer := 0;
  v_prev_coach_used integer := 0;
  v_prev_classify_used integer := 0;
  v_can_use_coach boolean;
  v_can_use_classify boolean;
  v_source text;
begin
  if p_user_id is null or length(trim(p_user_id)) = 0 then
    raise exception 'p_user_id must not be empty';
  end if;

  if p_subject_digest is null or length(trim(p_subject_digest)) = 0 then
    raise exception 'p_subject_digest must not be empty';
  end if;

  select f.coach_used, f.classify_used
  into v_coach_used, v_classify_used
  from public.free_allowance_usage f
  where f.subject_digest = p_subject_digest;

  v_coach_used := coalesce(v_coach_used, 0);
  v_classify_used := coalesce(v_classify_used, 0);

  if p_previous_subject_digest is not null
     and length(trim(p_previous_subject_digest)) > 0
     and p_previous_subject_digest <> p_subject_digest then
    select f.coach_used, f.classify_used
    into v_prev_coach_used, v_prev_classify_used
    from public.free_allowance_usage f
    where f.subject_digest = p_previous_subject_digest;

    v_coach_used := greatest(v_coach_used, coalesce(v_prev_coach_used, 0));
    v_classify_used := greatest(v_classify_used, coalesce(v_prev_classify_used, 0));
  end if;

  v_can_use_coach := v_coach_used < v_free_coach_limit;
  v_can_use_classify := v_classify_used < v_free_classify_limit;
  v_source := case when v_can_use_coach or v_can_use_classify then 'free_allowance' else 'none' end;

  return query select
    v_source,
    v_can_use_coach,
    v_can_use_classify,
    v_now,
    v_coach_used,
    v_free_coach_limit,
    v_classify_used,
    v_free_classify_limit;
end;
$$;

revoke all on function public.get_entitlement_status(text, text, text) from public, anon, authenticated;
grant execute on function public.get_entitlement_status(text, text, text) to service_role;

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

create or replace function public.refund_ai_quota(
  p_user_id text,
  p_kind text,
  p_usage_date date default null,
  p_subject_digest text default null,
  p_refund_free_allowance boolean default false
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_usage_date date := coalesce(p_usage_date, (now() at time zone 'utc')::date);
  v_now timestamptz := now();
begin
  if p_user_id is null or length(trim(p_user_id)) = 0 then
    raise exception 'p_user_id must not be empty';
  end if;

  if p_kind is null or p_kind not in ('coach', 'classify') then
    raise exception 'Invalid quota kind: %', p_kind;
  end if;

  -- Lock ordering matches authorize_ai_request:
  -- 1. ai_daily_usage(user_id, usage_date) -> 2. free_allowance_usage(subject_digest) -> 3. ai_daily_global_usage(usage_date)
  if p_kind = 'coach' then
    update public.ai_daily_usage
    set coaching_count = coaching_count - 1,
        updated_at = v_now
    where user_id = p_user_id
      and usage_date = v_usage_date
      and coaching_count > 0;

    if found then
      if p_refund_free_allowance and p_subject_digest is not null and length(trim(p_subject_digest)) > 0 then
        update public.free_allowance_usage
        set coach_used = greatest(0, coach_used - 1),
            updated_at = v_now
        where subject_digest = p_subject_digest;
      end if;

      update public.ai_daily_global_usage
      set coaching_count = greatest(0, coaching_count - 1),
          updated_at = v_now
      where usage_date = v_usage_date;
    end if;
  elsif p_kind = 'classify' then
    update public.ai_daily_usage
    set classify_count = classify_count - 1,
        updated_at = v_now
    where user_id = p_user_id
      and usage_date = v_usage_date
      and classify_count > 0;

    if found then
      if p_refund_free_allowance and p_subject_digest is not null and length(trim(p_subject_digest)) > 0 then
        update public.free_allowance_usage
        set classify_used = greatest(0, classify_used - 1),
            updated_at = v_now
        where subject_digest = p_subject_digest;
      end if;

      update public.ai_daily_global_usage
      set classify_count = greatest(0, classify_count - 1),
          updated_at = v_now
      where usage_date = v_usage_date;
    end if;
  end if;
end;
$$;

revoke all on function public.refund_ai_quota(text, text, date, text, boolean) from public, anon, authenticated;
grant execute on function public.refund_ai_quota(text, text, date, text, boolean) to service_role;
