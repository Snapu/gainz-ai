-- Declarative schema: Tester Invite Codes, Active Invite Grants & Redeem Rate Limiting

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
