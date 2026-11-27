-- Declarative schema: Subscriptions & Atomic Stripe Webhook Synchronization
create table if not exists public.user_subscriptions (
  user_id text primary key,
  provider text not null,
  provider_subscription_id text unique not null,
  provider_customer_id text not null,
  price_id text not null,
  status text not null check (status in ('active', 'trialing', 'past_due', 'canceled', 'unpaid', 'paused')),
  cancel_at_period_end boolean not null default false,
  current_period_end timestamptz,
  grace_ends_at timestamptz,
  last_event_created bigint not null default 0 check (last_event_created >= 0),
  updated_at timestamptz not null default now()
);

alter table public.user_subscriptions enable row level security;

create policy "service_role_full_access"
on public.user_subscriptions
for all
to service_role
using (true)
with check (true);

revoke all on table public.user_subscriptions from public, anon, authenticated;
grant select, insert, update, delete on table public.user_subscriptions to service_role;

create table if not exists public.processed_webhook_events (
  event_id text primary key,
  processed_at timestamptz not null default now()
);

create index if not exists idx_processed_webhook_events_processed_at
  on public.processed_webhook_events (processed_at);

alter table public.processed_webhook_events enable row level security;

create policy "service_role_full_access"
on public.processed_webhook_events
for all
to service_role
using (true)
with check (true);

revoke all on table public.processed_webhook_events from public, anon, authenticated;
grant select, insert, update, delete on table public.processed_webhook_events to service_role;

create or replace function public.sync_subscription_webhook(
  p_event_id text,
  p_event_created bigint,
  p_user_id text,
  p_provider text,
  p_provider_subscription_id text,
  p_provider_customer_id text,
  p_price_id text,
  p_status text,
  p_cancel_at_period_end boolean,
  p_current_period_end timestamptz default null
)
returns table (
  already_processed boolean,
  applied boolean
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_now timestamptz := now();
  v_rows_updated integer := 0;
begin
  if p_event_id is null or length(trim(p_event_id)) = 0 then
    raise exception 'p_event_id must not be empty';
  end if;

  if p_event_created is null or p_event_created < 0 then
    raise exception 'p_event_created must be non-negative';
  end if;

  if p_user_id is null or length(trim(p_user_id)) = 0 then
    raise exception 'p_user_id must not be empty';
  end if;

  if p_provider is null or length(trim(p_provider)) = 0 then
    raise exception 'p_provider must not be empty';
  end if;

  if p_provider_subscription_id is null or length(trim(p_provider_subscription_id)) = 0 then
    raise exception 'p_provider_subscription_id must not be empty';
  end if;

  if p_provider_customer_id is null or length(trim(p_provider_customer_id)) = 0 then
    raise exception 'p_provider_customer_id must not be empty';
  end if;

  if p_price_id is null or length(trim(p_price_id)) = 0 then
    raise exception 'p_price_id must not be empty';
  end if;

  if p_status is null or p_status not in ('active', 'trialing', 'past_due', 'canceled', 'unpaid', 'paused') then
    raise exception 'Invalid subscription status: %', p_status;
  end if;

  if random() < 0.05 then
    delete from public.processed_webhook_events
    where processed_at < (v_now - interval '30 days');
  end if;

  insert into public.processed_webhook_events (event_id, processed_at)
  values (p_event_id, v_now)
  on conflict (event_id) do nothing;

  if not found then
    return query select true, false;
    return;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('sync_subscription:' || p_user_id, 0));

  insert into public.user_subscriptions (
    user_id,
    provider,
    provider_subscription_id,
    provider_customer_id,
    price_id,
    status,
    cancel_at_period_end,
    current_period_end,
    grace_ends_at,
    last_event_created,
    updated_at
  )
  values (
    p_user_id,
    p_provider,
    p_provider_subscription_id,
    p_provider_customer_id,
    p_price_id,
    p_status,
    coalesce(p_cancel_at_period_end, false),
    p_current_period_end,
    case when p_status = 'past_due' then v_now + interval '3 days' else null end,
    p_event_created,
    v_now
  )
  on conflict (user_id) do update
  set provider = excluded.provider,
      provider_subscription_id = excluded.provider_subscription_id,
      provider_customer_id = excluded.provider_customer_id,
      price_id = excluded.price_id,
      status = excluded.status,
      cancel_at_period_end = excluded.cancel_at_period_end,
      current_period_end = excluded.current_period_end,
      grace_ends_at = case
        when excluded.status = 'past_due'
             and public.user_subscriptions.provider_subscription_id = excluded.provider_subscription_id
             and public.user_subscriptions.status = 'past_due'
             and public.user_subscriptions.grace_ends_at is not null
          then public.user_subscriptions.grace_ends_at
        when excluded.status = 'past_due'
          then v_now + interval '3 days'
        else null
      end,
      last_event_created = excluded.last_event_created,
      updated_at = v_now
  where (
    public.user_subscriptions.provider_subscription_id = excluded.provider_subscription_id
    and public.user_subscriptions.status <> 'canceled'
    and excluded.last_event_created >= public.user_subscriptions.last_event_created
  )
  or (
    public.user_subscriptions.provider_subscription_id <> excluded.provider_subscription_id
    and excluded.last_event_created >= public.user_subscriptions.last_event_created
    and (
      (public.user_subscriptions.status = 'canceled' and excluded.status <> 'canceled')
      or excluded.status in ('active', 'trialing')
    )
  );

  get diagnostics v_rows_updated = row_count;
  return query select false, (v_rows_updated > 0);
end;
$$;

revoke all on function public.sync_subscription_webhook(text, bigint, text, text, text, text, text, text, boolean, timestamptz) from public, anon, authenticated;
grant execute on function public.sync_subscription_webhook(text, bigint, text, text, text, text, text, text, boolean, timestamptz) to service_role;
