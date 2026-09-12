BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(1);

-- These assertions also run on plain PostgreSQL without a pgTAP extension.
CREATE FUNCTION pg_temp.assert_numo(condition boolean, label text) RETURNS void
LANGUAGE plpgsql AS $$ BEGIN
  IF condition IS DISTINCT FROM true THEN RAISE EXCEPTION 'Numo: %', label; END IF;
END $$;
-- Model the server passing the authenticated actor; the production RPC itself
-- cannot be called by browser roles and never trusts a client-supplied actor.
CREATE FUNCTION pg_temp.update_numo_as_actor(p_id uuid, p_patch jsonb) RETURNS void
LANGUAGE sql SECURITY DEFINER AS $$
 SELECT public.update_numo_conversation(p_id, auth.uid(), p_patch);
$$;
INSERT INTO auth.users (id, email) VALUES
 ('51400000-0000-4000-8000-000000000001', 'numo-owner@example.test'),
 ('51400000-0000-4000-8000-000000000002', 'numo-member@example.test'),
 ('51400000-0000-4000-8000-000000000003', 'numo-outsider@example.test');
INSERT INTO public.projects (id, owner_id, name, key) VALUES
 ('51400000-0000-4000-8000-000000000010', '51400000-0000-4000-8000-000000000001', 'Numo fixtures', 'NUFX'),
 ('51400000-0000-4000-8000-000000000011', '51400000-0000-4000-8000-000000000003', 'Other project', 'NUOT'),
 ('51400000-0000-4000-8000-000000000012', '51400000-0000-4000-8000-000000000001', 'Deleted project', 'NUDE');
UPDATE public.projects SET deleted_at = now() WHERE id = '51400000-0000-4000-8000-000000000012';
INSERT INTO public.project_members (project_id, user_id) VALUES
 ('51400000-0000-4000-8000-000000000010', '51400000-0000-4000-8000-000000000002');

-- Simulate rows that existed before the incremental migration.
ALTER TABLE public.conversations DISABLE TRIGGER register_numo_identity;
ALTER TABLE public.agent_conversations DISABLE TRIGGER register_numo_identity;
INSERT INTO public.conversations (id, user_id, project_id, title) VALUES
 ('51400000-0000-4000-8000-000000000020', '51400000-0000-4000-8000-000000000001', '51400000-0000-4000-8000-000000000010', 'Private chat'),
 ('51400000-0000-4000-8000-000000000027', '51400000-0000-4000-8000-000000000001', NULL, 'No project');
INSERT INTO public.agent_conversations (id, owner_id, project_id, visibility, title) VALUES
 ('51400000-0000-4000-8000-000000000020', '51400000-0000-4000-8000-000000000001', '51400000-0000-4000-8000-000000000010', 'private', 'Two runs'),
 ('51400000-0000-4000-8000-000000000021', '51400000-0000-4000-8000-000000000001', '51400000-0000-4000-8000-000000000010', 'project', 'Linked work'),
 ('51400000-0000-4000-8000-000000000022', '51400000-0000-4000-8000-000000000001', '51400000-0000-4000-8000-000000000010', 'project', 'Shared work'),
 ('51400000-0000-4000-8000-000000000023', '51400000-0000-4000-8000-000000000003', '51400000-0000-4000-8000-000000000011', 'private', 'Other project'),
 ('51400000-0000-4000-8000-000000000024', NULL, '51400000-0000-4000-8000-000000000010', 'private', 'Deleted owner'),
 ('51400000-0000-4000-8000-000000000026', '51400000-0000-4000-8000-000000000001', '51400000-0000-4000-8000-000000000012', 'project', 'Deleted project');
ALTER TABLE public.conversations ENABLE TRIGGER register_numo_identity;
ALTER TABLE public.agent_conversations ENABLE TRIGGER register_numo_identity;
SELECT public.backfill_numo_conversations();
CREATE TEMP TABLE original_numo_ids AS SELECT * FROM public.numo_conversation_ids;
SELECT public.backfill_numo_conversations();
SELECT public.backfill_numo_conversations();
SELECT pg_temp.assert_numo(NOT EXISTS (
 (SELECT * FROM original_numo_ids EXCEPT SELECT * FROM public.numo_conversation_ids)
 UNION ALL (SELECT * FROM public.numo_conversation_ids EXCEPT SELECT * FROM original_numo_ids)
), 'restart preserves all mappings');
SELECT pg_temp.assert_numo((SELECT count(*) = 2 FROM public.numo_conversation_ids
 WHERE assistant_id = '51400000-0000-4000-8000-000000000020' OR agent_id = '51400000-0000-4000-8000-000000000020'), 'colliding source UUIDs remain distinct');

