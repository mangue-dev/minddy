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
 ('51400000-0000-4000-8000-000000000011', '51400000-0000-4000-8000-000000000003', 'Other project', 'NUOT');
INSERT INTO public.project_members (project_id, user_id) VALUES
 ('51400000-0000-4000-8000-000000000010', '51400000-0000-4000-8000-000000000002');

INSERT INTO public.conversations (id, user_id, project_id, title) VALUES
 ('51400000-0000-4000-8000-000000000020', '51400000-0000-4000-8000-000000000001', '51400000-0000-4000-8000-000000000010', 'Private chat'),
 ('51400000-0000-4000-8000-000000000023', '51400000-0000-4000-8000-000000000003', '51400000-0000-4000-8000-000000000011', 'Other project'),
 ('51400000-0000-4000-8000-000000000027', '51400000-0000-4000-8000-000000000001', NULL, 'No project'),
 ('51400000-0000-4000-8000-000000000028', '51400000-0000-4000-8000-000000000001', NULL, 'Routine conversation');
SELECT pg_temp.assert_numo((SELECT count(*) = 4 FROM public.numo_conversation_ids), 'each conversation registers one durable identity');
SELECT pg_temp.assert_numo(NOT EXISTS (SELECT 1 FROM public.numo_conversation_ids WHERE id <> assistant_id), 'assistant identities keep their source UUID');

-- Exercise a current Numo turn. Repeating the browser request and event
-- simulates refresh/retry without duplicating work.
INSERT INTO public.conversations (id, user_id, project_id, title) VALUES
 ('51400000-0000-4000-8000-000000000029', '51400000-0000-4000-8000-000000000001', '51400000-0000-4000-8000-000000000010', 'Unified lifecycle');
SELECT count(*) FROM public.begin_numo_turn(
  '51400000-0000-4000-8000-000000000029',
  '51400000-0000-4000-8000-000000000001',
  '51400000-0000-4000-8000-000000000063',
  '51400000-0000-4000-8000-000000000064',
  '{"source":"fab","action":"discuss"}',
  'openai/gpt-5.6', 'high', '51400000-0000-4000-8000-000000000067', 0,
  'Continue from the FAB',
  '{"projectId":"51400000-0000-4000-8000-000000000010"}', '{}'
);
SELECT count(*) FROM public.begin_numo_turn(
  '51400000-0000-4000-8000-000000000029',
  '51400000-0000-4000-8000-000000000001',
  '51400000-0000-4000-8000-000000000063',
  '51400000-0000-4000-8000-000000000064',
  '{"source":"fab","action":"discuss"}',
  'openai/gpt-5.6', 'high', '51400000-0000-4000-8000-000000000067', 0,
  'Continue from the FAB',
  '{"projectId":"51400000-0000-4000-8000-000000000010"}', '{}'
);
SELECT count(*) FROM public.claim_numo_turn(
  (SELECT id FROM public.numo_assistant_turns WHERE conversation_id = '51400000-0000-4000-8000-000000000029'),
  '51400000-0000-4000-8000-000000000065', false
);
SELECT public.append_numo_turn_event(
  (SELECT id FROM public.numo_assistant_turns WHERE conversation_id = '51400000-0000-4000-8000-000000000029'),
  '51400000-0000-4000-8000-000000000066', 'content_delta', '{"delta":"Accepted"}'
);
SELECT public.append_numo_turn_event(
  (SELECT id FROM public.numo_assistant_turns WHERE conversation_id = '51400000-0000-4000-8000-000000000029'),
  '51400000-0000-4000-8000-000000000066', 'content_delta', '{"delta":"Accepted"}'
);
INSERT INTO public.assistant_messages (conversation_id, turn_id, role, content, metadata)
SELECT '51400000-0000-4000-8000-000000000029', id, 'assistant', 'Accepted', '{}'
FROM public.numo_assistant_turns
WHERE conversation_id = '51400000-0000-4000-8000-000000000029';
SELECT count(*) FROM public.checkpoint_numo_turn(
  (SELECT id FROM public.numo_assistant_turns WHERE conversation_id = '51400000-0000-4000-8000-000000000029'),
  '51400000-0000-4000-8000-000000000065', 'completed', '{}', NULL,
  'Accepted', 0.01
);
SELECT pg_temp.assert_numo((SELECT count(*) = 5 FROM public.numo_conversation_ids), 'current inserts produce five stable mappings');
SELECT pg_temp.assert_numo((SELECT count(*) = 1 FROM public.numo_assistant_turns WHERE conversation_id = '51400000-0000-4000-8000-000000000029'), 'duplicate request keeps one durable turn');
SELECT pg_temp.assert_numo((SELECT count(*) = 1 FROM public.numo_turn_events WHERE turn_id = (SELECT id FROM public.numo_assistant_turns WHERE conversation_id = '51400000-0000-4000-8000-000000000029')), 'duplicate event keeps one replay record');
SELECT pg_temp.assert_numo((SELECT status = 'idle' FROM public.conversations WHERE id = '51400000-0000-4000-8000-000000000029'), 'completed durable turn returns the conversation to idle');

