create or replace function public.refund_ai_quota(
  p_user_id text,
  p_kind text
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'utc')::date;
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
      and usage_date = v_today;
  elsif p_kind = 'classify' then
    update public.ai_daily_usage
    set classify_count = greatest(0, classify_count - 1),
        updated_at = now()
    where user_id = p_user_id
      and usage_date = v_today;
  end if;
end;
$$;

revoke all on function public.refund_ai_quota(text, text) from public, anon, authenticated;
grant execute on function public.refund_ai_quota(text, text) to service_role;
