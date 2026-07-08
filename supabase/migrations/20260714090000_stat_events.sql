-- minddy — MIN-12 « Statistiques utilisateur »
-- Ledger append-only des contributions d'un utilisateur (issues créées /
-- terminées). C'est la SOURCE DE VÉRITÉ des statistiques : détachée des issues
-- et projets pour que supprimer l'un ou l'autre n'efface PAS les stats.
--   - project_id / issue_id en `on delete set null` (l'attribution survit au
--     hard delete, pattern integrations / mcp_agent_attribution) ;
--   - project_name / issue_number / issue_title = snapshots pris à l'écriture,
--     donc toujours affichables même une fois la ligne parente disparue.
-- Écrit côté serveur (service client) depuis create-issue.ts / update-issue.ts.
-- Chaque utilisateur ne lit que ses propres lignes (RLS). Idempotent.

-- ── table ────────────────────────────────────────────────────────────────────
create table if not exists public.stat_events (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  kind         text not null check (kind in ('issue_created', 'issue_completed')),
  occurred_at  timestamptz not null,
  project_id   uuid references public.projects(id) on delete set null,
  project_name text,                       -- snapshot (survit à la suppression du projet)
  issue_id     uuid references public.issues(id) on delete set null,
  issue_number integer,                    -- snapshot
  issue_title  text,                       -- snapshot
  created_at   timestamptz not null default now()
);

create index if not exists idx_stat_events_user_kind_time
  on public.stat_events(user_id, kind, occurred_at);
create index if not exists idx_stat_events_user_project
  on public.stat_events(user_id, project_id);

alter table public.stat_events enable row level security;

-- Lecture réservée au propriétaire des lignes ; les inserts passent par le
-- service client (RLS bypassée) → pas de policy insert/update/delete.
drop policy if exists stat_events_select on public.stat_events;
create policy stat_events_select on public.stat_events for select
  using (user_id = auth.uid());

-- ── fonction de lecture agrégée ──────────────────────────────────────────────
-- SECURITY INVOKER : appelée sur le client RLS, donc auth.uid() = l'appelant et
-- la policy stat_events_select restreint déjà les lignes à l'utilisateur.
--   totals.created   = nb d'events issue_created
--   totals.completed = nb d'ISSUES distinctes terminées (une re-complétion ne
--                      gonfle pas le total ; les lignes d'issue supprimée — donc
--                      issue_id null — comptent chacune via leur propre id)
--   totals.projects  = nb de projets distincts (par id, sinon par nom snapshot)
--   per_project      = un bucket par projet (nom live si dispo, sinon snapshot ;
--                      `deleted` = projet hard-supprimé ou soft-supprimé)
--   days             = compte des complétions par jour (dans le fuseau p_tz),
--                      seulement depuis p_since, jours non-nuls (densifiés côté TS)
create or replace function public.get_user_stats(
  p_tz text default 'UTC',
  p_since timestamptz default (now() - interval '371 days')
)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with me as (
    select * from public.stat_events where user_id = auth.uid()
  ),
  totals as (
    select
      count(*) filter (where kind = 'issue_created') as created,
      count(distinct coalesce(issue_id::text, id::text))
        filter (where kind = 'issue_completed') as completed,
      count(distinct coalesce(project_id::text, 'name:' || coalesce(project_name, ''))) as projects
    from me
  ),
  per_project as (
    select
      coalesce(me.project_id::text, 'name:' || coalesce(me.project_name, '')) as bucket,
      coalesce(p.name, me.project_name) as name,
      p.color as color,
      (p.id is null or p.deleted_at is not null) as deleted,
      count(*) filter (where me.kind = 'issue_created') as created,
      count(distinct coalesce(me.issue_id::text, me.id::text))
        filter (where me.kind = 'issue_completed') as completed
    from me
    left join public.projects p on p.id = me.project_id
    group by 1, 2, p.color, (p.id is null or p.deleted_at is not null)
  ),
  days as (
    select
      to_char((me.occurred_at at time zone p_tz)::date, 'YYYY-MM-DD') as date,
      count(*) as count
    from me
    where me.kind = 'issue_completed' and me.occurred_at >= p_since
    group by 1
  )
  select jsonb_build_object(
    'totals', (select to_jsonb(t) from totals t),
    'per_project', coalesce(
      (select jsonb_agg(to_jsonb(pp) order by pp.completed desc, pp.created desc)
       from per_project pp),
      '[]'::jsonb
    ),
    'days', coalesce(
      (select jsonb_agg(jsonb_build_object('date', d.date, 'count', d.count))
       from days d),
      '[]'::jsonb
    )
  );
$$;

-- ── backfill (idempotent) ────────────────────────────────────────────────────
-- Rejoue l'historique existant UNE seule fois (garde : table vide). Les issues
-- dont le projet a été hard-supprimé n'existent plus (cascade) : rien à rejouer.
do $$
begin
  if not exists (select 1 from public.stat_events) then

    -- issue_created : une ligne par issue au créateur connu.
    insert into public.stat_events
      (user_id, kind, occurred_at, project_id, project_name, issue_id, issue_number, issue_title)
    select i.created_by, 'issue_created', i.created_at,
           i.project_id, p.name, i.id, i.number, i.title
    from public.issues i
    join public.projects p on p.id = i.project_id
    where i.created_by is not null;

    -- issue_completed (principal) : chaque passage status -> done tracé, à son
    -- acteur. On garde TOUTES les occurrences (issue rouverte puis re-terminée =
    -- plusieurs contributions, comme le comportement live).
    insert into public.stat_events
      (user_id, kind, occurred_at, project_id, project_name, issue_id, issue_number, issue_title)
    select e.actor_id, 'issue_completed', e.created_at,
           i.project_id, p.name, i.id, i.number, i.title
    from public.issue_events e
    join public.issues i on i.id = e.issue_id
    join public.projects p on p.id = i.project_id
    where e.field = 'status' and e.to_value = 'done' and e.actor_id is not null;

    -- issue_completed (fallback) : issues actuellement done sans event
    -- status->done tracé (complétées avant le tracking) → completed_at/créateur.
    insert into public.stat_events
      (user_id, kind, occurred_at, project_id, project_name, issue_id, issue_number, issue_title)
    select i.created_by, 'issue_completed', i.completed_at,
           i.project_id, p.name, i.id, i.number, i.title
    from public.issues i
    join public.projects p on p.id = i.project_id
    where i.status = 'done'
      and i.completed_at is not null
      and i.created_by is not null
      and not exists (
        select 1 from public.issue_events e
        where e.issue_id = i.id
          and e.field = 'status' and e.to_value = 'done' and e.actor_id is not null
      );

  end if;
end $$;
