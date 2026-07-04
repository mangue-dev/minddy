-- minddy — chantier 6 (complément) « Catégories par défaut »
-- Every new project is seeded with a clear, generalist label set. Existing
-- projects without any category are backfilled once. Idempotent — safe to re-run.

-- Single source of truth for the default set.
create or replace function public.default_categories()
returns table(name text, color text) language sql immutable as $$
  values
    ('Bug',            '#ef4444'),
    ('Fonctionnalité', '#3b82f6'),
    ('Amélioration',   '#22c55e'),
    ('Design',         '#a855f7'),
    ('Documentation',  '#eab308'),
    ('Technique',      '#6b7280')
$$;

-- Seed defaults on project creation.
create or replace function public.seed_default_categories()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.categories (project_id, name, color)
  select new.id, d.name, d.color from public.default_categories() d;
  return new;
end;
$$;

drop trigger if exists projects_seed_categories on public.projects;
create trigger projects_seed_categories
  after insert on public.projects
  for each row execute function public.seed_default_categories();

-- Backfill: only projects that currently have zero categories.
insert into public.categories (project_id, name, color)
select p.id, d.name, d.color
from public.projects p
cross join public.default_categories() d
where p.deleted_at is null
  and not exists (
    select 1 from public.categories c where c.project_id = p.id
  );
