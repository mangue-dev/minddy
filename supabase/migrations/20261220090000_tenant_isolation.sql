-- minddy — MIN-338 : cloisonnement en base.
--
-- Quatre trous, tous nés APRÈS la passe de durcissement MIN-118 (20260926*).
-- C'est le motif qui compte, pas les quatre : chacun vient d'une migration
-- écrite plus tard, par quelqu'un qui ne savait pas que la règle existait. Ce
-- fichier reprend donc la forme des balais de MIN-118 — des boucles sur le
-- catalogue plutôt que des listes de noms —, et il est fait pour être RECOPIÉ
-- dans une nouvelle migration le jour où le garde-fou
-- (lib/schema-guardrails.test.ts) signale une dérive.
--
-- Idempotent — safe to re-run.

-- ── 1. `project_id` est gelé sur les tables que PostgREST laisse écrire ──────
--
-- Aucune policy UPDATE n'épingle `project_id`, et aucune ne le peut : un
-- `with check` ne voit que la ligne NOUVELLE. `can_access_project(project_id)`
-- vérifie donc que la DESTINATION m'est accessible, pas que je n'ai pas bougé
-- la ligne. Un membre de deux projets déplace un ticket, un objectif ou une
-- page de l'un vers l'autre — le hard delete que MIN-118 avait fermé, par
-- l'autre porte : la ligne disparaît du projet A, pour de bon et sans corbeille.
--
-- Les privilèges de colonne (`revoke update (project_id)`) ne servent à rien
-- ici : Supabase pose un grant `all` AU NIVEAU TABLE sur `authenticated`, et
-- une révocation de colonne ne mord pas sur un grant de table. Il faudrait
-- révoquer l'UPDATE entier puis le re-donner colonne par colonne — et toute
-- colonne ajoutée ensuite naîtrait non-écrivable, en silence. D'où le trigger.
--
-- `before update of project_id` : le trigger ne se déclenche que si la colonne
-- est DANS le SET. PostgREST n'envoie que les champs du patch, donc une écriture
-- normale ne le paie pas. Il vaut aussi pour la clé service, volontairement :
-- aucun chemin du dépôt n'écrit `project_id` sur une ligne existante (rien à
-- déplacer — promouvoir un feedback CRÉE un ticket), et un futur backfill qui
-- en aurait besoin doit être un geste explicite, pas un `.update()` de passage.
create or replace function public.freeze_project_id()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.project_id is distinct from old.project_id then
    -- 42501 = insufficient_privilege : PostgREST le rend en 403, pas en 500.
    raise exception 'cross_project_move' using errcode = '42501';
  end if;
  return new;
end;
$$;

do $$
declare
  t record;
begin
  for t in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
      -- Une table à `project_id`…
      and exists (
        select 1 from pg_attribute a
        where a.attrelid = c.oid and a.attname = 'project_id'
          and a.attnum > 0 and not a.attisdropped
      )
      -- …que la RLS laisse mettre à jour depuis le client (`w` = UPDATE,
      -- `*` = ALL). Une table sans policy UPDATE n'est pas écrivable par
      -- `authenticated` : le trigger n'y protégerait rien et coûterait à
      -- chaque écriture de la clé service.
      and exists (
        select 1 from pg_policy p
        where p.polrelid = c.oid and p.polcmd in ('w', '*')
      )
    order by c.relname
  loop
    execute format(
      'drop trigger if exists %I on public.%I',
      t.relname || '_freeze_project_id', t.relname
    );
    execute format(
      'create trigger %I before update of project_id on public.%I '
      || 'for each row execute function public.freeze_project_id()',
      t.relname || '_freeze_project_id', t.relname
    );
  end loop;
end $$;

-- ── 2. Les pages repassent par la corbeille ─────────────────────────────────
--
-- `pages_delete` (20261126090000) rouvre le DELETE PostgREST que MIN-118 avait
-- fermé sur `issues`, `objectives` et `attachments`. Un membre efface une page
-- d'un `DELETE /rest/v1/pages?id=eq.…` : la corbeille est court-circuitée,
-- l'historique (`page_versions`) part en cascade, et les fichiers du bucket
-- restent orphelins. Le seul chemin légitime — `trashPage` / `discardPage`
-- (lib/server/pages.ts) — passe par la clé service, qui ignore la RLS : rien à
-- recâbler côté application, la policy ne servait personne.
drop policy if exists pages_delete on public.pages;

-- ── 3. Le balai des definers, rejoué ────────────────────────────────────────
--
-- `get_ai_run_spend` (20261118090000) est `security definer` et ne révoque que
-- `from public` — la forme exacte que 20260926093000 avait identifiée comme
-- insuffisante (le bootstrap Supabase donne un EXECUTE *explicite* à `anon` et
-- `authenticated` sur toute fonction créée dans `public` ; « revoke from public »
-- ne retire que le grant implicite à PUBLIC). Plutôt que de la nommer, on
-- rejoue le balai à l'identique : il rattrape aussi celles d'après.
--
-- L'allowlist est celle de 20260926093000, motif compris — voir le long
-- commentaire de ce fichier : révoquer un `can_watch_*` ferait LEVER une branche
-- de `members_receive_broadcasts`, ce qui fait tomber l'expression entière et
-- coupe le temps réel de toute l'application.
do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind = 'f'
      and p.prosecdef
      and p.prorettype <> 'pg_catalog.trigger'::regtype
      and p.proname not in (
        'can_access_project',
        'is_project_member',
        'is_project_owner'
      )
      and p.proname not like 'can\_watch\_%'
      and not exists (
        select 1 from pg_depend d
        where d.classid = 'pg_proc'::regclass
          and d.objid = p.oid
          and d.deptype = 'e'
      )
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
end $$;

-- ── 4. Plus aucune policy sur le rôle `public` ──────────────────────────────
--
-- Une policy écrite sans clause `TO` retombe sur le rôle `public`, donc sur
-- `anon` : la clé anon publique suffit à la traverser si son `using` passe.
-- 20260926091000 avait balayé le schéma d'alors ; neuf policies écrites depuis
-- sont revenues sans clause (les `*_select` de agent_runs, agent_run_events,
-- agent_run_messages, issue_events, page_files, et les quatre de saved_views).
-- Aucune ne vise `anon` volontairement — les surfaces publiques (/f/, /share/)
-- sont servies côté serveur en clé service.
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

-- ── 5. `search_path` figé sur tous les definers ─────────────────────────────
--
-- Aucune fonction ne manquait à l'appel au moment d'écrire (vérifié sur la prod
-- avant la migration : zéro definer sans `search_path`). La boucle est là pour
-- celles de demain — une definer dont le `search_path` flotte exécute le code
-- du schéma que l'appelant met devant, et c'est une élévation de privilège.
do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
      and not exists (
        select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%'
      )
      and not exists (
        select 1 from pg_depend d
        where d.classid = 'pg_proc'::regclass
          and d.objid = p.oid
          and d.deptype = 'e'
      )
  loop
    execute format('alter function %s set search_path = public, pg_temp', f.sig);
  end loop;
end $$;
