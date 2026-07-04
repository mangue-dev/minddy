-- minddy — chantier 8 « Sous-issues »
-- A sub-issue is a full issue with parent_id set. Nesting is limited to ONE level.
-- Deleting a parent detaches its children (SET NULL). Idempotent — safe to re-run.

alter table public.issues
  add column if not exists parent_id uuid references public.issues(id) on delete set null;

create index if not exists idx_issues_parent on public.issues(parent_id);

-- Enforce the single-level invariant at the DB (belt-and-suspenders; the UI also
-- gates it): a parent must be top-level, and an issue that already has children
-- cannot itself become a child.
create or replace function public.enforce_one_level_subissues()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.parent_id is not null then
    if new.parent_id = new.id then
      raise exception 'Une issue ne peut pas être son propre parent';
    end if;
    if exists (
      select 1 from public.issues p
      where p.id = new.parent_id and p.parent_id is not null
    ) then
      raise exception 'Imbrication limitée à un niveau';
    end if;
    if exists (
      select 1 from public.issues p
      where p.id = new.parent_id and p.project_id <> new.project_id
    ) then
      raise exception 'Le parent doit être dans le même projet';
    end if;
    if exists (select 1 from public.issues c where c.parent_id = new.id) then
      raise exception 'Cette issue a déjà des sous-issues';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists issues_one_level on public.issues;
create trigger issues_one_level
  before insert or update on public.issues
  for each row execute function public.enforce_one_level_subissues();
