-- minddy — Feedback : retrait complet des facettes (MIN-50)
-- On ne garde que la base : posts (racines) votables + description + merge +
-- réponse d'équipe + promotion en issue. Les facettes (objets votables
-- rattachés à un post, extraits par l'IA ou ajoutés par les utilisateurs) sont
-- supprimées à 100 % : tables, RPC, et le volet facettes des fonctions de merge.
-- Le merge de posts et son undo restent, débarrassés du transfert de facettes.
-- Idempotent — safe to re-run.

-- ── merge_feedback_posts sans le transfert des facettes ──────────────────────
-- Union des votes par identité, aplatissement des chaînes à l'écriture,
-- tombstone, event d'undo. Le payload ne porte plus `moved_facet_ids`.
create or replace function public.merge_feedback_posts(
  p_dup          uuid,
  p_canonical    uuid,
  p_performed_by text,
  p_actor        uuid default null,
  p_confidence   real default null
)
returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_dup          public.feedback_posts%rowtype;
  v_can          public.feedback_posts%rowtype;
  v_target       uuid;
  v_dropped      uuid[];
  v_moved        uuid[];
  v_repointed    uuid[];
  v_event        uuid;
begin
  if p_performed_by not in ('ai', 'team') then
    raise exception 'feedback_merge_invalid_performer';
  end if;

  -- Résolution un saut vers le haut si la cible est elle-même tombstonée
  -- (l'aplatissement garantit une profondeur ≤ 1).
  select coalesce(merged_into_id, id) into v_target
    from public.feedback_posts where id = p_canonical;
  if v_target is null then raise exception 'feedback_merge_target_not_found'; end if;
  if v_target = p_dup then raise exception 'feedback_merge_self'; end if;

  -- Locks ordonnés par id (anti-deadlock).
  if p_dup < v_target then
    select * into v_dup from public.feedback_posts where id = p_dup for update;
    select * into v_can from public.feedback_posts where id = v_target for update;
  else
    select * into v_can from public.feedback_posts where id = v_target for update;
    select * into v_dup from public.feedback_posts where id = p_dup for update;
  end if;

  if v_dup.id is null then raise exception 'feedback_merge_dup_not_found'; end if;
  if v_can.id is null then raise exception 'feedback_merge_target_not_found'; end if;
  if v_dup.project_id <> v_can.project_id then raise exception 'feedback_merge_cross_project'; end if;
  if v_dup.merged_into_id is not null then raise exception 'feedback_merge_dup_already_merged'; end if;
  if v_can.merged_into_id is not null then raise exception 'feedback_merge_target_merged'; end if;
  -- Un post promu en issue ne peut pas être absorbé (il reste cible valide).
  if v_dup.issue_id is not null then raise exception 'feedback_merge_dup_promoted'; end if;

  -- Votes présents des deux côtés : dédupliqués (supprimés côté doublon).
  select coalesce(array_agg(v.user_id), '{}') into v_dropped
    from public.feedback_votes v
   where v.post_id = p_dup
     and exists (
       select 1 from public.feedback_votes c
        where c.post_id = v_target and c.user_id = v.user_id
     );

  delete from public.feedback_votes
   where post_id = p_dup and user_id = any(v_dropped);

  -- Le reste migre (le trigger maintient les deux compteurs).
  with moved as (
    update public.feedback_votes set post_id = v_target
     where post_id = p_dup
    returning user_id
  )
  select coalesce(array_agg(user_id), '{}') into v_moved from moved;

  -- Aplatissement : tout ce qui pointait vers le doublon repointe la cible.
  with rp as (
    update public.feedback_posts set merged_into_id = v_target
     where merged_into_id = p_dup
    returning id
  )
  select coalesce(array_agg(id), '{}') into v_repointed from rp;

  -- Les suggestions visant le doublon deviennent caduques (non restaurées à
  -- l'undo : l'analyseur les régénère).
  update public.feedback_posts
     set suggested_merge_into_id = null, suggested_confidence = null
   where suggested_merge_into_id = p_dup;

  -- Tombstone.
  update public.feedback_posts
     set merged_into_id = v_target,
         suggested_merge_into_id = null,
         suggested_confidence = null
   where id = p_dup;

  insert into public.feedback_merge_events
    (project_id, kind, dup_id, canonical_id, performed_by, actor_id, confidence, payload)
  values
    (v_dup.project_id, 'post', p_dup, v_target, p_performed_by, p_actor, p_confidence,
     jsonb_build_object(
       'moved_vote_user_ids',   to_jsonb(v_moved),
       'dropped_vote_user_ids', to_jsonb(v_dropped),
       'repointed_chain_ids',   to_jsonb(v_repointed)
     ))
  returning id into v_event;

  return v_event;
end;
$$;

revoke all on function public.merge_feedback_posts(uuid, uuid, text, uuid, real) from public, anon, authenticated;
grant execute on function public.merge_feedback_posts(uuid, uuid, text, uuid, real) to service_role;

-- ── undo_feedback_merge post-only ────────────────────────────────────────────
-- Les votes ajoutés sur la canonique APRÈS le merge y restent : seules les
-- identités enregistrées dans le payload sont touchées. Les events historiques
-- kind='facet' (facettes supprimées) ne sont plus défaisables.
create or replace function public.undo_feedback_merge(p_event uuid, p_actor uuid default null)
returns void
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_ev             public.feedback_merge_events%rowtype;
  v_state          uuid;
  v_moved          uuid[];
  v_dropped        uuid[];
  v_repointed      uuid[];
begin
  select * into v_ev from public.feedback_merge_events where id = p_event for update;
  if v_ev.id is null then raise exception 'feedback_undo_not_found'; end if;
  if v_ev.undone_at is not null then raise exception 'feedback_undo_already_undone'; end if;
  -- Les facettes ayant été retirées (MIN-50), seuls les merges de posts se défont.
  if v_ev.kind <> 'post' then raise exception 'feedback_undo_unsupported_kind'; end if;

  v_moved     := array(select jsonb_array_elements_text(v_ev.payload->'moved_vote_user_ids'))::uuid[];
  v_dropped   := array(select jsonb_array_elements_text(v_ev.payload->'dropped_vote_user_ids'))::uuid[];
  v_repointed := array(select jsonb_array_elements_text(v_ev.payload->'repointed_chain_ids'))::uuid[];

  -- Lock des deux posts, ordonnés par id.
  if v_ev.dup_id < v_ev.canonical_id then
    perform 1 from public.feedback_posts where id = v_ev.dup_id for update;
    perform 1 from public.feedback_posts where id = v_ev.canonical_id for update;
  else
    perform 1 from public.feedback_posts where id = v_ev.canonical_id for update;
    perform 1 from public.feedback_posts where id = v_ev.dup_id for update;
  end if;

  select merged_into_id into v_state from public.feedback_posts where id = v_ev.dup_id;
  if v_state is distinct from v_ev.canonical_id then
    -- La canonique a été mergée depuis (le doublon a été repointé) : undo
    -- LIFO uniquement — défaire d'abord le merge le plus récent.
    raise exception 'feedback_undo_stale';
  end if;

  -- Votes déplacés : reviennent s'ils existent encore (un unvote post-merge
  -- vaut pour le concept fusionné et n'est pas ressuscité).
  update public.feedback_votes set post_id = v_ev.dup_id
   where post_id = v_ev.canonical_id and user_id = any(v_moved);

  -- Votes dédupliqués : leur voix sur le doublon était indépendante.
  insert into public.feedback_votes (post_id, user_id)
  select v_ev.dup_id, u from unnest(v_dropped) as u
  on conflict do nothing;

  -- Dé-tombstone sans re-rentrer dans la file d'analyse.
  update public.feedback_posts
     set merged_into_id = null,
         analyzed_at = coalesce(analyzed_at, now())
   where id = v_ev.dup_id;

  update public.feedback_posts set merged_into_id = v_ev.dup_id
   where id = any(v_repointed) and merged_into_id = v_ev.canonical_id;

  -- Mémoire anti-récidive : la paire ne sera plus re-mergée ni re-suggérée.
  insert into public.feedback_merge_rejections (dup_id, canonical_id, project_id, kind, rejected_by)
  values (v_ev.dup_id, v_ev.canonical_id, v_ev.project_id, v_ev.kind, p_actor)
  on conflict do nothing;

  update public.feedback_merge_events
     set undone_at = now(), undone_by = p_actor
   where id = p_event;
end;
$$;

revoke all on function public.undo_feedback_merge(uuid, uuid) from public, anon, authenticated;
grant execute on function public.undo_feedback_merge(uuid, uuid) to service_role;

-- ── Suppression des RPC facettes ─────────────────────────────────────────────
drop function if exists public.merge_feedback_facets(uuid, uuid, text, uuid, real);
drop function if exists public.match_feedback_facets(uuid, extensions.vector, uuid, integer);
drop function if exists public.claim_feedback_facets_for_analysis(integer);

-- ── Suppression des tables facettes (enfants d'abord) ────────────────────────
-- feedback_facet_votes_count / feedback_facets_set_updated_at partent avec la
-- table ; on retire ensuite la fonction de comptage devenue orpheline.
drop table if exists public.feedback_facet_votes;
drop table if exists public.feedback_facet_sources;
drop table if exists public.feedback_facets;

drop function if exists public.feedback_facet_votes_maintain_count();
