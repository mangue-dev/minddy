-- MIN-591: replace arbitrary merge JSON with relational undo identities.
BEGIN;

CREATE TABLE public.feedback_merge_event_links (
  event_id uuid NOT NULL REFERENCES public.feedback_merge_events(id)
    ON DELETE CASCADE,
  link_kind text NOT NULL CHECK (link_kind IN
    ('moved_vote','dropped_vote','repointed_chain')),
  target_id uuid NOT NULL,
  PRIMARY KEY (event_id,link_kind,target_id)
);
ALTER TABLE public.feedback_merge_event_links ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.feedback_merge_event_links FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.feedback_merge_event_links TO service_role;
ALTER TABLE public.feedback_merge_events
  ALTER COLUMN payload SET DEFAULT '{}'::jsonb,
  ADD COLUMN payload_checked_at timestamptz;
CREATE INDEX feedback_merge_payload_queue ON public.feedback_merge_events
  (payload_checked_at NULLS FIRST,id) WHERE payload <> '{}'::jsonb;

CREATE FUNCTION public.guard_feedback_merge_payload()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NEW.payload <> '{}'::jsonb AND (TG_OP='INSERT' OR
      NEW.payload IS DISTINCT FROM OLD.payload) THEN
    RAISE EXCEPTION 'feedback_merge_payload_requires_relations'
      USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER feedback_merge_payload_guard BEFORE INSERT OR UPDATE
  ON public.feedback_merge_events FOR EACH ROW
  EXECUTE FUNCTION public.guard_feedback_merge_payload();
REVOKE ALL ON FUNCTION public.guard_feedback_merge_payload()
  FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.merge_feedback_posts(p_dup uuid, p_canonical uuid, p_performed_by text, p_actor uuid DEFAULT NULL::uuid, p_confidence real DEFAULT NULL::real)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
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

  select coalesce(merged_into_id, id) into v_target
    from public.feedback_posts where id = p_canonical;
  if v_target is null then raise exception 'feedback_merge_target_not_found'; end if;
  if v_target = p_dup then raise exception 'feedback_merge_self'; end if;

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
  if v_dup.issue_id is not null then raise exception 'feedback_merge_dup_promoted'; end if;

  select coalesce(array_agg(v.user_id), '{}') into v_dropped
    from public.feedback_votes v
   where v.post_id = p_dup
     and exists (
       select 1 from public.feedback_votes c
        where c.post_id = v_target and c.user_id = v.user_id
     );

  delete from public.feedback_votes
   where post_id = p_dup and user_id = any(v_dropped);

  with moved as (
    update public.feedback_votes set post_id = v_target
     where post_id = p_dup
    returning user_id
  )
  select coalesce(array_agg(user_id), '{}') into v_moved from moved;

  with rp as (
    update public.feedback_posts set merged_into_id = v_target
     where merged_into_id = p_dup
    returning id
  )
  select coalesce(array_agg(id), '{}') into v_repointed from rp;

  update public.feedback_posts
     set suggested_merge_into_id = null, suggested_confidence = null
   where suggested_merge_into_id = p_dup;

  update public.feedback_posts
     set merged_into_id = v_target,
         suggested_merge_into_id = null,
         suggested_confidence = null
   where id = p_dup;

  insert into public.feedback_merge_events
    (project_id, kind, dup_id, canonical_id, performed_by, actor_id,
     confidence, payload)
  values
    (v_dup.project_id, 'post', p_dup, v_target, p_performed_by, p_actor,
     p_confidence, '{}'::jsonb)
  returning id into v_event;

  insert into public.feedback_merge_event_links(event_id, link_kind, target_id)
    select v_event, 'moved_vote', item from unnest(v_moved) as item;
  insert into public.feedback_merge_event_links(event_id, link_kind, target_id)
    select v_event, 'dropped_vote', item from unnest(v_dropped) as item;
  insert into public.feedback_merge_event_links(event_id, link_kind, target_id)
    select v_event, 'repointed_chain', item from unnest(v_repointed) as item;

  return v_event;
end;
$function$;