INSERT INTO public.agent_runs (id, conversation_id, project_id, created_by, status, created_at, pr_number, pr_url) VALUES
 ('51400000-0000-4000-8000-000000000030', '51400000-0000-4000-8000-000000000020', '51400000-0000-4000-8000-000000000010', '51400000-0000-4000-8000-000000000001', 'completed', '2026-09-01', 42, 'https://example.test/pull/42'),
 ('51400000-0000-4000-8000-000000000031', '51400000-0000-4000-8000-000000000020', '51400000-0000-4000-8000-000000000010', '51400000-0000-4000-8000-000000000001', 'completed', '2026-09-01', NULL, NULL),
 ('51400000-0000-4000-8000-000000000032', '51400000-0000-4000-8000-000000000021', '51400000-0000-4000-8000-000000000010', '51400000-0000-4000-8000-000000000001', 'completed', '2026-09-01', NULL, NULL);
INSERT INTO public.assistant_messages (id, conversation_id, role, content, tool_name, tool_call_id, metadata) VALUES
 ('51400000-0000-4000-8000-000000000040', '51400000-0000-4000-8000-000000000020', 'tool', '{"launched":true,"run_id":"51400000-0000-4000-8000-000000000032"}', 'launch_code_agent', 'call-original', '{"success":true}'),
 ('51400000-0000-4000-8000-000000000044', '51400000-0000-4000-8000-000000000020', 'user', 'Private attachment', NULL, NULL, '{"attachments":[{"storage_path":"chat/owner/original.pdf","file_name":"original.pdf"}]}'),
 ('51400000-0000-4000-8000-000000000045', '51400000-0000-4000-8000-000000000020', 'tool', 'invalid historical JSON', 'launch_code_agent', 'call-invalid', '{"success":true}');
INSERT INTO public.agent_messages (id, conversation_id, run_id, role, content, source) VALUES
 ('51400000-0000-4000-8000-000000000041', '51400000-0000-4000-8000-000000000020', '51400000-0000-4000-8000-000000000030', 'assistant', 'Original worker summary', 'assistant_summary'),
 ('51400000-0000-4000-8000-000000000043', '51400000-0000-4000-8000-000000000021', '51400000-0000-4000-8000-000000000032', 'assistant', 'Linked worker summary', 'assistant_summary');
INSERT INTO public.agent_artifacts (id, conversation_id, run_id, kind, ref, url, state) VALUES
 ('51400000-0000-4000-8000-000000000050', '51400000-0000-4000-8000-000000000020', '51400000-0000-4000-8000-000000000030', 'branch', 'legacy-preserved-branch', 'https://example.test/tree/legacy-preserved-branch', 'open');
INSERT INTO public.agent_run_journal (id, run_id, session_id, events) VALUES
 (514000001, '51400000-0000-4000-8000-000000000030', 'original-session', '[{"type":"tool_call","text":"Original worker output"}]');
CREATE TEMP TABLE original_numo_journal AS SELECT * FROM public.agent_run_journal WHERE id = 514000001;
SELECT public.backfill_numo_conversations();
SELECT pg_temp.assert_numo(NOT EXISTS (
 (SELECT * FROM original_numo_journal EXCEPT SELECT * FROM public.agent_run_journal WHERE id = 514000001)
), 'backfill preserves the original run journal');
UPDATE public.agent_conversations SET archived_at = '2026-09-02' WHERE id = '51400000-0000-4000-8000-000000000022';
INSERT INTO public.agent_conversation_pins (user_id, conversation_id, created_at) VALUES
 ('51400000-0000-4000-8000-000000000002', '51400000-0000-4000-8000-000000000022', '2026-09-03');
