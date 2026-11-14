-- Migration: Add 30-day retention pruning to consume_ai_quota RPC

create or replace function public.consume_ai_quota(
  p_user_id text,
  p_kind text,
  p_daily_limit integer
)
returns table (
  allowed boolean,
  current_count integer,
  daily_limit integer,
  reset_at timestamptz
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'utc')::date;
  v_reset_at timestamptz := ((v_today + 1)::timestamp at time zone 'utc');
  v_count integer;
begin
  if p_user_id is null or length(trim(p_user_id)) = 0 then
    raise exception 'p_user_id must not be empty';
  end if;

  if p_kind not in ('coach', 'classify') then
    raise exception 'Invalid quota kind: %', p_kind;
  end if;

  -- Automatically delete records older than 30 days for data retention compliance (GDPR)
  delete from public.ai_daily_usage
  where usage_date < v_today - interval '30 days';

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
      return query select true, v_count, p_daily_limit, v_reset_at;
    else
      select u.coaching_count into v_count
      from public.ai_daily_usage u
      where u.user_id = p_user_id and u.usage_date = v_today;

      return query select false, coalesce(v_count, p_daily_limit), p_daily_limit, v_reset_at;
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
      return query select true, v_count, p_daily_limit, v_reset_at;
    else
      select u.classify_count into v_count
      from public.ai_daily_usage u
      where u.user_id = p_user_id and u.usage_date = v_today;

      return query select false, coalesce(v_count, p_daily_limit), p_daily_limit, v_reset_at;
    end if;
  end if;
end;
$$;
