-- minddy — MIN-282 : COMMENTER une page, et commenter un BLOC.
--
-- La page était le seul objet de minddy sur lequel on ne pouvait rien dire : un
-- ticket a ses commentaires, un objectif les siens, un retour du board aussi.
-- La discussion sur une spec se passait donc dans le ticket d'à côté, et se
-- perdait.
--
-- ── Pourquoi une TABLE À PART, et pas une colonne de plus sur `comments` ─────
--
-- `comments` porte déjà trois parents (`issue_id`, `objective_id`,
-- `feedback_post_id`) et, avec eux, des colonnes que rien d'autre ne lit — la
-- `visibility` du board, l'état d'une réponse @Numo, l'utilisateur du board.
-- Un quatrième parent y ajouterait TROIS colonnes de plus (`page_id`,
-- `block_id`, `quote`) nulles pour 100 % des lignes existantes, plus la
-- résolution que les trois autres fils n'ont pas. C'est exactement le chemin qui
-- a produit `notifications` à quatre colonnes de cible.
--
-- Et le fil d'une page N'EST PAS le même objet : il se RÉSOUT, il s'ANCRE à un
-- bloc, il n'a ni visibilité publique ni pièce jointe. Deux tables qui se
-- ressemblent mais ne se comportent pas pareil valent mieux qu'une table dont
-- la moitié des colonnes dépend de la valeur d'une autre.
--
-- ── L'ANCRE est le `block_id`, pas une position ─────────────────────────────
--
-- Une position dans le texte se décale à chaque frappe d'un voisin. L'id de bloc
-- est stable par construction (`UniqueID`, components/pages/page-extensions.ts)
-- et survit à la fusion bloc par bloc de MIN-271, qui identifie précisément par
-- lui. C'est du TEXTE NU et pas une clé étrangère : un id de bloc vit dans un
-- document ProseMirror, aucune table ne le porte, et il disparaît avec le
-- paragraphe qu'on efface — même raison que `notifications.block_id`
-- (20261203090000).
--
-- D'où `quote` : l'extrait FIGÉ au moment du commentaire. Quand le bloc n'est
-- plus là, le fil ne disparaît pas en silence — il remonte en tête, marqué
-- détaché, avec la phrase dont il parlait. Rien n'est écrit en base à ce
-- moment-là : le détachement est une LECTURE (un bloc peut revenir par un
-- annuler), calculée à l'affichage contre le document réel.
--
-- Idempotent — safe à re-run.

