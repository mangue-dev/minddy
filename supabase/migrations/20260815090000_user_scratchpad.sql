-- minddy — Scratchpad perso (Notes)
--
-- Une note markdown UNIQUE par utilisateur : la « problems.md » intégrée. Des
-- petites tâches du moment (titres de section + cases à cocher au format plan,
-- lib/plan.ts) qui ne méritent pas une issue. Strictement personnelle et
-- cross-projet (aucun project_id) → RLS self-manage comme user_agent_preferences :
-- le client lit/écrit sa propre ligne, aucun accès service requis.
-- Idempotent — safe to re-run.

create table if not exists public.user_scratchpad (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  content    text not null default '',
  updated_at timestamptz not null default now()
);

alter table public.user_scratchpad enable row level security;

drop policy if exists user_scratchpad_select on public.user_scratchpad;
create policy user_scratchpad_select on public.user_scratchpad for select
  using (user_id = (select auth.uid()));

drop policy if exists user_scratchpad_insert on public.user_scratchpad;
create policy user_scratchpad_insert on public.user_scratchpad for insert
  with check (user_id = (select auth.uid()));

drop policy if exists user_scratchpad_update on public.user_scratchpad;
create policy user_scratchpad_update on public.user_scratchpad for update
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop trigger if exists user_scratchpad_set_updated_at on public.user_scratchpad;
create trigger user_scratchpad_set_updated_at
  before update on public.user_scratchpad
  for each row execute function public.set_updated_at();
