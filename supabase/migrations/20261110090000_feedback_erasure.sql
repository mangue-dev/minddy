-- minddy — Effacement d'un participant de board, et purge des identités
-- dormantes (RGPD art. 17 et 5.1.e).
--
-- Le board savait créer une identité de visiteur ; il ne savait pas la défaire.
-- Aucun `delete` sur `feedback_users` n'existait dans le dépôt : l'adresse de
-- quelqu'un qui avait vérifié son email restait en base sans terme, et une
-- demande d'effacement n'avait aucun outil pour être honorée. La politique de
-- confidentialité en promettait pourtant deux.
--
-- ── Effacer, ce n'est PAS supprimer la ligne ────────────────────────────────
--
-- Supprimer la ligne casse trois choses d'un coup :
--
--   1. `comments.feedback_user_id` est `on delete set null`, et un commentaire
--      public SANS auteur visiteur EST la voix de l'équipe (règle de lecture de
--      lib/server/feedback/comments.ts). Effacer quelqu'un ferait donc dire à
--      l'équipe ce qu'un visiteur avait écrit — le contraire d'un effacement.
--   2. `comments.parent_id` cascade : supprimer un message emporte les réponses,
--      celles des autres visiteurs et de l'équipe comprises. Effacer une
--      personne détruirait la parole de tiers.
--   3. Les votes partent, et les compteurs avec : le poids d'un retour changerait
--      rétroactivement parce que quelqu'un a exercé un droit.
--
-- On efface donc les IDENTIFIANTS et on garde la ligne, opaque : email, nom et
-- external_id à NULL, `erased_at` posé. Ce qui reste — un uuid et un pseudonyme
-- tiré de cet uuid — ne désigne plus personne et n'est plus rattachable : c'est
-- la même anonymisation que `ai_usage.user_id` à la suppression d'un compte,
-- déjà inscrite au registre. Les contributions survivent sous pseudonyme, les
-- fils restent lisibles, les votes gardent leur poids.
--
-- Conséquence voulue : la personne qui revient se vérifier obtient une identité
-- NEUVE. L'ancienne ne la connaît plus, et c'est bien ce qu'elle a demandé.
--
-- ── Le CHECK d'identité doit laisser passer ce cas ──────────────────────────
--
-- `feedback_users_identity` exigeait external_id OU email : une ligne effacée
-- n'a ni l'un ni l'autre. On l'étend plutôt que de le lever — hors effacement,
-- la règle « jamais d'anonyme » du board reste entière.
--
-- Idempotent — safe to re-run.

alter table public.feedback_users
  add column if not exists erased_at timestamptz;

comment on column public.feedback_users.erased_at is
  'Horodatage de l''effacement RGPD : la ligne ne porte plus d''identifiant, ses contributions restent sous pseudonyme.';

alter table public.feedback_users drop constraint if exists feedback_users_identity;
alter table public.feedback_users add constraint feedback_users_identity
  check (erased_at is not null or external_id is not null or email is not null);

-- ── Purge des identités dormantes ───────────────────────────────────────────
--
-- Vérifier son adresse puis ne rien faire laissait un email en base pour
-- toujours : conservé sans finalité, c'est le manquement de l'article 5.1.e.
-- Passé le délai, une identité qui n'a RIEN produit part pour de bon — ici la
-- ligne entière, puisqu'aucune contribution ne s'y raccroche.
--
-- Les « rien produit » sont énumérés plutôt que résumés : chacun est une table
-- qui référence l'identité, et en oublier une supprimerait une ligne encore
-- utile. La session vivante compte comme une activité — quelqu'un dont l'onglet
-- est encore ouvert n'est pas dormant.
--
-- Le dernier `not exists` protège l'undo de fusion : `feedback_merge_events`
-- garde des uuid d'identités dans son payload et `undo_feedback_merge` les
-- réinsère dans `feedback_votes`. Une identité citée par un merge non défait
-- ferait échouer l'undo sur la clé étrangère — elle attend donc son tour.
--
-- ⚠️ La version ci-dessous cherche aussi une activité dans les tables de
-- FACETTES, qui n'existent plus depuis MIN-50. Elle est conservée telle qu'elle
-- a été appliquée ; c'est `20261110091000_feedback_erasure_fix.sql` qui fait foi.
create or replace function public.purge_dormant_feedback_identities(
  p_before timestamptz,
  p_limit  integer default 500
)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_deleted integer;
begin
  with dormant as (
    select u.id
      from public.feedback_users u
     where u.created_at < p_before
       and not exists (select 1 from public.feedback_posts p where p.author_id = u.id)
       and not exists (select 1 from public.feedback_facets f where f.created_by = u.id)
       and not exists (select 1 from public.feedback_votes v where v.user_id = u.id)
       and not exists (select 1 from public.feedback_facet_votes fv where fv.user_id = u.id)
       and not exists (select 1 from public.comments c where c.feedback_user_id = u.id)
       and not exists (
         select 1 from public.feedback_sessions s
          where s.user_id = u.id and s.expires_at > now()
       )
       and not exists (
         select 1 from public.feedback_merge_events e
          where e.undone_at is null
            and (
              e.payload->'moved_vote_user_ids'   @> to_jsonb(u.id::text)
              or e.payload->'dropped_vote_user_ids' @> to_jsonb(u.id::text)
            )
       )
     limit p_limit
  )
  delete from public.feedback_users u using dormant d where u.id = d.id;
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function public.purge_dormant_feedback_identities(timestamptz, integer)
  from public, anon, authenticated;
grant execute on function public.purge_dormant_feedback_identities(timestamptz, integer)
  to service_role;
