create policy "service_role_full_access"
on public.ai_daily_usage
for all
to service_role
using (true)
with check (true);