create table if not exists public.page_comments (
  id          uuid primary key default gen_random_uuid(),
  -- `cascade` : les fils suivent la page. La corbeille, elle, ne les touche
  -- pas — elle ne fait que masquer la page, et la RLS ci-dessous masque les
  -- fils avec elle. C'est la PURGE qui les emporte, par cette cascade.
  page_id     uuid not null references public.pages(id) on delete cascade,
  -- Redondant avec `pages.project_id`, et volontairement : la RLS, le
  -- diffuseur temps réel et l'invalidation de cache le lisent à chaque ligne,
  -- et une jointure de plus sur chacun des trois ne rapporterait rien.
  project_id  uuid not null references public.projects(id) on delete cascade,
  -- L'ancre. Null = un commentaire sur la PAGE, à sa suite.
  block_id    text,
  -- L'extrait, tel qu'il se lisait au moment du commentaire.
  quote       text,
  body        text not null default '',
  author_id   uuid references auth.users(id) on delete set null,
  -- La racine du fil quand cette ligne est une réponse (profondeur ≤ 1, la même
  -- règle que `comments`). `cascade` : supprimer une racine emporte son fil.
  parent_id   uuid references public.page_comments(id) on delete cascade,
  -- La RÉSOLUTION, portée par la racine du fil et elle seule.
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id) on delete set null,
  -- L'écriture d'un agent, comme sur les trois autres fils : Numo (le chat,
  -- @numo) ou une clé MCP, dont le nom tient lieu d'acteur dans le fil.
  via_assistant boolean not null default false,
  via_mcp       boolean not null default false,
  api_key_id    uuid references public.api_keys(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- L'unique lecture chaude : tout le fil d'une page, dans l'ordre.
create index if not exists idx_page_comments_page
  on public.page_comments(page_id, created_at);

-- Les réponses d'une racine (suppression en cascade, comptage du fil).
create index if not exists idx_page_comments_parent
  on public.page_comments(parent_id) where parent_id is not null;

alter table public.page_comments enable row level security;

-- Policies calquées sur `pages_*` (20261126090000) : membre du projet = lecture
-- et écriture. `can_access_project` est SECURITY DEFINER et porte déjà son
-- `grant execute … to authenticated` (20260704120000) — sans lui la branche
-- lèverait et ferait tomber la policy ENTIÈRE.
--
-- La lecture exclut les fils d'une page CORBEILLÉE, exactement comme
-- `pages_select` exclut la page : les fils suivent la page, pas l'inverse, et
-- aucune lecture faite au client de session n'a à y penser.
drop policy if exists page_comments_select on public.page_comments;
create policy page_comments_select on public.page_comments for select to authenticated
  using (
    public.can_access_project(project_id)
    and exists (
      select 1 from public.pages p
      where p.id = page_comments.page_id and p.deleted_at is null
    )
  );

-- Écrire son PROPRE commentaire : l'insertion passe par le client service
-- (lib/server/page-comments.ts, qui refait le contrôle d'accès et pose les
-- notifications), mais la policy existe pour que rien ne dépende du chemin.
drop policy if exists page_comments_insert on public.page_comments;
create policy page_comments_insert on public.page_comments for insert to authenticated
  with check (public.can_access_project(project_id) and author_id = (select auth.uid()));

-- ÉDITER reste à l'auteur — réécrire les mots d'un autre sous son nom n'est pas
-- de la modération, la même règle que les trois autres fils. La RÉSOLUTION, en
-- revanche, est ouverte à toute l'équipe : elle ne touche pas au texte, et un
-- fil qu'on ne peut clore que si son auteur revient n'est pas un fil.
drop policy if exists page_comments_update on public.page_comments;
create policy page_comments_update on public.page_comments for update to authenticated
  using (public.can_access_project(project_id))
  with check (public.can_access_project(project_id));

drop policy if exists page_comments_delete on public.page_comments;
create policy page_comments_delete on public.page_comments for delete to authenticated
  using (public.can_access_project(project_id) and author_id = (select auth.uid()));

drop trigger if exists page_comments_set_updated_at on public.page_comments;
create trigger page_comments_set_updated_at
  before update on public.page_comments
  for each row execute function public.set_updated_at();

-- ── Realtime ────────────────────────────────────────────────────────────────
-- La table porte `project_id` : le diffuseur générique par projet suffit, sans
-- une fonction de plus. `broadcast_project_scoped` (20260713090000) diffuse sur
-- `project:<project_id>`, le topic auquel le pont abonne déjà chacun de mes
-- projets (lib/realtime-provider.tsx). PAS de canal par page : la présence de
-- page passe déjà par le topic du projet, en ouvrir un second doublerait les
-- abonnements pour la même information.
drop trigger if exists page_comments_broadcast on public.page_comments;
create trigger page_comments_broadcast
  after insert or update or delete on public.page_comments
  for each row execute function public.broadcast_project_scoped();

-- ── notifications : un type de plus ─────────────────────────────────────────
-- `page_comment` — on a commenté une page que j'ai écrite, ou un fil auquel
-- j'ai participé. Le pendant exact de `comment` sur un ticket. La CITATION dans
-- un commentaire de page, elle, reste un `page_mention` (20261203090000) : c'est
-- la même phrase et le même endroit où aller.
--
-- Le CHECK inline est auto-nommé <table>_<col>_check : il se reprend EN ENTIER,
-- la liste recopiée (même mécanique que 20261203090000).
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('assigned','mention','comment',
                  'agent_done','agent_question','agent_failed',
                  'feedback_new',
                  'pr_reviewed','pr_merged','pr_opened',
                  'automation_paused','automation_stopped',
                  'routine_done',
                  'page_mention','page_agent_edit','page_comment'));
