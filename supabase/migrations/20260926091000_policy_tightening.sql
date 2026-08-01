-- minddy — MIN-118 : resserrage des policies RLS.
--
-- Trois passes :
--
--  1. Toute policy du schéma `public` écrite sans clause TO tombe sur le rôle
--     `public` — donc lisible/écrivable par `anon` si son USING passe. Aucune
--     policy du repo ne vise anon volontairement (les boards publics /f/ et
--     /share/ sont servis côté serveur en clé service) : on bascule tout sur
--     `authenticated`. Garde structurelle — la prochaine policy écrite sans
--     `auth.uid()` ne sera plus visible d'anon en silence. Les NOUVELLES
--     policies doivent écrire `to authenticated` explicitement.
--
--  2. Binding d'auteur sur les inserts client : `issues_insert` acceptait
--     n'importe quel `created_by` (usurpation d'auteur au sein d'un projet) ;
--     alignement sur le pattern comments_insert (author_id = auth.uid()).
--     Idem issue_relations_insert.
--
--  3. Les hard deletes court-circuitaient la corbeille : `issues_delete` et
--     `objectives_delete` permettaient un DELETE PostgREST direct sans passer
--     par le soft delete (lib/server/trash.ts, clé service) ;
--     `attachments_delete` laissait partir la ligne DB sans le fichier storage
--     (orphelins). Le seul consommateur RLS (DELETE /api/attachments/[id])
--     passe désormais par la clé service avec contrôle d'ownership explicite.
--
-- Idempotent — safe to re-run.

-- ── 1. Plus aucune policy sur le rôle `public` ──────────────────────────────
do $$
declare
  p record;
begin
  for p in
    select policyname, tablename
    from pg_policies
    where schemaname = 'public' and roles = '{public}'
  loop
    execute format(
      'alter policy %I on public.%I to authenticated',
      p.policyname, p.tablename
    );
  end loop;
end $$;

-- ── 2. Binding d'auteur sur les inserts ─────────────────────────────────────
drop policy if exists issues_insert on public.issues;
create policy issues_insert on public.issues for insert
  to authenticated
  with check (
    public.can_access_project(project_id)
    and created_by = (select auth.uid())
  );

drop policy if exists issue_relations_insert on public.issue_relations;
create policy issue_relations_insert on public.issue_relations for insert
  to authenticated
  with check (
    public.can_access_project(project_id)
    and created_by = (select auth.uid())
  );

-- ── 3. Fin des hard deletes PostgREST ───────────────────────────────────────
drop policy if exists issues_delete on public.issues;
drop policy if exists objectives_delete on public.objectives;
drop policy if exists attachments_delete on public.attachments;
