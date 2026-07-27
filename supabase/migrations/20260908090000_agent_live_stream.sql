-- minddy — flux EN DIRECT d'une session de l'agent de code.
--
-- Jusqu'ici le fil d'un run ne lisait que `agent_run_events`, en POLLING toutes
-- les 2 s : la réponse de l'agent tombait d'un bloc, plusieurs secondes après
-- avoir été écrite. Numo, lui, streame — son fil tient une connexion SSE ouverte
-- sur la route qui fait tourner la boucle. L'agent de code ne peut pas faire
-- pareil : sa boucle tourne en tâche de fond (chaîne de drain, reprises par
-- cron), sans navigateur au bout du fil.
--
-- D'où un TOPIC PRIVÉ PAR RUN, `agent-run:{run_id}`, sur lequel le serveur
-- diffuse deux choses (lib/server/agent/live.ts) :
--   • `stream` — le texte du round EN COURS, ré-émis ~4 fois par seconde
--     pendant que le modèle écrit. Éphémère : rien n'est écrit en base.
--   • `event`  — la ligne `agent_run_events` qui vient d'être insérée, poussée
--     telle quelle pour que le fil l'affiche sans attendre son prochain poll.
--
-- Topic dédié, et non le `project:{id}` existant : seule la conversation ouverte
-- s'y abonne, au lieu d'arroser tous les membres du projet à 4 messages/seconde
-- pour une session qu'ils ne regardent pas.
--
-- Le polling 2 s reste en place comme filet (message perdu, onglet réveillé).
-- Idempotent — safe to re-run.

-- ── autorisation de réception ────────────────────────────────────────────────
-- Le topic ne porte que l'id du run : on remonte à son projet pour réutiliser
-- can_access_project(). En plpgsql pour que `agent-run:pas-un-uuid` réponde
-- « non » au lieu de faire échouer l'évaluation de la policy.
create or replace function public.can_watch_agent_run(topic text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare
  rid uuid;
  pid uuid;
begin
  begin
    rid := split_part(topic, ':', 2)::uuid;
  exception when others then
    return false;
  end;
  select project_id into pid from public.agent_runs where id = rid;
  if pid is null then
    return false;
  end if;
  return public.can_access_project(pid);
end;
$$;

-- Policy REMPLACÉE en entier (il n'y en a qu'une pour toute la réception
-- broadcast — voir 20260713090000_realtime_broadcast) : les deux branches
-- existantes sont reprises à l'identique, la troisième est nouvelle.
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
  )
);
