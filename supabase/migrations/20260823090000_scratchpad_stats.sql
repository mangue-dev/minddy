-- minddy — Le carnet de tâches compte dans les statistiques
--
-- Le carnet (user_scratchpad) est une note LIBRE : on y ajoute des tâches, on les
-- coche, on les supprime (« Retirer les tâches terminées »), et on recommence.
-- Compter les `[x]` présents dans la note à un instant T ne voudrait donc rien
-- dire : le total retomberait à zéro au premier nettoyage. On enregistre plutôt
-- chaque COCHE dans le ledger append-only `stat_events` — la même source de
-- vérité que les tickets, détachée de la note (cf. 20260714090000_stat_events).
--   - nouveau kind `scratchpad_task_completed` : aucun project_id / issue_id
--     (le carnet est perso et cross-projet), donc exclu des agrégats par projet ;
--   - `task_text` = snapshot du libellé au moment de la coche (le carnet, lui,
--     aura peut-être déjà oublié la tâche).
-- Écrit côté serveur depuis lib/server/scratchpad.ts, qui diffe l'avant/après de
-- la note avec le parseur unique lib/plan.ts. Idempotent — safe to re-run.

-- ── colonne + kind ───────────────────────────────────────────────────────────
alter table public.stat_events
  add column if not exists task_text text;

alter table public.stat_events drop constraint if exists stat_events_kind_check;
alter table public.stat_events
  add constraint stat_events_kind_check
  check (kind in ('issue_created', 'issue_completed', 'scratchpad_task_completed'));

-- ── lecture agrégée (remplace la version de 20260714090000) ──────────────────
-- Différences avec la version précédente :
--   totals.tasks_completed = nb de tâches cochées dans le carnet (cumulé) ;
--   totals.projects / per_project ne regardent QUE les events de tickets — sans
--     ce filtre, les events du carnet (project_id null) créeraient un faux
--     bucket « projet supprimé » ;
--   days                   = tickets terminés ET tâches cochées, avec le détail
--                            par jour (issues / tasks) pour l'infobulle.
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
  issue_events as (
    select * from me where kind in ('issue_created', 'issue_completed')
  ),
  totals as (
    select
      count(*) filter (where kind = 'issue_created') as created,
      count(distinct coalesce(issue_id::text, id::text))
        filter (where kind = 'issue_completed') as completed,
      count(distinct coalesce(project_id::text, 'name:' || coalesce(project_name, ''))) as projects,
      (select count(*) from me where kind = 'scratchpad_task_completed') as tasks_completed
    from issue_events
  ),
  per_project as (
    select
      coalesce(e.project_id::text, 'name:' || coalesce(e.project_name, '')) as bucket,
      coalesce(p.name, e.project_name) as name,
      p.color as color,
      (p.id is null or p.deleted_at is not null) as deleted,
      count(*) filter (where e.kind = 'issue_created') as created,
      count(distinct coalesce(e.issue_id::text, e.id::text))
        filter (where e.kind = 'issue_completed') as completed
    from issue_events e
    left join public.projects p on p.id = e.project_id
    group by 1, 2, p.color, (p.id is null or p.deleted_at is not null)
  ),
  days as (
    select
      to_char((me.occurred_at at time zone p_tz)::date, 'YYYY-MM-DD') as date,
      count(*) as count,
      count(*) filter (where me.kind = 'issue_completed') as issues,
      count(*) filter (where me.kind = 'scratchpad_task_completed') as tasks
    from me
    where me.kind in ('issue_completed', 'scratchpad_task_completed')
      and me.occurred_at >= p_since
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
      (select jsonb_agg(jsonb_build_object(
         'date', d.date, 'count', d.count, 'issues', d.issues, 'tasks', d.tasks))
       from days d),
      '[]'::jsonb
    )
  );
$$;

-- ── backfill (idempotent) ────────────────────────────────────────────────────
-- Les tâches déjà cochées dans les carnets existants n'ont pas d'historique :
-- on ne connaît que `updated_at`, la dernière écriture de la note. On les rejoue
-- donc TOUTES à cette date — le total est juste, la date est une approximation
-- assumée (même compromis que le backfill de 20260714090000 pour les tickets
-- terminés avant le tracking). Garde : ne s'exécute que si aucune coche n'a
-- encore été enregistrée. Version simplifiée du parseur (pas de gestion des
-- blocs de code) : suffisant pour un one-shot.
do $$
begin
  if not exists (
    select 1 from public.stat_events where kind = 'scratchpad_task_completed'
  ) then
    insert into public.stat_events (user_id, kind, occurred_at, task_text)
    select
      s.user_id,
      'scratchpad_task_completed',
      s.updated_at,
      left(btrim(substring(l.line from '^\s*[-*+] \[[xX]\]\s+(.*)$')), 500)
    from public.user_scratchpad s
    cross join lateral unnest(regexp_split_to_array(s.content, E'\n')) as l(line)
    where l.line ~ '^\s*[-*+] \[[xX]\]\s+';
  end if;
end $$;