INSERT INTO public.agent_conversation_reads (user_id, conversation_id, last_read_at) VALUES
 ('51400000-0000-4000-8000-000000000002', '51400000-0000-4000-8000-000000000022', '2026-09-04');
INSERT INTO public.agent_conversation_contexts (conversation_id, kind, resource_id, snapshot) VALUES
 ('51400000-0000-4000-8000-000000000023', 'issue', '51400000-0000-4000-8000-000000000099', '{"title":"Other project context"}');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '51400000-0000-4000-8000-000000000001', true);
SELECT pg_temp.assert_numo((SELECT count(*) = 4 FROM public.numo_conversation_history), 'owner sees each chat and standalone history once');
SELECT pg_temp.assert_numo((SELECT count(*) = 2 FROM public.numo_work WHERE legacy_conversation_id = '51400000-0000-4000-8000-000000000020'), 'multiple runs remain work references');
SELECT pg_temp.assert_numo((SELECT conversation_id = '51400000-0000-4000-8000-000000000020' FROM public.numo_work WHERE id = '51400000-0000-4000-8000-000000000032'), 'launch resolves to the parent chat');
SELECT pg_temp.assert_numo((SELECT ref = 'legacy-preserved-branch' AND run_id = '51400000-0000-4000-8000-000000000030' FROM public.numo_artifacts WHERE id = '51400000-0000-4000-8000-000000000050'), 'artifact identity and work links are preserved');
SELECT pg_temp.assert_numo((SELECT latest_work_id = '51400000-0000-4000-8000-000000000031' FROM public.numo_conversation_history WHERE source = 'agent' AND legacy_id = '51400000-0000-4000-8000-000000000020'), 'equal run timestamps use a deterministic ID tie-breaker');
SELECT pg_temp.assert_numo((SELECT pr_number = 42 AND pr_url = 'https://example.test/pull/42' FROM public.numo_work WHERE id = '51400000-0000-4000-8000-000000000030'), 'PR identity is unchanged');
SELECT pg_temp.assert_numo((SELECT metadata#>>'{attachments,0,storage_path}' = 'chat/owner/original.pdf' FROM public.numo_messages WHERE id = '51400000-0000-4000-8000-000000000044'), 'attachment metadata is preserved');
SELECT pg_temp.assert_numo((SELECT kind = 'worker_message' AND worker_source = 'assistant_summary' AND content = 'Linked worker summary' FROM public.numo_messages WHERE id = '51400000-0000-4000-8000-000000000043'), 'worker summaries retain provenance');
SELECT pg_temp.assert_numo((SELECT tool_call_id = 'call-original' FROM public.numo_actions WHERE id = '51400000-0000-4000-8000-000000000040'), 'action identity is unchanged');
SELECT pg_temp.assert_numo((SELECT count(*) = 0 FROM public.numo_contexts), 'other project contexts stay inaccessible');
SELECT pg_temp.assert_numo((SELECT project_id IS NULL AND access_project_id IS NULL FROM public.numo_conversation_history WHERE id = '51400000-0000-4000-8000-000000000027'), 'projectless chat has no access scope');
SELECT pg_temp.update_numo_as_actor('51400000-0000-4000-8000-000000000027', '{"title":"Renamed","pinned":true,"archived":true,"read":true}');
SELECT pg_temp.assert_numo((SELECT title = 'Renamed' AND pinned_at IS NOT NULL AND archived_at IS NOT NULL AND last_read_at IS NOT NULL FROM public.numo_conversation_history WHERE id = '51400000-0000-4000-8000-000000000027'), 'common state writes persist');
INSERT INTO public.assistant_active_conversation (user_id, conversation_id)
 SELECT auth.uid(), id FROM public.numo_conversation_history WHERE source = 'agent' AND legacy_id = '51400000-0000-4000-8000-000000000020';
SELECT pg_temp.assert_numo((SELECT count(*) = 1 FROM public.assistant_active_conversation WHERE user_id = auth.uid()), 'active pointer accepts a common worker identity');
SELECT pg_temp.assert_numo(NOT has_function_privilege('authenticated', 'public.update_numo_conversation(uuid,uuid,jsonb)', 'EXECUTE'), 'state mutation requires the authenticated server route');
SELECT pg_temp.assert_numo(NOT has_table_privilege('authenticated', 'public.numo_conversation_ids', 'INSERT'), 'callers cannot forge mappings');
SELECT pg_temp.assert_numo(NOT has_function_privilege('authenticated', 'public.backfill_numo_conversations()', 'EXECUTE'), 'backfill is server-only');

SELECT set_config('request.jwt.claim.sub', '51400000-0000-4000-8000-000000000002', true);
SELECT pg_temp.assert_numo((SELECT count(*) = 2 FROM public.numo_conversation_history), 'member retains shared work without private chat');
SELECT pg_temp.assert_numo((SELECT count(*) = 0 FROM public.numo_work_origins), 'parent identity is private');
SELECT pg_temp.assert_numo((SELECT count(*) = 0 FROM public.numo_messages WHERE source = 'assistant'), 'private messages and attachments are invisible');
SELECT pg_temp.assert_numo((SELECT conversation_id <> '51400000-0000-4000-8000-000000000020' FROM public.numo_work WHERE id = '51400000-0000-4000-8000-000000000032'), 'shared run resolves without disclosing the parent');
SELECT pg_temp.assert_numo((SELECT archived_at = '2026-09-02' AND pinned_at = '2026-09-03' AND last_read_at = '2026-09-04' FROM public.numo_conversation_history WHERE legacy_id = '51400000-0000-4000-8000-000000000022'), 'legacy archive pin and read state survive');
UPDATE public.agent_conversation_reads SET last_read_at = '2099-01-01' WHERE user_id = auth.uid() AND conversation_id = '51400000-0000-4000-8000-000000000022';
SELECT pg_temp.update_numo_as_actor((SELECT id FROM public.numo_conversation_history WHERE legacy_id = '51400000-0000-4000-8000-000000000022'), '{"pinned":false,"read":true,"archived":false}');
SELECT pg_temp.assert_numo((SELECT last_read_at = '2099-01-01' FROM public.agent_conversation_reads WHERE user_id = auth.uid() AND conversation_id = '51400000-0000-4000-8000-000000000022'), 'read cursors never move backward');
SELECT pg_temp.assert_numo((SELECT count(*) = 0 FROM public.agent_conversation_pins WHERE user_id = auth.uid()), 'common unpin updates the legacy source');
DO $$ BEGIN
  BEGIN
    PERFORM pg_temp.update_numo_as_actor('51400000-0000-4000-8000-000000000020', '{"title":"Forbidden"}');
    RAISE EXCEPTION 'Unauthorized chat update succeeded';
  EXCEPTION WHEN no_data_found THEN NULL; END;
  BEGIN
    INSERT INTO public.assistant_active_conversation (user_id, conversation_id) VALUES (auth.uid(), '51400000-0000-4000-8000-000000000020');
    RAISE EXCEPTION 'Unauthorized pointer succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;

SELECT set_config('request.jwt.claim.sub', '51400000-0000-4000-8000-000000000003', true);
SELECT pg_temp.assert_numo((SELECT count(*) = 1 FROM public.numo_conversation_history), 'outsider sees only their own project');
SELECT pg_temp.assert_numo((SELECT count(*) = 0 FROM public.numo_work), 'cross-project runs remain inaccessible');
RESET ROLE;
DELETE FROM public.project_members WHERE project_id = '51400000-0000-4000-8000-000000000010' AND user_id = '51400000-0000-4000-8000-000000000002';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '51400000-0000-4000-8000-000000000002', true);
SELECT pg_temp.assert_numo((SELECT count(*) = 0 FROM public.numo_conversation_history), 'membership revocation applies immediately');
RESET ROLE;
DELETE FROM public.agent_conversations WHERE id = '51400000-0000-4000-8000-000000000020';
SELECT pg_temp.assert_numo((SELECT count(*) = 0 FROM public.assistant_active_conversation WHERE user_id = '51400000-0000-4000-8000-000000000001'), 'source deletion clears the pointer');
SELECT pg_temp.assert_numo((SELECT count(*) = 1 FROM public.numo_conversation_ids WHERE assistant_id = '51400000-0000-4000-8000-000000000020'), 'deleting a colliding agent ID preserves the chat');
SELECT pass('Numo migration, provenance, state, and access fixtures pass');
SELECT * FROM finish();
ROLLBACK;
