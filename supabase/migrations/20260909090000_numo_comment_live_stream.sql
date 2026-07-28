-- minddy — flux EN DIRECT d'une réponse @Numo en commentaire.
--
-- Jusqu'ici le corps d'une réponse @numo se remplissait par ÉCRITURES EN BASE :
-- un UPDATE de `comments` toutes les 900 ms, chacun déclenchant un broadcast sur
-- `project:{id}`, puis chez chaque spectateur un refetch COMPLET du fil (tous les
-- commentaires, leurs pièces jointes, la résolution des clés MCP). Le texte
-- arrivait donc par blocs d'une seconde et demie ; et la fin du message, que le
-- throttle ne poussait jamais, n'apparaissait qu'avec l'écriture finale — d'où
-- ce message qui « galérait à se terminer » à l'écran.
--
-- Même contrainte que l'agent de code (20260908090000) : la boucle tourne en
-- tâche de fond, dans un after(), sans navigateur au bout du fil — impossible de
-- streamer en SSE comme le fait l'assistant. Donc même remède : un TOPIC PRIVÉ
-- PAR RÉPONSE, `numo-comment:{comment_id}`, sur lequel le serveur diffuse le
-- texte du round en cours ~4 fois par seconde. ÉPHÉMÈRE : rien n'est écrit en
-- base. La base ne garde plus que la machine à états (working, outil en cours,
-- done, error) — trois ou quatre écritures par réponse au lieu de quarante.
--
-- Topic dédié plutôt que le `project:{id}` existant : seuls les onglets qui
-- REGARDENT ce fil s'y abonnent, au lieu d'arroser tous les membres du projet à
-- 4 messages/seconde pour une conversation qu'ils n'ont pas ouverte.
--
-- Le refetch tant que la réponse est 'working' reste en place comme filet
-- (message perdu, onglet réveillé, abonnement pas encore joint).
-- Idempotent — safe to re-run.

-- ── autorisation de réception ────────────────────────────────────────────────
-- Le topic ne porte que l'id du commentaire : on remonte à son projet pour
-- réutiliser can_access_project(). Un commentaire pend à UN ticket, UN objectif
-- ou UN post de feedback (contrainte num_nonnulls, voir 20260731090000) — les
-- trois chemins sont donc exclusifs. En plpgsql pour que
-- `numo-comment:pas-un-uuid` réponde « non » au lieu de faire échouer
-- l'évaluation de la policy.
create or replace function public.can_watch_numo_comment(topic text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare
  cid uuid;
  pid uuid;
  c record;
begin
  begin
    cid := split_part(topic, ':', 2)::uuid;
  exception when others then
    return false;
  end;

  select issue_id, objective_id, feedback_post_id into c
    from public.comments where id = cid;
  if not found then
    return false;
  end if;

  if c.issue_id is not null then
    select project_id into pid from public.issues where id = c.issue_id;
  elsif c.objective_id is not null then
    select project_id into pid from public.objectives where id = c.objective_id;
  elsif c.feedback_post_id is not null then
    select project_id into pid from public.feedback_posts where id = c.feedback_post_id;
  end if;

  if pid is null then
    return false;
  end if;
  return public.can_access_project(pid);
end;
$$;

-- Policy REMPLACÉE en entier (il n'y en a qu'une pour toute la réception
-- broadcast — voir 20260713090000_realtime_broadcast) : les trois branches
-- existantes sont reprises à l'identique, la quatrième est nouvelle.
drop policy if exists members_receive_broadcasts on realtime.messages;
create policy members_receive_broadcasts on realtime.messages
for select to authenticated
using (
  extension = 'broadcast' and (
    (
      realtime.topic() like 'project:%'
      and public.can_access_project(split_part(realtime.topic(), ':', 2)::uuid)
    )
    or (
      realtime.topic() like 'user:%'
      and split_part(realtime.topic(), ':', 2) = (select auth.uid()::text)
    )
    or (
      realtime.topic() like 'agent-run:%'
      and public.can_watch_agent_run(realtime.topic())
    )
    or (
      realtime.topic() like 'numo-comment:%'
      and public.can_watch_numo_comment(realtime.topic())
    )
  )
);