INSERT INTO public.assistant_messages (id, conversation_id, role, content, tool_name, tool_call_id, metadata) VALUES
 ('51400000-0000-4000-8000-000000000040', '51400000-0000-4000-8000-000000000020', 'tool', '{"issues":[]}', 'search_issues', 'call-original', '{"success":true}'),
 ('51400000-0000-4000-8000-000000000044', '51400000-0000-4000-8000-000000000020', 'user', 'Private attachment', NULL, NULL, '{"attachments":[{"storage_path":"chat/owner/original.pdf","file_name":"original.pdf"}]}'),
 ('51400000-0000-4000-8000-000000000046', '51400000-0000-4000-8000-000000000028', 'user', 'Follow-up on a routine run', NULL, NULL, '{}');
INSERT INTO public.agent_routines (
  id, project_id, owner_id, title, prompt, frequency
) VALUES (
  '51400000-0000-4000-8000-000000000060',
  '51400000-0000-4000-8000-000000000010',
  '51400000-0000-4000-8000-000000000001',
  'Daily review', 'Review the repository', 'daily'
);
INSERT INTO public.numo_routine_occurrences (
  id, routine_id, origin, conversation_id, request_id
) VALUES (
  '51400000-0000-4000-8000-000000000061',
  '51400000-0000-4000-8000-000000000060', 'manual',
  '51400000-0000-4000-8000-000000000028',
  '51400000-0000-4000-8000-000000000062'
);
SELECT pg_temp.assert_numo(
  to_regclass('public.numo_routine_occurrences_conversation_id_idx') IS NOT NULL,
  'routine conversation lookup has an index'
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '51400000-0000-4000-8000-000000000001', true);
SELECT pg_temp.assert_numo((SELECT count(*) = 3 FROM public.numo_user_conversation_history), 'owner sees each user-initiated chat once');
SELECT pg_temp.assert_numo((SELECT count(*) = 1 FROM public.numo_conversation_history WHERE legacy_id = '51400000-0000-4000-8000-000000000028'), 'routine conversation remains addressable by durable identity');
SELECT pg_temp.assert_numo((SELECT count(*) = 0 FROM public.numo_user_conversation_history WHERE legacy_id = '51400000-0000-4000-8000-000000000028'), 'routine conversation stays out of user history after a follow-up message');
SELECT pg_temp.assert_numo(public.is_numo_routine_conversation('51400000-0000-4000-8000-000000000028'), 'owner can identify their own routine conversation');
SELECT pg_temp.assert_numo((SELECT content = 'Follow-up on a routine run' FROM public.numo_messages WHERE id = '51400000-0000-4000-8000-000000000046'), 'routine follow-up remains in the routine conversation timeline');
SELECT pg_temp.assert_numo((SELECT metadata#>>'{attachments,0,storage_path}' = 'chat/owner/original.pdf' FROM public.numo_messages WHERE id = '51400000-0000-4000-8000-000000000044'), 'attachment metadata is preserved');
SELECT pg_temp.assert_numo((SELECT tool_call_id = 'call-original' FROM public.numo_actions WHERE id = '51400000-0000-4000-8000-000000000040'), 'action identity is unchanged');
SELECT pg_temp.assert_numo((SELECT count(*) = 1 FROM public.numo_turns WHERE conversation_id = '51400000-0000-4000-8000-000000000029'), 'the durable turn is visible to its owner');
SELECT pg_temp.assert_numo((SELECT project_id IS NULL AND project IS NULL FROM public.numo_conversation_history WHERE id = '51400000-0000-4000-8000-000000000027'), 'projectless chat has no project scope');
SELECT pg_temp.update_numo_as_actor('51400000-0000-4000-8000-000000000027', '{"title":"Renamed","pinned":true,"archived":true,"read":true}');
SELECT pg_temp.assert_numo((SELECT title = 'Renamed' AND pinned_at IS NOT NULL AND archived_at IS NOT NULL AND last_read_at IS NOT NULL FROM public.numo_conversation_history WHERE id = '51400000-0000-4000-8000-000000000027'), 'common state writes persist');
SELECT pg_temp.update_numo_as_actor('51400000-0000-4000-8000-000000000027', '{"model":"openai/gpt-5.6","reasoningLevel":"high"}');
SELECT pg_temp.assert_numo((SELECT model = 'openai/gpt-5.6' AND reasoning_level = 'high' FROM public.conversations WHERE id = '51400000-0000-4000-8000-000000000027'), 'conversation model and reasoning choices persist');
INSERT INTO public.assistant_active_conversation (user_id, conversation_id)
 SELECT auth.uid(), id FROM public.numo_conversation_history WHERE legacy_id = '51400000-0000-4000-8000-000000000020';
SELECT pg_temp.assert_numo((SELECT count(*) = 1 FROM public.assistant_active_conversation WHERE user_id = auth.uid()), 'active pointer accepts an accessible conversation identity');
SELECT pg_temp.assert_numo(NOT has_function_privilege('authenticated', 'public.update_numo_conversation(uuid,uuid,jsonb)', 'EXECUTE'), 'state mutation requires the authenticated server route');
SELECT pg_temp.assert_numo(NOT has_table_privilege('authenticated', 'public.numo_conversation_ids', 'INSERT'), 'callers cannot forge mappings');

SELECT set_config('request.jwt.claim.sub', '51400000-0000-4000-8000-000000000002', true);
SELECT pg_temp.assert_numo((SELECT count(*) = 0 FROM public.numo_conversation_history), 'a project member cannot see the owner''s private chats');
SELECT pg_temp.assert_numo((SELECT count(*) = 0 FROM public.numo_messages), 'private messages and attachments are invisible');
SELECT pg_temp.assert_numo((SELECT count(*) = 0 FROM public.numo_turns), 'private turns are invisible');
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
SELECT pg_temp.assert_numo((SELECT count(*) = 1 FROM public.numo_conversation_history), 'outsider sees only their own conversation');
SELECT pg_temp.assert_numo(NOT public.is_numo_routine_conversation('51400000-0000-4000-8000-000000000028'), 'routine predicate does not disclose another user''s conversation');
RESET ROLE;
DELETE FROM public.conversations WHERE id = '51400000-0000-4000-8000-000000000020';
SELECT pg_temp.assert_numo((SELECT count(*) = 0 FROM public.assistant_active_conversation WHERE user_id = '51400000-0000-4000-8000-000000000001'), 'source deletion clears the pointer');
SELECT pg_temp.assert_numo((SELECT count(*) = 0 FROM public.numo_conversation_ids WHERE assistant_id = '51400000-0000-4000-8000-000000000020'), 'source deletion removes its durable identity');
SELECT pass('Numo identity, state, and access fixtures pass');
SELECT * FROM finish();
ROLLBACK;
