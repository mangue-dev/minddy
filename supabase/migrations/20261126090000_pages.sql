-- minddy — MIN-266 : les PAGES d'un projet (le wiki), socle de données.
--
-- Une page est une LIGNE, jamais un sous-objet : toutes les pages d'un projet
-- sont stockées à plat et l'imbrication n'est qu'une colonne `parent_id`.
-- Exactement le modèle des sous-tickets — une sous-page est une page à part
-- entière qui a un parent, pas un fragment de son parent.
--
-- Ce choix rend l'arbre reconstructible CÔTÉ CLIENT en une seule requête
-- (toutes les pages du projet), sans CTE récursive et sans N+1 : c'est ce qui
-- permet d'accepter la profondeur illimitée sans que ça coûte quoi que ce soit.
-- La contrepartie est le CYCLE (A enfant de B, B enfant de A), que rien
-- n'interdit ici : la garde est en TypeScript, avant l'écriture
-- (`wouldCreateCycle`, lib/pages.ts), sur le chemin service de
-- lib/server/pages.ts par lequel passe TOUT reparentage.
--
-- Le corps est du JSON ProseMirror (`content`), pas du markdown : le markdown
-- est une projection produite ailleurs. Le titre et l'icône sont des colonnes à
-- part, pas des blocs du document — la sidebar, la recherche et les liens les
-- lisent sans ouvrir le corps.
--
-- `position` est un index FRACTIONNAIRE (`text`, tri lexicographique) et non un
-- entier : insérer entre deux voisins n'écrit qu'une ligne, jamais la fratrie.
-- `version` est incrémenté à chaque écriture du corps — inutile en v1 sans
-- collaboration, gratuit maintenant, impossible à rétrofiter proprement plus
-- tard (MIN-271 s'en sert).
--
-- Idempotent — safe à re-run.

create table if not exists public.pages (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects(id) on delete cascade,
  -- `set null` et non `cascade` : une page ne doit jamais partir en silence
  -- parce que son parent est parti. Le seul chemin de suppression est la
  -- corbeille (récursive, réversible), et la purge finale efface l'arbre
  -- entier d'un coup — cf. `deleted_root_id`.
  parent_id   uuid references public.pages(id) on delete set null,
  title       text not null default '',
  -- Emoji, une seule graphème. Null = la page prend l'icône par défaut.
  icon        text,
  content     jsonb not null default '{"type":"doc","content":[]}'::jsonb,
  version     integer not null default 1,
  position    text not null,
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  -- ── Corbeille (MIN-133, sixième type) ───────────────────────────────────
  deleted_at  timestamptz,
  deleted_by  uuid references auth.users(id) on delete set null,
  -- La page par laquelle la suppression est ARRIVÉE. Null sur la page qu'on a
  -- effectivement supprimée (la racine), renseigné sur chacun de ses
  -- descendants emportés avec elle. Deux conséquences : la corbeille n'affiche
  -- que les racines (`deleted_at is not null and deleted_root_id is null`) —
  -- une page et ses vingt sous-pages font UNE ligne, pas vingt —, et restaurer
  -- ou purger la racine retrouve exactement ce qui est parti avec elle.
  -- Un descendant déjà à la corbeille AVANT la suppression du parent garde son
  -- `deleted_root_id` à null : il reste restaurable pour lui-même.
  deleted_root_id uuid references public.pages(id) on delete set null
);

-- L'unique lecture chaude : toutes les pages vivantes d'un projet, d'un coup.
create index if not exists idx_pages_project
  on public.pages(project_id) where deleted_at is null;

-- La fratrie d'une page (reparentage, calcul de position en fin de fratrie).
create index if not exists idx_pages_parent on public.pages(parent_id);

-- La corbeille : partiel, comme les cinq autres types (20260919090000).
create index if not exists idx_pages_trash
  on public.pages(project_id, deleted_at desc) where deleted_at is not null;

-- Ce qui est parti avec une racine : restauration et purge lisent par là.
create index if not exists idx_pages_deleted_root
  on public.pages(deleted_root_id) where deleted_root_id is not null;

-- Recherche par titre. Configuration `simple` (pas de racinisation) : le corpus
-- est bilingue FR/EN dans le même projet, et choisir 'french' ou 'english'
-- désavantagerait l'autre moitié — un titre de page est court, la racinisation
-- y apporte peu.
create index if not exists idx_pages_title_search
  on public.pages using gin (to_tsvector('simple', title));

alter table public.pages enable row level security;

-- Policies calquées sur celles des objectifs : membre du projet = lecture et
-- écriture. `can_access_project` est SECURITY DEFINER et porte déjà son
-- `grant execute ... to authenticated` (20260704120000) — sans lui la branche
-- lèverait et ferait tomber la policy entière.
-- La lecture exclut les corbeillées, comme `issues_select` et
-- `objectives_select` : aucune lecture faite au client de session n'a à y
-- penser. Les écritures de la corbeille, elles, passent par le client service
-- (lib/server/pages.ts), qui refait le contrôle d'accès.
drop policy if exists pages_select on public.pages;
create policy pages_select on public.pages for select to authenticated
  using (public.can_access_project(project_id) and deleted_at is null);

drop policy if exists pages_insert on public.pages;
create policy pages_insert on public.pages for insert to authenticated
  with check (public.can_access_project(project_id));

drop policy if exists pages_update on public.pages;
create policy pages_update on public.pages for update to authenticated
  using (public.can_access_project(project_id))
  with check (public.can_access_project(project_id));

drop policy if exists pages_delete on public.pages;
create policy pages_delete on public.pages for delete to authenticated
  using (public.can_access_project(project_id));

drop trigger if exists pages_set_updated_at on public.pages;
create trigger pages_set_updated_at
  before update on public.pages
  for each row execute function public.set_updated_at();
