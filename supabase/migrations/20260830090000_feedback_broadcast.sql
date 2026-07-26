-- minddy — realtime pour le feedback (MIN-89)
--
-- Les tables de feedback sont arrivées APRÈS 20260713090000_realtime_broadcast :
-- elles n'avaient aucun trigger de diffusion. Le board d'équipe, le badge
-- « retours ouverts » de la barre latérale et la section feedback de l'accueil
-- ne bougeaient donc qu'au bout de leur staleTime, jamais sur l'événement.
--
--   feedback_posts            → project_id direct
--   feedback_votes            → post_id, projet résolu via feedback_posts
--   feedback_post_categories  → idem
--
-- Charge utile : on N'UTILISE PAS realtime.broadcast_changes() pour les posts,
-- parce qu'elle diffuse la ligne entière — or feedback_posts porte
-- `embedding vector(1536)`, soit ~20 Ko de flottants par écriture, pour une
-- colonne qu'aucun client ne lit. On émet donc nous-mêmes, via realtime.send(),
-- la même forme de message (operation/table/schema/record/old_record) amputée de
-- cette colonne.
--
-- Autorisation de réception : rien à ajouter, la policy `members_receive_broadcasts`
-- couvre déjà tout topic `project:%` via can_access_project().
--
-- Idempotent — safe to re-run.

-- ── feedback_posts ───────────────────────────────────────────────────────────
-- security definer + wrapper d'exception : comme les autres broadcasters, un
-- échec de diffusion ne doit JAMAIS faire échouer l'écriture métier (une voix
-- déposée depuis un board public compte plus que sa notification).
create or replace function public.broadcast_feedback_post()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  pid uuid := coalesce(new.project_id, old.project_id);
  rec jsonb := null;
  old_rec jsonb := null;
begin
  if tg_op <> 'DELETE' then
    rec := to_jsonb(new) - 'embedding';
  end if;
  if tg_op <> 'INSERT' then
    old_rec := to_jsonb(old) - 'embedding';
  end if;

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
  return null;
exception when others then
  return null;
end;
$$;

-- ── feedback_votes / feedback_post_categories ────────────────────────────────
-- Keyées par post_id (et non feedback_post_id) : le projet se résout via le
-- post. Sur un DELETE en cascade depuis feedback_posts, le post est déjà parti →
-- pid null → on saute (le DELETE du post porte déjà l'information).
create or replace function public.broadcast_feedback_child()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  pid uuid;
begin
  select project_id into pid from public.feedback_posts
   where id = coalesce(new.post_id, old.post_id);
  if pid is not null then
    perform realtime.broadcast_changes(
      'project:' || pid, tg_op, tg_op, tg_table_name, tg_table_schema, new, old);
  end if;
  return null;
exception when others then
  return null;
end;
$$;

-- ── triggers ─────────────────────────────────────────────────────────────────
drop trigger if exists feedback_posts_broadcast on public.feedback_posts;
create trigger feedback_posts_broadcast
  after insert or update or delete on public.feedback_posts
  for each row execute function public.broadcast_feedback_post();

drop trigger if exists feedback_votes_broadcast on public.feedback_votes;
create trigger feedback_votes_broadcast
  after insert or update or delete on public.feedback_votes
  for each row execute function public.broadcast_feedback_child();

drop trigger if exists feedback_post_categories_broadcast
  on public.feedback_post_categories;
create trigger feedback_post_categories_broadcast
  after insert or update or delete on public.feedback_post_categories
  for each row execute function public.broadcast_feedback_child();
