-- Distinguish global daily cap trips from per-user quota limits and allow
-- refund_ai_quota to target the exact UTC usage date that consumed the slot.

drop function if exists public.consume_ai_quota(text, text, integer);

create or replace function public.consume_ai_quota(
  p_user_id text,
  p_kind text,
  p_daily_limit integer
)
returns table (
  allowed boolean,
  current_count integer,
  daily_limit integer,
  reset_at timestamptz,
  global_capped boolean
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'utc')::date;
  v_reset_at timestamptz := ((v_today + 1)::timestamp at time zone 'utc');
  v_count integer;
  v_global_daily_cap constant integer := 10000;
  v_global_count integer;
begin
  if p_user_id is null or length(trim(p_user_id)) = 0 then
    raise exception 'p_user_id must not be empty';
  end if;

  if p_kind not in ('coach', 'classify') then
    raise exception 'Invalid quota kind: %', p_kind;
  end if;

  -- Global daily ceiling protection against runaway billing/bot proliferation
  if p_kind = 'coach' then
    select coalesce(sum(coaching_count), 0) into v_global_count
    from public.ai_daily_usage
    where usage_date = v_today;

    if v_global_count >= v_global_daily_cap then
      return query select false, p_daily_limit, p_daily_limit, v_reset_at, true;
      return;
    end if;
  else
    select coalesce(sum(classify_count), 0) into v_global_count
    from public.ai_daily_usage
    where usage_date = v_today;

    if v_global_count >= (v_global_daily_cap * 2) then
      return query select false, p_daily_limit, p_daily_limit, v_reset_at, true;
      return;
    end if;
  end if;

  -- Probabilistically prune records older than 30 days (~1% of requests) to prevent hot-path lock churn
  if random() < 0.01 then
    delete from public.ai_daily_usage
    where usage_date < (v_today - 30);
  end if;

  insert into public.ai_daily_usage (user_id, usage_date)
  values (p_user_id, v_today)
  on conflict (user_id, usage_date) do nothing;

  if p_kind = 'coach' then
    update public.ai_daily_usage
    set coaching_count = public.ai_daily_usage.coaching_count + 1,
        updated_at = now()
    where public.ai_daily_usage.user_id = p_user_id
      and public.ai_daily_usage.usage_date = v_today
      and public.ai_daily_usage.coaching_count < p_daily_limit
    returning public.ai_daily_usage.coaching_count into v_count;

    if found then
      return query select true, v_count, p_daily_limit, v_reset_at, false;
    else
      select u.coaching_count into v_count
      from public.ai_daily_usage u
      where u.user_id = p_user_id and u.usage_date = v_today;

      return query select false, coalesce(v_count, p_daily_limit), p_daily_limit, v_reset_at, false;
    end if;
  else
    update public.ai_daily_usage
    set classify_count = public.ai_daily_usage.classify_count + 1,
        updated_at = now()
    where public.ai_daily_usage.user_id = p_user_id
      and public.ai_daily_usage.usage_date = v_today
      and public.ai_daily_usage.classify_count < p_daily_limit
    returning public.ai_daily_usage.classify_count into v_count;

    if found then
      return query select true, v_count, p_daily_limit, v_reset_at, false;
    else
      select u.classify_count into v_count
      from public.ai_daily_usage u
      where u.user_id = p_user_id and u.usage_date = v_today;

      return query select false, coalesce(v_count, p_daily_limit), p_daily_limit, v_reset_at, false;
    end if;
  end if;
end;
$$;

revoke all on function public.consume_ai_quota(text, text, integer) from public, anon, authenticated;
grant execute on function public.consume_ai_quota(text, text, integer) to service_role;

drop function if exists public.refund_ai_quota(text, text);

create or replace function public.refund_ai_quota(
  p_user_id text,
  p_kind text,
  p_usage_date date default null
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_usage_date date := coalesce(p_usage_date, (now() at time zone 'utc')::date);
begin
  if p_user_id is null or length(trim(p_user_id)) = 0 then
    raise exception 'p_user_id must not be empty';
  end if;

  if p_kind not in ('coach', 'classify') then
    raise exception 'Invalid quota kind: %', p_kind;
  end if;

  if p_kind = 'coach' then
    update public.ai_daily_usage
    set coaching_count = greatest(0, coaching_count - 1),
        updated_at = now()
    where user_id = p_user_id
      and usage_date = v_usage_date;
  elsif p_kind = 'classify' then
    update public.ai_daily_usage
    set classify_count = greatest(0, classify_count - 1),
        updated_at = now()
    where user_id = p_user_id
      and usage_date = v_usage_date;
  end if;
end;
$$;

revoke all on function public.refund_ai_quota(text, text, date) from public, anon, authenticated;
grant execute on function public.refund_ai_quota(text, text, date) to service_role;
