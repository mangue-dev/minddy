-- minddy — MIN-161 : une pull request qui bouge se voit tout de suite, partout.
--
-- Depuis MIN-143 la table `pull_requests` est écrite par les deux récepteurs
-- webhook et par le balayage, mais RIEN ne la diffusait : la liste des PR ne
-- bougeait que sur un événement `agent_runs` (20260907090000) — donc jamais pour
-- une PR humaine, et jamais sur un simple changement d'état. Ouvrir une PR sur
-- github.com, la fusionner, la rouvrir : l'onglet resté sur /pull-requests
-- l'ignorait jusqu'au prochain rechargement.
--
-- DEUX mécanismes, et ils ne servent pas la même chose :
--
--  1. Le TRIGGER ci-dessous, sur le topic `project:{id}` — le pont unique de
--     lib/realtime-provider.tsx. Il atteint la LISTE, le panneau du ticket et
--     les compteurs de tous les membres, y compris ceux qui ne regardent pas
--     cette PR. Le fan-out passe par `project_git_links` : une PR est un fait du
--     DÉPÔT (même clé que sa policy de lecture), et deux projets qui lient le
--     même dépôt doivent tous deux l'apprendre.
--
--  2. Le topic `pull-request:{id}`, autorisé plus bas — le pendant d'
--     `agent-run:{id}` et de `pr-review:{id}`. Le CONTENU d'une PR (fil,
--     commits, remarques de ligne, réactions, checks) n'est pas en base : il est
--     lu chez la forge à chaque requête, avec un token frais. Il n'y a donc rien
--     à diffuser depuis un trigger — c'est le serveur qui pousse un message
--     `changed` nommant les parties touchées, et seul le panneau ouvert s'y
--     abonne pour aller relire (lib/server/agent/pr-live.ts, lib/use-pr-live.ts).
--
-- Idempotent — safe to re-run.

-- ── Diffusion de la ligne, aux projets qui lient le dépôt ───────────────────
-- Même forme de message que `broadcast_agent_run_row` (operation/table/schema/
-- record/old_record, nom d'événement = TG_OP) : c'est ce que le provider sait
-- lire. Émission MANUELLE par realtime.send() plutôt que broadcast_changes,
-- parce qu'il faut boucler sur plusieurs topics — un par projet du dépôt.
create or replace function public.broadcast_pull_request_row()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  pid uuid;
  rec jsonb := null;
  old_rec jsonb := null;
  row_provider text := coalesce(new.provider, old.provider);
  row_repo text := coalesce(new.repo_full_name, old.repo_full_name);
begin
  if tg_op <> 'DELETE' then
    rec := to_jsonb(new);
  end if;
  if tg_op <> 'INSERT' then
    old_rec := to_jsonb(old);
  end if;

  for pid in
    select l.project_id
    from public.project_git_links l
    where l.provider = row_provider
      and l.repo_full_name = row_repo
  loop
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
  end loop;
  return null;
exception when others then
  -- Une diffusion ratée ne doit JAMAIS faire tomber un webhook : l'ingestion
  -- d'une PR est le chemin normal, le direct n'en est que le confort.
  return null;
end;
$$;

-- INSERT : la PR apparaît — c'est elle qui doit surgir dans la liste.
drop trigger if exists pull_requests_broadcast_insert on public.pull_requests;
create trigger pull_requests_broadcast_insert
  after insert on public.pull_requests
  for each row execute function public.broadcast_pull_request_row();

-- UPDATE **FILTRÉ**, et ce n'est pas une optimisation de confort :
-- `syncRepoPullRequests` réécrit TOUTES les lignes d'un dépôt à chaque balayage
-- (`synced_at`, `updated_at`), soit des centaines de messages pour rien. Seules
-- les colonnes que l'écran MONTRE déclenchent.
drop trigger if exists pull_requests_broadcast_update on public.pull_requests;
create trigger pull_requests_broadcast_update
  after update on public.pull_requests
  for each row
  when (old.state is distinct from new.state
     or old.title is distinct from new.title
     or old.url is distinct from new.url
     or old.head_sha is distinct from new.head_sha
     or old.issue_id is distinct from new.issue_id
     or old.merged_at is distinct from new.merged_at)
  execute function public.broadcast_pull_request_row();

-- DELETE : rien. Une PR ne disparaît pas — elle se ferme.

-- ── Réception du direct d'UNE pull request ─────────────────────────────────
-- Le topic ne porte que l'id de la PR : on remonte aux projets qui lient son
-- dépôt, exactement comme `can_watch_pr_review` (20260927090000) et comme la
-- policy de lecture de `pull_requests`. En plpgsql pour qu'un topic malformé
-- réponde « non » au lieu de faire échouer l'évaluation de la policy.
create or replace function public.can_watch_pull_request(topic text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare
  prid uuid;
begin
  begin
    prid := split_part(topic, ':', 2)::uuid;
  exception when others then
    return false;
  end;
  return exists (
    select 1
    from public.pull_requests p
    join public.project_git_links l
      on l.provider = p.provider
     and l.repo_full_name = p.repo_full_name
    where p.id = prid
      and public.can_access_project(l.project_id)
  );
end;
$$;

-- Policy REMPLACÉE en entier (il n'y en a qu'une pour toute la réception
-- broadcast) : les cinq branches existantes sont reprises à l'identique, la
-- sixième est nouvelle.
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
    or (
      realtime.topic() like 'pr-review:%'
      and public.can_watch_pr_review(realtime.topic())
    )
    or (
      realtime.topic() like 'pull-request:%'
      and public.can_watch_pull_request(realtime.topic())
    )
  )
);

-- `authenticated` DOIT pouvoir exécuter cette fonction : elle est appelée depuis
-- l'expression de la policy ci-dessus, dont le contrôle de privilège se fait au
-- nom de l'appelant. C'est la même exception que les cinq definers de
-- l'allowlist de 20260926093000 — et pour la même raison qu'elles : la fonction
-- ne répond que sur l'accès de l'APPELANT, elle ne révèle rien qu'il ne sache
-- déjà. Explicite ici plutôt que laissé aux default privileges de Supabase.
grant execute on function public.can_watch_pull_request(text) to authenticated;
