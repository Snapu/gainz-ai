-- Migration: Tester Invite Codes, Active Invite Grants & Redeem Rate Limiting (TICKET-020)
begin;

create table if not exists public.invite_codes (
  code text primary key check (code = upper(trim(code)) and length(code) between 3 and 64),
  max_uses integer not null check (max_uses > 0),
  used_count integer not null default 0 check (used_count >= 0 and used_count <= max_uses),
  grant_duration_days integer check (grant_duration_days is null or grant_duration_days > 0),
  expires_at timestamptz,
  is_active boolean not null default true,
  note text,
  created_at timestamptz not null default now()
);

alter table public.invite_codes enable row level security;

drop policy if exists "service_role_full_access" on public.invite_codes;
create policy "service_role_full_access"
on public.invite_codes
for all
to service_role
using (true)
with check (true);

revoke all on table public.invite_codes from public, anon, authenticated;
grant select, insert, update, delete on table public.invite_codes to service_role;

create table if not exists public.invite_grants (
  user_id text primary key,
  code text not null references public.invite_codes (code),
  granted_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz
);

create index if not exists idx_invite_grants_code
  on public.invite_grants (code);

alter table public.invite_grants enable row level security;

drop policy if exists "service_role_full_access" on public.invite_grants;
create policy "service_role_full_access"
on public.invite_grants
for all
to service_role
using (true)
with check (true);

revoke all on table public.invite_grants from public, anon, authenticated;
grant select, insert, update, delete on table public.invite_grants to service_role;

create table if not exists public.invite_redeem_attempts (
  rate_key text primary key,
  window_start timestamptz not null default now(),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  updated_at timestamptz not null default now()
);

create index if not exists idx_invite_redeem_attempts_updated_at
  on public.invite_redeem_attempts (updated_at);

alter table public.invite_redeem_attempts enable row level security;

drop policy if exists "service_role_full_access" on public.invite_redeem_attempts;
create policy "service_role_full_access"
on public.invite_redeem_attempts
for all
to service_role
using (true)
with check (true);

revoke all on table public.invite_redeem_attempts from public, anon, authenticated;
grant select, insert, update, delete on table public.invite_redeem_attempts to service_role;

