-- Create exercises table with 'archived' flag
create table exercises (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  archived boolean not null default false,
  updated_at timestamp with time zone default now()
);

-- Enable RLS on exercises
alter table exercises enable row level security;

-- Policies for exercises
create policy "Users can read their own exercises, including archived"
on exercises
for select
using (auth.uid() = user_id);

create policy "Users can insert their own exercises"
on exercises
for insert
with check (auth.uid() = user_id);

create policy "Users can update their own exercises"
on exercises
for update
using (auth.uid() = user_id);

create policy "Users can delete their own exercises"
on exercises
for delete
using (auth.uid() = user_id);

-- Function and trigger to auto-fill user_id on exercises
create or replace function set_user_id_from_auth()
returns trigger as $$
begin
  new.user_id := auth.uid();
  return new;
end;
$$ language plpgsql;

create trigger auto_set_user_id
before insert on exercises
for each row
when (new.user_id is null)
execute procedure set_user_id_from_auth();

-- Function and trigger to auto-update updated_at on exercises
create or replace function update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger set_updated_at
before update on exercises
for each row
execute procedure update_updated_at_column();

-- Create exercise_logs table WITHOUT ON DELETE CASCADE
create table exercise_logs (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  exercise_name text not null,
  reps integer,
  distance numeric,
  weight numeric,
  duration numeric,
  logged_at timestamp with time zone default now(),
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- Enable RLS on exercise_logs
alter table exercise_logs enable row level security;

-- Policies for exercise_logs
create policy "Users can read their own exercise logs"
on exercise_logs
for select
using (auth.uid() = user_id);

create policy "Users can insert their own exercise logs"
on exercise_logs
for insert
with check (auth.uid() = user_id);

create policy "Users can update their own exercise logs"
on exercise_logs
for update
using (auth.uid() = user_id);

create policy "Users can delete their own exercise logs"
on exercise_logs
for delete
using (auth.uid() = user_id);

-- Trigger to auto-fill user_id on exercises
create trigger auto_set_user_id_on_logs
before insert on exercise_logs
for each row
when (new.user_id is null)
execute procedure set_user_id_from_auth();

-- Function and trigger to auto-update updated_at on exercise_logs
create or replace function update_exercise_log_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger set_exercise_log_updated_at
before update on exercise_logs
for each row
execute procedure update_exercise_log_updated_at();

-- Trigger function to prevent deleting exercises with logs
create or replace function prevent_delete_if_logs_exist()
returns trigger as $$
begin
  if exists (
    select 1 from exercise_logs where exercise_id = old.id limit 1
  ) then
    raise exception 'Cannot delete exercise with existing logs. Consider archiving instead.';
  end if;
  return old;
end;
$$ language plpgsql;

-- Trigger to prevent delete on exercises with logs
create trigger prevent_delete_exercise_with_logs
before delete on exercises
for each row
execute procedure prevent_delete_if_logs_exist();