CREATE OR REPLACE FUNCTION public.undo_feedback_merge(p_event uuid, p_actor uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
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
  if v_ev.kind <> 'post' then raise exception 'feedback_undo_unsupported_kind'; end if;

  if v_ev.payload = '{}'::jsonb then
    v_moved := array(select target_id from public.feedback_merge_event_links
      where event_id = p_event and link_kind = 'moved_vote');
    v_dropped := array(select target_id from public.feedback_merge_event_links
      where event_id = p_event and link_kind = 'dropped_vote');
    v_repointed := array(select target_id from public.feedback_merge_event_links
      where event_id = p_event and link_kind = 'repointed_chain');
  else
    v_moved := array(select jsonb_array_elements_text(
      v_ev.payload->'moved_vote_user_ids'))::uuid[];
    v_dropped := array(select jsonb_array_elements_text(
      v_ev.payload->'dropped_vote_user_ids'))::uuid[];
    v_repointed := array(select jsonb_array_elements_text(
      v_ev.payload->'repointed_chain_ids'))::uuid[];
  end if;

  if v_ev.dup_id < v_ev.canonical_id then
    perform 1 from public.feedback_posts where id = v_ev.dup_id for update;
    perform 1 from public.feedback_posts where id = v_ev.canonical_id for update;
  else
    perform 1 from public.feedback_posts where id = v_ev.canonical_id for update;
    perform 1 from public.feedback_posts where id = v_ev.dup_id for update;
  end if;

  select merged_into_id into v_state from public.feedback_posts where id = v_ev.dup_id;
  if v_state is distinct from v_ev.canonical_id then
    raise exception 'feedback_undo_stale';
  end if;

  update public.feedback_votes set post_id = v_ev.dup_id
   where post_id = v_ev.canonical_id and user_id = any(v_moved);

  insert into public.feedback_votes (post_id, user_id)
  select v_ev.dup_id, u from unnest(v_dropped) as u
  on conflict do nothing;

  update public.feedback_posts
     set merged_into_id = null,
         analyzed_at = coalesce(analyzed_at, now())
   where id = v_ev.dup_id;

  update public.feedback_posts set merged_into_id = v_ev.dup_id
   where id = any(v_repointed) and merged_into_id = v_ev.canonical_id;

  insert into public.feedback_merge_rejections (dup_id, canonical_id, project_id, kind, rejected_by)
  values (v_ev.dup_id, v_ev.canonical_id, v_ev.project_id, v_ev.kind, p_actor)
  on conflict do nothing;

  update public.feedback_merge_events
     set undone_at = now(), undone_by = p_actor
   where id = p_event;
end;
$function$;

CREATE FUNCTION public.migrate_feedback_merge_payload(
  p_event uuid,p_old jsonb
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE current_row public.feedback_merge_events%ROWTYPE;
BEGIN
  SELECT * INTO current_row FROM public.feedback_merge_events
    WHERE id=p_event FOR UPDATE;
  IF NOT FOUND OR current_row.payload IS DISTINCT FROM p_old THEN
    RETURN false;
  END IF;
  IF p_old='{}'::jsonb THEN
    UPDATE public.feedback_merge_events SET payload_checked_at=clock_timestamp()
      WHERE id=p_event;
    RETURN true;
  END IF;
  IF jsonb_typeof(coalesce(p_old->'moved_vote_user_ids','[]'::jsonb))<>'array'
    OR jsonb_typeof(coalesce(p_old->'dropped_vote_user_ids','[]'::jsonb))<>'array'
    OR jsonb_typeof(coalesce(p_old->'repointed_chain_ids','[]'::jsonb))<>'array' THEN
    RAISE EXCEPTION 'feedback_merge_legacy_payload_invalid'
      USING ERRCODE='22023';
  END IF;
  INSERT INTO public.feedback_merge_event_links(event_id,link_kind,target_id)
    SELECT p_event,'moved_vote',value::uuid FROM
      jsonb_array_elements_text(coalesce(p_old->'moved_vote_user_ids','[]'::jsonb)) AS value
    ON CONFLICT DO NOTHING;
  INSERT INTO public.feedback_merge_event_links(event_id,link_kind,target_id)
    SELECT p_event,'dropped_vote',value::uuid FROM
      jsonb_array_elements_text(coalesce(p_old->'dropped_vote_user_ids','[]'::jsonb)) AS value
    ON CONFLICT DO NOTHING;
  INSERT INTO public.feedback_merge_event_links(event_id,link_kind,target_id)
    SELECT p_event,'repointed_chain',value::uuid FROM
      jsonb_array_elements_text(coalesce(p_old->'repointed_chain_ids','[]'::jsonb)) AS value
    ON CONFLICT DO NOTHING;
  UPDATE public.feedback_merge_events SET payload='{}'::jsonb,
    payload_checked_at=clock_timestamp() WHERE id=p_event;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.migrate_feedback_merge_payload(uuid,jsonb)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.migrate_feedback_merge_payload(uuid,jsonb)
  TO service_role;

CREATE FUNCTION public.mark_feedback_merge_payload_attempt(
  p_event uuid,p_old jsonb
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE current_row public.feedback_merge_events%ROWTYPE;
BEGIN
  SELECT * INTO current_row FROM public.feedback_merge_events
    WHERE id=p_event FOR UPDATE;
  IF NOT FOUND OR current_row.payload IS DISTINCT FROM p_old THEN
    RETURN false;
  END IF;
  UPDATE public.feedback_merge_events SET payload_checked_at=clock_timestamp()
    WHERE id=p_event;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.mark_feedback_merge_payload_attempt(uuid,jsonb)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.mark_feedback_merge_payload_attempt(uuid,jsonb)
  TO service_role;

COMMIT;
