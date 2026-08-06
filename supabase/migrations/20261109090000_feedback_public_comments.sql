-- minddy — Commentaires PUBLICS sur les retours du board (MIN-196)
--
-- Le board savait recevoir un besoin et le faire voter. Il ne savait pas
-- discuter : la seule parole descendante était `feedback_posts.team_response`,
-- un champ texte unique, sans auteur, sans fil, rendu en bas de la page comme
-- un encart de l'équipe. Personne ne pouvait apporter un détail, préciser un
-- cas, dire « chez moi c'est plutôt ceci ».
--
-- On ouvre donc la discussion publique, et du même geste on fait de la réponse
-- d'équipe UNE ENTRÉE de cette discussion plutôt qu'un champ à part.
--
-- Pas de nouvelle table : les commentaires internes des retours vivent déjà
-- dans `public.comments` (parent polymorphe `feedback_post_id`, MIN-51). On y
-- ajoute la distinction publique/interne et l'auteur visiteur.
--
--   visibility        'internal' (défaut) = équipe seule, comme aujourd'hui
--                     'public'            = lu sur le board par tout le monde
--   feedback_user_id  l'auteur VISITEUR d'un commentaire public.
--                     Les commentaires d'équipe gardent `author_id` ; les
--                     commentaires publics d'équipe n'ont ni l'un ni l'autre
--                     quand ils viennent du backfill (voir plus bas).
--
-- Ce qui ne bouge PAS : les policies de `comments`. Un commentaire de feedback
-- (issue_id/objective_id nuls) ne matche aucune policy select — c'est voulu
-- depuis MIN-51, et ça reste vrai des commentaires publics : le board public
-- n'a pas de session Postgres, il lit par le service client dans
-- lib/server/feedback/comments.ts. Ouvrir une policy ici donnerait aux membres
-- une deuxième porte de lecture qui ne servirait personne.
--
-- Idempotent — safe to re-run.

-- ── comments : visibilité + auteur visiteur ─────────────────────────────────
alter table public.comments
  add column if not exists visibility text not null default 'internal',
  add column if not exists feedback_user_id uuid
    references public.feedback_users(id) on delete set null;

do $$
begin
  alter table public.comments drop constraint if exists comments_visibility_ck;
  alter table public.comments
    add constraint comments_visibility_ck
    check (visibility in ('internal', 'public'));

  -- Un auteur visiteur n'existe que sur un commentaire PUBLIC d'un RETOUR :
  -- une identité de board n'a rien à faire sur le fil d'un ticket, et un
  -- commentaire interne signé par un visiteur serait un membre fantôme.
  alter table public.comments drop constraint if exists comments_public_author_ck;
  alter table public.comments
    add constraint comments_public_author_ck
    check (
      feedback_user_id is null
      or (feedback_post_id is not null and visibility = 'public')
    );

  -- La visibilité elle-même n'a de sens que sur un retour : les fils de
  -- tickets et d'objectifs sont internes par construction.
  alter table public.comments drop constraint if exists comments_visibility_scope_ck;
  alter table public.comments
    add constraint comments_visibility_scope_ck
    check (visibility = 'internal' or feedback_post_id is not null);
end $$;

-- La lecture du board : un post, ses commentaires publics, dans l'ordre.
create index if not exists idx_comments_feedback_public
  on public.comments(feedback_post_id, created_at)
  where feedback_post_id is not null and visibility = 'public';

-- ── feedback_boards : « Autoriser les commentaires » ────────────────────────
-- Défaut `true` : c'est une fonctionnalité qu'on livre, désactivable — pas un
-- opt-in de plus à découvrir. Désactivé = LECTURE SEULE : le composeur
-- disparaît, ce qui a déjà été écrit reste lisible. Masquer après coup la
-- parole de quelqu'un serait pire, et la réponse d'équipe étant devenue un
-- commentaire, la faire disparaître avec le réglage serait une régression.
alter table public.feedback_boards
  add column if not exists allow_comments boolean not null default true;

-- ── team_response → commentaire public ──────────────────────────────────────
-- Le backfill n'attribue aucun auteur : on ne sait pas QUI, dans l'équipe, a
-- écrit la réponse — le champ ne l'a jamais enregistré. C'est sans conséquence
-- côté public, où l'équipe signe « Équipe <projet> » et non un nom de membre,
-- exactement comme le faisait l'encart qu'on remplace.
--
-- Un commentaire public sans `feedback_user_id` EST la voix de l'équipe : c'est
-- la règle de lecture, ici comme dans lib/server/feedback/comments.ts.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'feedback_posts'
      and column_name = 'team_response'
  ) then
    insert into public.comments
      (feedback_post_id, author_id, feedback_user_id, body, visibility, created_at, updated_at)
    select
      p.id,
      null,
      null,
      p.team_response,
      'public',
      coalesce(p.team_response_at, p.created_at),
      coalesce(p.team_response_at, p.created_at)
    from public.feedback_posts p
    where p.team_response is not null
      and btrim(p.team_response) <> '';

    alter table public.feedback_posts
      drop column team_response,
      drop column team_response_at;
  end if;
end $$;
