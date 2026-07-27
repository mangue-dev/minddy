-- minddy — realtime sur les runs de l'agent de code.
--
-- Le spinner « Numo travaille » de la barre latérale, la liste de la page Agents
-- et le compteur de PR lisent des caches React Query qui ne se rafraîchissaient
-- que par POLLING — et ce polling ne démarre QUE si une session travaille déjà.
-- Un run lancé ailleurs que dans le composer (l'assistant Numo via
-- `launch_code_agent`, un @numo en commentaire, un coéquipier, un autre onglet)
-- n'atteignait donc l'écran qu'au rechargement de la page.
--
-- Même mécanique que 20260713090000_realtime_broadcast : un trigger pousse sur
-- le topic privé `project:{project_id}`, et le RealtimeProvider (seul abonné,
-- lib/realtime-provider.tsx) invalide les caches. L'autorisation de réception
-- est déjà couverte par `members_receive_broadcasts` (tout topic `project:%`).
-- Idempotent — safe to re-run.
--
-- DEUX différences avec les autres tables, volontaires :
--
--  1. Charge utile amputée de `checkpoint`, comme feedback_posts l'est de son
--     `embedding` (20260830090000_feedback_broadcast) : c'est l'état complet de
--     reprise du run (historique des messages, compteurs — potentiellement des
--     centaines de Ko), qu'aucun client ne lit et qui ferait dépasser la taille
--     max d'un message realtime. On émet donc nous-mêmes, via realtime.send(),
--     la même forme de message (operation/table/schema/record/old_record) et le
--     même nom d'événement (TG_OP) que broadcast_changes.
--
--  2. UPDATE FILTRÉ. Un run est réécrit à chaque chunk (checkpoint, activité,
--     coût) : diffuser tout ça ne dirait rien de neuf à l'écran. Seules les
--     transitions VISIBLES déclenchent — statut, PR, attente d'une réponse —
--     c'est-à-dire exactement ce que la barre latérale et la page Agents
--     affichent.

create or replace function public.broadcast_agent_run_row()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  pid uuid := coalesce(new.project_id, old.project_id);
  rec jsonb := null;
  old_rec jsonb := null;
begin
  if tg_op <> 'DELETE' then
    rec := to_jsonb(new) - 'checkpoint';
  end if;
  if tg_op <> 'INSERT' then
    old_rec := to_jsonb(old) - 'checkpoint';
  end if;

  if pid is not null then
    perform realtime.send(
      jsonb_build_object(
        'operation', tg_op,
        'table', tg_table_name,
        'schema', tg_table_schema,
        'record', rec,
        'old_record', old_rec
      ),
      tg_op,
      'project:' || pid,
      true
    );
  end if;
  return null;
exception when others then
  -- Un échec de diffusion ne doit JAMAIS faire échouer le lancement d'un run.
  return null;
end;
$$;

-- INSERT : le lancement lui-même — c'est lui qui doit allumer le spinner.
drop trigger if exists agent_runs_broadcast_insert on public.agent_runs;
create trigger agent_runs_broadcast_insert
  after insert on public.agent_runs
  for each row execute function public.broadcast_agent_run_row();

-- UPDATE : uniquement les transitions que l'écran montre (queued → running →
-- terminé, ouverture/fusion de PR, attente d'une réponse).
drop trigger if exists agent_runs_broadcast_update on public.agent_runs;
create trigger agent_runs_broadcast_update
  after update on public.agent_runs
  for each row
  when (old.status is distinct from new.status
     or old.pr_state is distinct from new.pr_state
     or old.pr_number is distinct from new.pr_number
     or old.awaiting_input is distinct from new.awaiting_input)
  execute function public.broadcast_agent_run_row();

-- DELETE : rien. Un run ne disparaît que par cascade (issue ou projet supprimé),
-- et ces DELETE-là diffusent déjà de leur côté.
