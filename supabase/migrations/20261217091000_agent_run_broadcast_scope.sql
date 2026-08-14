-- minddy — MIN-332, deuxième moitié : le TEMPS RÉEL disait ce que la RLS taisait.
--
-- Deux fuites, indépendantes des policies (le trigger est SECURITY DEFINER, et
-- l'autorisation de topic est une fonction à elle) :
--
--  1. `broadcast_agent_run_row` poussait la LIGNE ENTIÈRE — prompt compris — sur
--     `project:{id}`, où tout membre du projet est abonné. La conversation d'un
--     coéquipier arrivait donc dans le navigateur des autres, en direct, sans
--     qu'aucune policy soit consultée.
--  2. `can_watch_agent_run` n'autorisait le topic `agent-run:{id}` que sur
--     l'appartenance au projet : n'importe quel membre pouvait suivre le flux
--     d'un run qu'il n'avait pas le droit de lire.
--
-- LE CORRECTIF, EN DEUX GESTES.
--
--  • CHARGE UTILE MINIMALE. Le seul lecteur de cet événement est
--    `lib/realtime-provider.tsx`, et il n'y lit que de quoi INVALIDER des caches :
--    l'id, le ticket, la routine. On n'émet donc plus que ces colonnes-là. Le
--    contenu (prompt, titre, message d'erreur, checkpoint) ne voyage plus du
--    tout : le client relit par une route, qui vérifie l'accès.
--  • TOPIC SELON LA VISIBILITÉ. Un run PARTAGÉ (routine, automatisation, pull
--    request — cf. la migration jumelle) va sur `project:{id}`, comme avant. Un
--    run PERSONNEL va sur `user:{created_by}`, où son créateur est seul abonné :
--    les autres membres n'apprennent même pas qu'il existe. Le topic `user:%` est
--    déjà autorisé par `members_receive_broadcasts` (20260908090000), rien à
--    ajouter côté policy.
--
-- Idempotent — safe to re-run.

-- ── 1. Le trigger de diffusion ─────────────────────────────────────────────
create or replace function public.broadcast_agent_run_row()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  pid      uuid;
  author   uuid;
  shared   boolean;
  topic    text;
  rec      jsonb := null;
  old_rec  jsonb := null;
begin
  -- `coalesce(new, old)` ne marche pas sur des variables de type RECORD en
  -- plpgsql : on prend les champs un par un, comme le faisait déjà ce trigger.
  if tg_op = 'DELETE' then
    pid := old.project_id;
    author := old.created_by;
    shared := old.routine_id is not null
           or old.chain_id is not null
           or old.pull_request_id is not null;
  else
    pid := new.project_id;
    author := new.created_by;
    shared := new.routine_id is not null
           or new.chain_id is not null
           or new.pull_request_id is not null;
  end if;

  -- Les seules colonnes que le client lit de cet événement. Tout le reste — à
  -- commencer par `prompt` — n'a rien à faire dans un message diffusé.
  if tg_op <> 'DELETE' then
    rec := jsonb_build_object(
      'id', new.id,
      'project_id', new.project_id,
      'issue_id', new.issue_id,
      'routine_id', new.routine_id,
      'status', new.status
    );
  end if;
  if tg_op <> 'INSERT' then
    old_rec := jsonb_build_object(
      'id', old.id,
      'project_id', old.project_id,
      'issue_id', old.issue_id,
      'routine_id', old.routine_id,
      'status', old.status
    );
  end if;

  if shared then
    topic := case when pid is not null then 'project:' || pid end;
  else
    -- Conversation personnelle : son créateur, et lui seul. Sans créateur
    -- (compte supprimé), personne — donc pas de diffusion du tout.
    topic := case when author is not null then 'user:' || author end;
  end if;

  if topic is not null then
    perform realtime.send(
      jsonb_build_object(
        'operation', tg_op,
        'table', tg_table_name,
        'schema', tg_table_schema,
        'record', rec,
        'old_record', old_rec
      ),
      tg_op,
      topic,
      true
    );
  end if;
  return null;
exception when others then
  -- Un échec de diffusion ne doit JAMAIS faire échouer le lancement d'un run.
  return null;
end;
$$;

-- ── 2. L'autorisation du topic `agent-run:{id}` ────────────────────────────
-- Même prédicat que `agent_runs_select`, sur la ligne remontée par l'id du topic.
-- Reste en plpgsql pour que `agent-run:pas-un-uuid` réponde « non » au lieu de
-- faire échouer l'évaluation de la policy — et donc de faire tomber TOUTE la
-- réception broadcast, `members_receive_broadcasts` n'ayant qu'une policy.
create or replace function public.can_watch_agent_run(topic text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare
  rid uuid;
  r   public.agent_runs;
begin
  begin
    rid := split_part(topic, ':', 2)::uuid;
  exception when others then
    return false;
  end;
  select * into r from public.agent_runs where id = rid;
  if not found then
    return false;
  end if;
  if not public.can_access_project(r.project_id) then
    return false;
  end if;
  return r.created_by = (select auth.uid())
      or r.routine_id is not null
      or r.chain_id is not null
      or r.pull_request_id is not null;
end;
$$;

-- Le grant de 20260929091000 survit à un `create or replace` (même signature),
-- mais on le redit : cette fonction est appelée DEPUIS une policy, et sans
-- `execute` la branche lève et fait tomber la policy entière.
grant execute on function public.can_watch_agent_run(text) to authenticated;
