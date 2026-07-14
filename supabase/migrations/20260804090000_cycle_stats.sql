-- minddy — MIN-58 « Statistiques de cycle »
-- Agrégats personnels affichés dans la page Statistiques, à côté de
-- get_user_stats. SECURITY INVOKER : appelée sur le client RLS, donc
-- auth.uid() = l'appelant et les policies de issues / cycles / issue_events
-- restreignent déjà les lignes à l'utilisateur (ses cycles sont select-own ;
-- ses issues et events via can_access_project). Idempotent — safe à re-run.
--
-- Trois métriques (tout scopé à l'utilisateur courant) :
--   avg_completion_offset_days = écart moyen entre la complétion et l'échéance,
--       en jours, sur MES tickets done ayant due_date + completed_at.
--       Négatif = terminé en avance ; positif = en retard.
--   avg_issues_per_cycle       = nb moyen de tickets par cycle DÉMARRÉ (mes
--       cycles dont start_date <= aujourd'hui, cycles vides compris).
--   by_effort                  = temps moyen de complétion (« cycle time »),
--       du premier passage in_progress à completed_at, en secondes, pour MES
--       tickets done avec un effort renseigné, groupé par effort.
create or replace function public.get_cycle_stats(p_tz text default 'UTC')
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with today as (
    select (now() at time zone p_tz)::date as d
  ),
  -- 1. Cadence : écart (jours) entre la complétion et l'échéance. due_date est
  --    un timestamptz (migration 20260707120000) : on le ramène, comme
  --    completed_at, à sa date calendaire dans p_tz pour que date - date donne
  --    un entier (et non un interval).
  completion_offsets as (
    select ((i.completed_at at time zone p_tz)::date
              - (i.due_date at time zone p_tz)::date) as offset_days
    from public.issues i
    where i.assignee_id = auth.uid()
      and i.status = 'done'
      and i.completed_at is not null
      and i.due_date is not null
  ),
  cadence as (
    select avg(offset_days)::numeric as avg_offset, count(*) as sample
    from completion_offsets
  ),
  -- 2. Tickets par cycle : moyenne sur les cycles déjà démarrés.
  started_cycles as (
    select c.id
    from public.cycles c, today
    where c.user_id = auth.uid() and c.start_date <= today.d
  ),
  per_cycle as (
    select sc.id, count(i.id) as n
    from started_cycles sc
    left join public.issues i on i.cycle_id = sc.id
    group by sc.id
  ),
  cycles_agg as (
    select avg(n)::numeric as avg_per_cycle, count(*) as cycle_count
    from per_cycle
  ),
  -- 3. Durée de complétion par effort (« cycle time » : 1er in_progress → done).
  first_started as (
    select e.issue_id, min(e.created_at) as started_at
    from public.issue_events e
    where e.field = 'status' and e.to_value = 'in_progress'
    group by e.issue_id
  ),
  durations as (
    select
      i.effort,
      extract(epoch from (i.completed_at - fs.started_at)) as secs
    from public.issues i
    join first_started fs on fs.issue_id = i.id
    where i.assignee_id = auth.uid()
      and i.status = 'done'
      and i.completed_at is not null
      and i.effort is not null
      and i.completed_at > fs.started_at
  ),
  by_effort as (
    select effort, avg(secs)::numeric as avg_seconds, count(*) as sample
    from durations
    group by effort
  )
  select jsonb_build_object(
    'avg_completion_offset_days', (select avg_offset from cadence),
    'completion_offset_sample', coalesce((select sample from cadence), 0),
    'avg_issues_per_cycle', (select avg_per_cycle from cycles_agg),
    'cycle_count', coalesce((select cycle_count from cycles_agg), 0),
    'by_effort', coalesce(
      (select jsonb_agg(jsonb_build_object(
                'effort', be.effort,
                'avg_seconds', be.avg_seconds,
                'sample', be.sample))
       from by_effort be),
      '[]'::jsonb
    )
  );
$$;
