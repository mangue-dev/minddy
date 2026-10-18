-- The statistics hero counted every completion event over the last 12 months,
-- so a ticket completed again counted twice and the hero could exceed the
-- all-time "Completed" tile. Add a per-issue deduplicated 12-month count; the
-- body is otherwise unchanged from 20270107720000_project_content_encryption.
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
    select id, color, icon_url, orb_seed
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
      NULL::text AS name,
      p.color,
      p.icon_url,
      p.orb_seed,
      count(ci.issue_id) as completed
    from completed_issues ci
    join active_projects p on p.id = ci.project_id
    group by p.id, p.color, p.icon_url, p.orb_seed
  ),
  per_category as (
    select
      c.id,
      c.project_id,
      NULL::text AS name,
      c.color,
      count(distinct ci.issue_id) as completed
    from completed_issues ci
    join public.issue_categories ic on ic.issue_id = ci.issue_id
    join public.categories c on c.id = ic.category_id
    group by c.id, c.project_id, c.color
  ),
  per_objective as (
    select
      o.id,
      o.project_id,
      NULL::text AS name,
      o.color,
      count(distinct ci.issue_id) as completed
    from completed_issues ci
    join public.objectives o
      on o.id = ci.objective_id
     and o.deleted_at is null
    group by o.id, o.project_id, o.color
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
  ),
  -- The hero's 12-month count, deduplicated per issue like totals.completed:
  -- a ticket completed again is one ticket, even though each completion
  -- still marks its own day on the heatmap. The window starts the day after
  -- p_since, the heatmap's first day (lib/server/stats.ts heatmapWindow).
  year as (
    select
      count(distinct coalesce(issue_id::text, id::text))
        filter (where kind = 'issue_completed') as issues,
      count(*) filter (where kind = 'scratchpad_task_completed') as tasks
    from me
    where kind in ('issue_completed', 'scratchpad_task_completed')
      and (occurred_at at time zone p_tz)::date
        >= (p_since at time zone 'UTC')::date + 1
  )
  select jsonb_build_object(
    'totals', jsonb_build_object(
      'created', coalesce((select created from totals), 0),
      'completed', coalesce((select completed from totals), 0),
      'projects', coalesce((select projects from active_project_count), 0),
      'tasks_completed', coalesce((select tasks_completed from totals), 0)
    ),
    'breakdown_total', (select count(*) from completed_issues),
    'year', jsonb_build_object(
      'issues', coalesce((select issues from year), 0),
      'tasks', coalesce((select tasks from year), 0)
    ),
    'per_project', coalesce(
      (select jsonb_agg(to_jsonb(pp) order by pp.completed desc, pp.id asc)
       from per_project pp),
      '[]'::jsonb
    ),
    'per_category', coalesce(
      (select jsonb_agg(to_jsonb(pc) order by pc.completed desc, pc.id asc)
       from per_category pc),
      '[]'::jsonb
    ),
    'per_objective', coalesce(
      (select jsonb_agg(to_jsonb(po) order by po.completed desc, po.id asc)
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
