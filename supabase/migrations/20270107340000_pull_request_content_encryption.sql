BEGIN;

ALTER TABLE public.pull_requests ADD COLUMN content_encryption_checked_at timestamptz;
CREATE INDEX pull_request_content_encryption_queue ON public.pull_requests
  (content_encryption_checked_at NULLS FIRST,id)
  WHERE title IS NOT NULL OR head_branch IS NOT NULL OR base_branch IS NOT NULL;
CREATE TABLE public.pull_request_content_encryption_scope (
  id boolean PRIMARY KEY DEFAULT true CHECK(id),
  activated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.pull_request_content_encryption_scope ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pull_request_content_encryption_scope
  FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.pull_request_content_encryption_scope TO service_role;

CREATE FUNCTION public.guard_pull_request_content()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE field text; old_value text; new_value text;
  active boolean; old_version integer; new_version integer;
BEGIN
  active := EXISTS (SELECT 1 FROM public.pull_request_content_encryption_scope)
    OR NEW.title LIKE 'mdym3:%' OR NEW.head_branch LIKE 'mdym3:%'
    OR NEW.base_branch LIKE 'mdym3:%';
  FOREACH field IN ARRAY ARRAY['title','head_branch','base_branch'] LOOP
    new_value := to_jsonb(NEW)->>field;
    old_value := CASE WHEN TG_OP='UPDATE' THEN to_jsonb(OLD)->>field ELSE NULL END;
    IF new_value LIKE 'mdym3:%' THEN
      IF new_value !~ '^mdym3:[1-9][0-9]*:[A-Za-z0-9_-]+$' THEN
        RAISE EXCEPTION 'pull_request_content_ciphertext_invalid' USING ERRCODE='23514';
      END IF;
      new_version := split_part(new_value,':',2)::integer;
      IF old_value LIKE 'mdym3:%' THEN
        old_version := split_part(old_value,':',2)::integer;
        IF new_version < old_version THEN
          RAISE EXCEPTION 'pull_request_content_key_version_rollback'
            USING ERRCODE='23514';
        END IF;
      END IF;
    ELSIF new_value IS NOT NULL AND active AND
        (TG_OP='INSERT' OR new_value IS DISTINCT FROM old_value) THEN
      RAISE EXCEPTION 'pull_request_content_requires_encryption'
        USING ERRCODE='23514';
    END IF;
  END LOOP;
  IF NEW.title LIKE 'mdym3:%' OR NEW.head_branch LIKE 'mdym3:%'
     OR NEW.base_branch LIKE 'mdym3:%' THEN
    INSERT INTO public.pull_request_content_encryption_scope(id)
      VALUES(true) ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER pull_request_content_guard
  BEFORE INSERT OR UPDATE ON public.pull_requests
  FOR EACH ROW EXECUTE FUNCTION public.guard_pull_request_content();
REVOKE ALL ON FUNCTION public.guard_pull_request_content()
  FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.migrate_pull_request_content(
  p_id uuid,p_old_title text,p_old_head text,p_old_base text,
  p_new_title text DEFAULT NULL,p_new_head text DEFAULT NULL,
  p_new_base text DEFAULT NULL
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE row public.pull_requests;
BEGIN
  SELECT * INTO row FROM public.pull_requests WHERE id=p_id FOR UPDATE;
  IF NOT FOUND OR row.title IS DISTINCT FROM p_old_title OR
      row.head_branch IS DISTINCT FROM p_old_head OR
      row.base_branch IS DISTINCT FROM p_old_base THEN RETURN false; END IF;
  UPDATE public.pull_requests SET
    title=COALESCE(p_new_title,row.title),
    head_branch=COALESCE(p_new_head,row.head_branch),
    base_branch=COALESCE(p_new_base,row.base_branch),
    content_encryption_checked_at=clock_timestamp() WHERE id=p_id;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.migrate_pull_request_content(
  uuid,text,text,text,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.migrate_pull_request_content(
  uuid,text,text,text,text,text,text) TO service_role;

-- The invoker view keeps only agent-owned titles. The authorized application
-- reader resolves an issue or shared PR fallback after project access.
CREATE OR REPLACE VIEW public.numo_conversation_history WITH (security_invoker = true) AS
SELECT i.id, 'assistant'::text AS source, c.id AS legacy_id,
  c.user_id, c.project_id, NULL::uuid AS access_project_id,
  'private'::text AS visibility, c.title, c.status, c.error_message,
  c.archived_at, s.pinned_at, s.last_read_at, c.created_at,
  greatest(c.updated_at, w.updated_at) AS updated_at,
  CASE WHEN p.id IS NOT NULL AND p.deleted_at IS NULL THEN jsonb_build_object('name', p.name) END AS project,
  w.id AS latest_work_id
FROM public.conversations c
JOIN public.numo_conversation_ids i ON i.assistant_id = c.id
LEFT JOIN public.projects p ON p.id = c.project_id
LEFT JOIN public.numo_conversation_state s ON s.conversation_id = i.id AND s.user_id = auth.uid()
LEFT JOIN (
  SELECT DISTINCT ON (conversation_id) conversation_id, id, updated_at
  FROM public.numo_work
  ORDER BY conversation_id, updated_at DESC, id
) w ON w.conversation_id = i.id
UNION ALL
SELECT i.id, 'agent', c.id, c.owner_id, c.project_id, c.project_id,
  c.visibility, COALESCE(c.title, r.title),
  CASE WHEN r.status IN ('queued', 'running') THEN 'generating'
    WHEN r.status = 'failed' THEN 'error' ELSE 'idle' END,
  r.error_message, c.archived_at, pin.created_at, rd.last_read_at, c.created_at,
  greatest(c.updated_at, r.updated_at), jsonb_build_object('name', p.name), r.id
FROM public.agent_conversations c
JOIN public.numo_conversation_ids i ON i.agent_id = c.id
JOIN public.projects p ON p.id = c.project_id AND p.deleted_at IS NULL
LEFT JOIN public.agent_conversation_pins pin ON pin.conversation_id = c.id AND pin.user_id = auth.uid()
LEFT JOIN public.agent_conversation_reads rd ON rd.conversation_id = c.id AND rd.user_id = auth.uid()
LEFT JOIN LATERAL (
  SELECT * FROM public.agent_runs WHERE conversation_id = c.id
  ORDER BY created_at DESC, id DESC LIMIT 1
) r ON true
LEFT JOIN public.issues issue ON issue.id = r.issue_id
LEFT JOIN public.pull_requests pr ON pr.id = r.pull_request_id
WHERE NOT EXISTS (SELECT 1 FROM public.numo_work_origins o WHERE o.agent_id = c.id)
  AND (r.id IS NULL OR r.routine_id IS NULL)
  AND (r.issue_id IS NULL OR issue.id IS NOT NULL)
  AND (r.pull_request_id IS NULL OR pr.id IS NOT NULL);

COMMIT;