create or replace function public.check_invite_redeem_rate_limit(
  p_user_key text,
  p_ip_key text default null,
  p_user_max_attempts integer default 10,
  p_ip_max_attempts integer default 30,
  p_window_seconds integer default 900
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_now timestamptz := now();
  v_user_key text := trim(coalesce(p_user_key, ''));
  v_ip_key text := nullif(trim(coalesce(p_ip_key, '')), '');
  v_keys text[];
  v_key text;
  v_key_max_attempts integer;
  v_count integer;
  v_cutoff timestamptz;
begin
  if length(v_user_key) = 0 then
    raise exception 'p_user_key must not be empty';
  end if;

  if p_user_max_attempts is null or p_user_max_attempts <= 0 then
    raise exception 'p_user_max_attempts must be positive';
  end if;

  if p_ip_max_attempts is null or p_ip_max_attempts <= 0 then
    raise exception 'p_ip_max_attempts must be positive';
  end if;

  if p_window_seconds is null or p_window_seconds <= 0 then
    raise exception 'p_window_seconds must be positive';
  end if;

  v_cutoff := v_now - make_interval(secs => p_window_seconds);

  if random() < 0.05 then
    delete from public.invite_redeem_attempts
    where updated_at < (v_now - interval '7 days');
  end if;

  if v_ip_key is not null and v_ip_key <> v_user_key then
    v_keys := array[least(v_user_key, v_ip_key), greatest(v_user_key, v_ip_key)];
  else
    v_keys := array[v_user_key];
  end if;

  foreach v_key in array v_keys loop
    insert into public.invite_redeem_attempts (rate_key, window_start, attempt_count, updated_at)
    values (v_key, v_now, 0, v_now)
    on conflict (rate_key) do update
    set window_start = case
          when public.invite_redeem_attempts.window_start <= v_cutoff then v_now
          else public.invite_redeem_attempts.window_start
        end,
        attempt_count = case
          when public.invite_redeem_attempts.window_start <= v_cutoff then 0
          else public.invite_redeem_attempts.attempt_count
        end,
        updated_at = v_now
    returning public.invite_redeem_attempts.attempt_count into v_count;

    v_key_max_attempts := case
      when v_key = v_user_key then p_user_max_attempts
      else p_ip_max_attempts
    end;

    if v_count >= v_key_max_attempts then
      return false;
    end if;
  end loop;

  foreach v_key in array v_keys loop
    update public.invite_redeem_attempts
    set attempt_count = attempt_count + 1,
        updated_at = v_now
    where rate_key = v_key;
  end loop;

  return true;
end;
$$;

revoke all on function public.check_invite_redeem_rate_limit(text, text, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.check_invite_redeem_rate_limit(text, text, integer, integer, integer) to service_role;

create or replace function public.redeem_invite_code(
  p_user_id text,
  p_code text
)
returns table (
  ok boolean,
  error_code text,
  invite_expires_at timestamptz
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_now timestamptz := now();
  v_user_id text := trim(coalesce(p_user_id, ''));
  v_code text := upper(trim(coalesce(p_code, '')));
  v_existing_grant public.invite_grants%rowtype;
  v_existing_code_active boolean := false;
  v_existing_active boolean := false;
  v_code_row public.invite_codes%rowtype;
  v_grant_expires_at timestamptz;
begin
  if length(v_user_id) = 0 then
    raise exception 'p_user_id must not be empty';
  end if;

  if length(v_code) < 3 or length(v_code) > 64 then
    return query select false, 'invite-invalid'::text, null::timestamptz;
    return;
  end if;

  -- Serialize concurrent redemptions per user before any row reads (prevents first-time insert races)
  perform pg_advisory_xact_lock(hashtextextended('redeem_invite_code:' || v_user_id, 0));

  select g.*
  into v_existing_grant
  from public.invite_grants g
  where g.user_id = v_user_id
  for update;

  if v_existing_grant.user_id is not null then
    if v_existing_grant.revoked_at is not null then
      return query select false, 'invite-invalid'::text, null::timestamptz;
      return;
    end if;

    select c.is_active
    into v_existing_code_active
    from public.invite_codes c
    where c.code = v_existing_grant.code;

    v_existing_active :=
      coalesce(v_existing_code_active, false)
      and (v_existing_grant.expires_at is null or v_existing_grant.expires_at > v_now);

    if v_existing_grant.code <> v_code and v_existing_active then
      return query select false, 'invite-already-redeemed'::text, v_existing_grant.expires_at;
      return;
    end if;
  end if;

  select c.*
  into v_code_row
  from public.invite_codes c
  where c.code = v_code
  for update;

  if not found then
    return query select false, 'invite-invalid'::text, null::timestamptz;
    return;
  end if;

  if v_existing_grant.user_id is not null and v_existing_grant.code = v_code then
    if v_existing_active and v_code_row.is_active then
      return query select true, null::text, v_existing_grant.expires_at;
      return;
    end if;

    if not v_code_row.is_active then
      return query select false, 'invite-invalid'::text, null::timestamptz;
      return;
    end if;

    return query select false, 'invite-already-redeemed'::text, null::timestamptz;
    return;
  end if;

  if not v_code_row.is_active then
    return query select false, 'invite-invalid'::text, null::timestamptz;
    return;
  end if;

  if v_code_row.expires_at is not null and v_code_row.expires_at <= v_now then
    return query select false, 'invite-expired'::text, null::timestamptz;
    return;
  end if;

  if v_code_row.used_count >= v_code_row.max_uses then
    return query select false, 'invite-exhausted'::text, null::timestamptz;
    return;
  end if;

  update public.invite_codes
  set used_count = used_count + 1
  where code = v_code
    and used_count < max_uses;

  if not found then
    return query select false, 'invite-exhausted'::text, null::timestamptz;
    return;
  end if;

  v_grant_expires_at := case
    when v_code_row.grant_duration_days is not null
      then v_now + make_interval(days => v_code_row.grant_duration_days)
    else null
  end;

  insert into public.invite_grants (user_id, code, granted_at, expires_at, revoked_at)
  values (v_user_id, v_code, v_now, v_grant_expires_at, null)
  on conflict (user_id) do update
  set code = excluded.code,
      granted_at = excluded.granted_at,
      expires_at = excluded.expires_at,
      revoked_at = null;

  return query select true, null::text, v_grant_expires_at;
end;
$$;

revoke all on function public.redeem_invite_code(text, text) from public, anon, authenticated;
grant execute on function public.redeem_invite_code(text, text) to service_role;

drop function if exists public.get_entitlement_status(text, text, text);
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
  free_classify_limit integer,
  invite_expires_at timestamptz
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
  v_has_active_invite boolean := false;
  v_invite_expires_at timestamptz;
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

  select true, g.expires_at
  into v_has_active_invite, v_invite_expires_at
  from public.invite_grants g
  join public.invite_codes c on c.code = g.code
  where g.user_id = p_user_id
    and c.is_active = true
    and g.revoked_at is null
    and (g.expires_at is null or g.expires_at > v_now);

  v_has_active_invite := coalesce(v_has_active_invite, false);

  if v_has_active_invite then
    v_source := 'invite_grant';
    v_can_use_coach := true;
    v_can_use_classify := true;
  else
    v_invite_expires_at := null;
    v_can_use_coach := v_coach_used < v_free_coach_limit;
    v_can_use_classify := v_classify_used < v_free_classify_limit;
    v_source := case when v_can_use_coach or v_can_use_classify then 'free_allowance' else 'none' end;
  end if;

  return query select
    v_source,
    v_can_use_coach,
    v_can_use_classify,
    v_now,
    v_coach_used,
    v_free_coach_limit,
    v_classify_used,
    v_free_classify_limit,
    v_invite_expires_at;
end;
$$;

revoke all on function public.get_entitlement_status(text, text, text) from public, anon, authenticated;
grant execute on function public.get_entitlement_status(text, text, text) to service_role;

drop function if exists public.authorize_ai_request(text, text, text, text, integer, integer, integer, bigint);
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
  free_classify_limit integer,
  invite_expires_at timestamptz
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
  v_has_active_invite boolean := false;
  v_invite_expires_at timestamptz;
  v_effective_daily_limit integer;
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

  if p_paid_daily_limit is null or p_paid_daily_limit <= 0 then
    raise exception 'p_paid_daily_limit must be positive';
  end if;

  if p_free_daily_limit is null or p_free_daily_limit <= 0 then
    raise exception 'p_free_daily_limit must be positive';
  end if;

  select true, g.expires_at
  into v_has_active_invite, v_invite_expires_at
  from public.invite_grants g
  join public.invite_codes c on c.code = g.code
  where g.user_id = p_user_id
    and c.is_active = true
    and g.revoked_at is null
    and (g.expires_at is null or g.expires_at > v_now);

  v_has_active_invite := coalesce(v_has_active_invite, false);
  if not v_has_active_invite then
    v_invite_expires_at := null;
  end if;
  v_effective_daily_limit := case when v_has_active_invite then p_paid_daily_limit else p_free_daily_limit end;

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

    if v_has_active_invite then
      v_can_use_coach := true;
      v_can_use_classify := true;
      v_entitlement_source := 'invite_grant';
    else
      v_can_use_coach := v_free_coach_used < v_free_coach_limit;
      v_can_use_classify := v_free_classify_used < v_free_classify_limit;
      v_entitlement_source := case when v_can_use_coach or v_can_use_classify then 'free_allowance' else 'none' end;
    end if;

    return query select
      false,
      'rate-limit-exceeded'::text,
      'none'::text,
      v_effective_daily_limit,
      v_effective_daily_limit,
      v_reset_at,
      true,
      v_entitlement_source,
      v_can_use_coach,
      v_can_use_classify,
      v_now,
      v_free_coach_used,
      v_free_coach_limit,
      v_free_classify_used,
      v_free_classify_limit,
      v_invite_expires_at;
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

  if v_has_active_invite then
    select f.coach_used, f.classify_used
    into v_free_coach_used, v_free_classify_used
    from public.free_allowance_usage f
    where f.subject_digest = p_subject_digest;

    v_free_coach_used := greatest(coalesce(v_free_coach_used, 0), coalesce(v_prev_coach_used, 0));
    v_free_classify_used := greatest(coalesce(v_free_classify_used, 0), coalesce(v_prev_classify_used, 0));
    v_can_use_coach := true;
    v_can_use_classify := true;
    v_entitlement_source := 'invite_grant';
  else
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
        v_effective_daily_limit,
        v_reset_at,
        false,
        v_entitlement_source,
        v_can_use_coach,
        v_can_use_classify,
        v_now,
        v_free_coach_used,
        v_free_coach_limit,
        v_free_classify_used,
        v_free_classify_limit,
        null::timestamptz;
      return;
    end if;
  end if;

  -- Enforce per-user daily limit before locking or modifying the global counter
  if v_daily_count >= v_effective_daily_limit then
    return query select
      false,
      'rate-limit-exceeded'::text,
      'none'::text,
      v_daily_count,
      v_effective_daily_limit,
      v_reset_at,
      false,
      v_entitlement_source,
      v_can_use_coach,
      v_can_use_classify,
      v_now,
      v_free_coach_used,
      v_free_coach_limit,
      v_free_classify_used,
      v_free_classify_limit,
      v_invite_expires_at;
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
      v_effective_daily_limit,
      v_effective_daily_limit,
      v_reset_at,
      true,
      v_entitlement_source,
      v_can_use_coach,
      v_can_use_classify,
      v_now,
      v_free_coach_used,
      v_free_coach_limit,
      v_free_classify_used,
      v_free_classify_limit,
      v_invite_expires_at;
    return;
  end if;

  if p_kind = 'coach' then
    update public.ai_daily_usage
    set coaching_count = public.ai_daily_usage.coaching_count + 1,
        updated_at = v_now
    where public.ai_daily_usage.user_id = p_user_id
      and public.ai_daily_usage.usage_date = v_today
    returning public.ai_daily_usage.coaching_count into v_daily_count;

    if not v_has_active_invite then
      update public.free_allowance_usage
      set coach_used = public.free_allowance_usage.coach_used + 1,
          updated_at = v_now
      where public.free_allowance_usage.subject_digest = p_subject_digest
      returning public.free_allowance_usage.coach_used into v_free_coach_used;
    end if;
  else
    update public.ai_daily_usage
    set classify_count = public.ai_daily_usage.classify_count + 1,
        updated_at = v_now
    where public.ai_daily_usage.user_id = p_user_id
      and public.ai_daily_usage.usage_date = v_today
    returning public.ai_daily_usage.classify_count into v_daily_count;

    if not v_has_active_invite then
      update public.free_allowance_usage
      set classify_used = public.free_allowance_usage.classify_used + 1,
          updated_at = v_now
      where public.free_allowance_usage.subject_digest = p_subject_digest
      returning public.free_allowance_usage.classify_used into v_free_classify_used;
    end if;
  end if;

  if not v_has_active_invite then
    v_can_use_coach := v_free_coach_used < v_free_coach_limit;
    v_can_use_classify := v_free_classify_used < v_free_classify_limit;
    v_entitlement_source := case when v_can_use_coach or v_can_use_classify then 'free_allowance' else 'none' end;
  end if;

  return query select
    true,
    null::text,
    case when v_has_active_invite then 'invite_grant'::text else 'free_allowance'::text end,
    v_daily_count,
    v_effective_daily_limit,
    v_reset_at,
    false,
    v_entitlement_source,
    v_can_use_coach,
    v_can_use_classify,
    v_now,
    v_free_coach_used,
    v_free_coach_limit,
    v_free_classify_used,
    v_free_classify_limit,
    v_invite_expires_at;
end;
$$;

revoke all on function public.authorize_ai_request(text, text, text, text, integer, integer, integer, bigint) from public, anon, authenticated;
grant execute on function public.authorize_ai_request(text, text, text, text, integer, integer, integer, bigint) to service_role;

commit;
