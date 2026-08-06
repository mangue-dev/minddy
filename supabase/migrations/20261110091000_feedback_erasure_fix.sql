-- minddy — Correctif de `purge_dormant_feedback_identities`.
--
-- La version posée par `20261110090000_feedback_erasure.sql` cherchait une
-- activité dans `feedback_facets`, `feedback_facet_votes` et
-- `feedback_facet_sources`. Ces trois tables n'existent plus : les facettes ont
-- été retirées en MIN-50 (`20260728090000_feedback_remove_facets.sql`). Écrite
-- d'après le schéma de la migration fondatrice du feedback, la fonction
-- décrivait donc un board d'il y a quatre mois.
--
-- Postgres ne l'a pas dit à la création : le corps d'une fonction plpgsql n'est
-- résolu qu'à l'exécution. La fonction existait, et n'aurait échoué que la nuit
-- suivante, dans une étape du balayage de rétention — laquelle est justement
-- écrite pour qu'une étape en panne n'emporte pas les autres. Autrement dit :
-- une purge morte, un `ok:false` dans un JSON de cron, et des adresses gardées
-- sans que personne ne s'en aperçoive.
--
-- Idempotent — safe to re-run.

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
       and not exists (select 1 from public.feedback_votes v where v.user_id = u.id)
       and not exists (select 1 from public.comments c where c.feedback_user_id = u.id)
       and not exists (
         select 1 from public.feedback_sessions s
          where s.user_id = u.id and s.expires_at > now()
       )
       -- Protège l'undo de fusion : `feedback_merge_events.payload` garde des
       -- uuid d'identités que `undo_feedback_merge` réinsère dans
       -- `feedback_votes`. Une identité citée par une fusion non défaite ferait
       -- échouer l'undo sur la clé étrangère — elle attend son tour.
       and not exists (
         select 1 from public.feedback_merge_events e
          where e.undone_at is null
            and (
              e.payload->'moved_vote_user_ids'      @> to_jsonb(u.id::text)
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
