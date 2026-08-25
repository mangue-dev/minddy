-- MIN-433 — enrich the personal statistics story with current project,
-- category, and objective context. The append-only totals and activity calendar
-- stay historical; named breakdowns only include live issues in live projects.

create or replace function public.get_cycle_stats(p_tz text default 'UTC'::text)
returns jsonb
language sql
stable
set search_path to 'public'
as $$
  with today as (
    select (now() at time zone p_tz)::date as d
  ),
  completion_offsets as (
    select ((i.completed_at at time zone p_tz)::date
              - (i.due_date at time zone p_tz)::date) as offset_days
    from public.issues i
    join public.projects p
      on p.id = i.project_id
     and p.deleted_at is null
    where i.assignee_id = auth.uid()
      and i.deleted_at is null
      and i.status = 'done'
      and i.completed_at is not null
      and i.due_date is not null
  ),
  cadence as (
    select avg(offset_days)::numeric as avg_offset, count(*) as sample
    from completion_offsets
  ),
  started_cycles as (
    select c.id
    from public.cycles c, today
    where c.user_id = auth.uid() and c.start_date <= today.d
  ),
  per_cycle as (
    select sc.id, count(p.id) as n
    from started_cycles sc
    left join public.issues i
      on i.cycle_id = sc.id
     and i.deleted_at is null
    left join public.projects p
      on p.id = i.project_id
     and p.deleted_at is null
    group by sc.id
  ),
  cycles_agg as (
    select avg(n)::numeric as avg_per_cycle, count(*) as cycle_count
    from per_cycle
  ),
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
    join public.projects p
      on p.id = i.project_id
     and p.deleted_at is null
    join first_started fs on fs.issue_id = i.id
    where i.assignee_id = auth.uid()
      and i.deleted_at is null
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

create or replace function public.get_user_stats(
  p_tz text default 'UTC'::text,
  p_since timestamp with time zone default (now() - '371 days'::interval)
) returns jsonb
language sql
stable
set search_path to 'public'
as $$
  with me as (
    select * from public.stat_events where user_id = auth.uid()
  ),
  issue_events as (
    select * from me where kind in ('issue_created', 'issue_completed')
  ),
  active_projects as (
    select id, name, color, icon_url, orb_seed
    from public.projects
    where deleted_at is null
  ),
  totals as (
    select
      count(*) filter (where kind = 'issue_created') as created,
      count(distinct coalesce(issue_id::text, id::text))
        filter (where kind = 'issue_completed') as completed,
      (select count(*) from me where kind = 'scratchpad_task_completed') as tasks_completed
    from issue_events
  ),
  active_project_count as (
    select count(distinct e.project_id) as projects
    from issue_events e
    join active_projects p on p.id = e.project_id
  ),
  completed_issues as (
    select distinct i.id as issue_id, i.project_id, i.objective_id
    from me e
    join public.issues i
      on i.id = e.issue_id
     and i.deleted_at is null
    join active_projects p on p.id = i.project_id
    where e.kind = 'issue_completed'
  ),
  per_project as (
    select
      p.id,
      p.name,
      p.color,
      p.icon_url,
      p.orb_seed,
      count(ci.issue_id) as completed
    from completed_issues ci
    join active_projects p on p.id = ci.project_id
    group by p.id, p.name, p.color, p.icon_url, p.orb_seed
  ),
  per_category as (
    select
      c.name,
      c.color,
      count(distinct ci.issue_id) as completed
    from completed_issues ci
    join public.issue_categories ic on ic.issue_id = ci.issue_id
    join public.categories c on c.id = ic.category_id
    group by c.name, c.color
  ),
  per_objective as (
    select
      o.id,
      o.project_id,
      o.name,
      o.color,
      count(distinct ci.issue_id) as completed
    from completed_issues ci
    join public.objectives o
      on o.id = ci.objective_id
     and o.deleted_at is null
    group by o.id, o.project_id, o.name, o.color
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
    'totals', jsonb_build_object(
      'created', coalesce((select created from totals), 0),
      'completed', coalesce((select completed from totals), 0),
      'projects', coalesce((select projects from active_project_count), 0),
      'tasks_completed', coalesce((select tasks_completed from totals), 0)
    ),
    'breakdown_total', (select count(*) from completed_issues),
    'per_project', coalesce(
      (select jsonb_agg(to_jsonb(pp) order by pp.completed desc, pp.name asc)
       from per_project pp),
      '[]'::jsonb
    ),
    'per_category', coalesce(
      (select jsonb_agg(to_jsonb(pc) order by pc.completed desc, pc.name asc)
       from per_category pc),
      '[]'::jsonb
    ),
    'per_objective', coalesce(
      (select jsonb_agg(to_jsonb(po) order by po.completed desc, po.name asc)
       from per_objective po),
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
