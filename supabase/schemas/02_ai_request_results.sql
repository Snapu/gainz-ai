-- Declarative schema: Short-lived idempotency & screen-lock recovery results (30-minute TTL)
create table if not exists public.ai_request_results (
  user_id text not null,
  client_request_id uuid not null,
  action text not null check (action in ('coach')),
  status text not null check (status in ('processing', 'completed', 'failed')),
  response_payload jsonb,
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 minutes'),
  constraint ai_request_results_pkey primary key (user_id, client_request_id)
);

create index if not exists idx_ai_request_results_expires_at
  on public.ai_request_results (expires_at);

alter table public.ai_request_results enable row level security;

revoke all on table public.ai_request_results from public, anon, authenticated;
grant select, insert, update, delete on table public.ai_request_results to service_role;

create policy "service_role_full_access"
on public.ai_request_results
for all
to service_role
using (true)
with check (true);
