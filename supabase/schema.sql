-- PromptArcade · Supabase schema
-- Run this once in the Supabase SQL Editor (Database → SQL Editor → New query).
--
-- SECURITY NOTE, READ BEFORE SHIPPING:
-- The anon key is published in the browser by design. It is safe ONLY because
-- row-level security is enabled on every table below and every policy is
-- scoped to auth.uid(). If you add a table later and forget to enable RLS,
-- that table becomes world-readable and world-writable to anyone who opens
-- the network tab. There is no second line of defence.

-- ─────────────────────────────── profiles ───────────────────────────────
create table if not exists public.profiles (
  id           uuid primary key references auth.users on delete cascade,
  display_name text,
  avatar_url   text,
  created_at   timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "profiles are self-service" on public.profiles;
create policy "profiles are self-service"
  on public.profiles for all
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- A profile row is created automatically on sign-up, so the client never
-- has to handle "signed in but no profile yet".
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ─────────────────────────────── progress ───────────────────────────────
-- One row per level per user. level_id matches the rubric id already used
-- client-side, e.g. 'builder-pm-1' or 'context-swarm-2'.
create table if not exists public.progress (
  user_id       uuid        not null references auth.users on delete cascade,
  level_id      text        not null,
  tier          text        not null,
  tier_level    int         not null check (tier_level between 0 and 3),
  score         int         not null check (score between 0 and 10),
  tokens        int         not null default 0,
  passed_budget boolean     not null default false,
  updated_at    timestamptz not null default now(),
  primary key (user_id, level_id)
);

alter table public.progress enable row level security;

drop policy if exists "progress is self-service" on public.progress;
create policy "progress is self-service"
  on public.progress for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists progress_user_idx on public.progress (user_id);

-- ──────────────────────── best-score-wins upsert ────────────────────────
-- The client calls this instead of a raw upsert. Doing the comparison in
-- the database rather than the browser means a later lower score can never
-- overwrite a better one, even if two tabs race or a stale localStorage
-- payload arrives after a fresh result.
create or replace function public.record_progress(
  p_level_id      text,
  p_tier          text,
  p_tier_level    int,
  p_score         int,
  p_tokens        int,
  p_passed_budget boolean
)
returns void
language plpgsql
security invoker set search_path = public
as $$
begin
  insert into public.progress as pr
        (user_id,    level_id,   tier,   tier_level,   score,   tokens,   passed_budget)
  values (auth.uid(), p_level_id, p_tier, p_tier_level, p_score, p_tokens, p_passed_budget)
  on conflict (user_id, level_id) do update
    set tier          = excluded.tier,
        tier_level    = excluded.tier_level,
        score         = excluded.score,
        tokens        = excluded.tokens,
        passed_budget = excluded.passed_budget,
        updated_at    = now()
    where excluded.score > pr.score;
end;
$$;
