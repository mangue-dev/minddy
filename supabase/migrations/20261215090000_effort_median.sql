-- minddy — durées de travail par effort : médiane au lieu de moyenne
--
-- La mesure « by_effort » de get_cycle_stats (20260804090000) répond à une
-- question de planification : « quand je prends un M, j'en ai pour combien ? ».
-- La moyenne y répond mal. Le cycle time se mesure du premier passage
-- in_progress à completed_at : un ticket démarré un vendredi et fermé au retour
-- de vacances compte trois semaines, et sur un échantillon de dix tickets il
-- déplace la moyenne à lui seul. La distribution est bornée à gauche (on ne
-- termine pas en moins de zéro) et à traîne longue à droite — exactement la
-- forme où la moyenne cesse de décrire le cas courant.
--
-- La médiane, elle, dit ce qu'on cherche : la moitié des M sont sortis en moins
-- de ça. Un ticket oublié la déplace d'un rang, pas de trois semaines.
--
-- Seul `by_effort` change : `avg_seconds` devient `median_seconds`, calculé par
-- percentile_cont(0.5) (interpolation sur échantillon pair, la définition
-- usuelle de la médiane). Les deux autres métriques restent des moyennes —
-- l'écart à l'échéance et le nombre de tickets par cycle n'ont pas cette
-- traîne, et leurs libellés disent « moyen ».
--
-- Le reste du corps est identique à 20260804090000 : `create or replace` exige
-- la fonction entière, il n'y a pas de patch partiel en PL/pgSQL. Idempotent.
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
    select
      effort,
      percentile_cont(0.5) within group (order by secs)::numeric as median_seconds,
      count(*) as sample
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
                'median_seconds', be.median_seconds,
                'sample', be.sample))
       from by_effort be),
      '[]'::jsonb
    )
  );
$$;
