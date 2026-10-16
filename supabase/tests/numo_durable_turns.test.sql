BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(1);

CREATE FUNCTION pg_temp.assert_numo_turn(condition boolean, label text) RETURNS void
LANGUAGE plpgsql AS $$ BEGIN
  IF condition IS DISTINCT FROM true THEN RAISE EXCEPTION 'Durable Numo turn: %', label; END IF;
END $$;

INSERT INTO auth.users (id, email) VALUES
  ('51600000-0000-4000-8000-000000000001', 'numo-turn@example.test');
INSERT INTO public.projects (id, owner_id, name, key) VALUES
  ('51600000-0000-4000-8000-000000000010', '51600000-0000-4000-8000-000000000001', 'Durable turns', 'DURN');
INSERT INTO public.conversations (id, user_id, title) VALUES
  ('51600000-0000-4000-8000-000000000020', '51600000-0000-4000-8000-000000000001', 'Idempotent request'),
  ('51600000-0000-4000-8000-000000000021', '51600000-0000-4000-8000-000000000001', 'Ambiguous mutation'),
  ('51600000-0000-4000-8000-000000000022', '51600000-0000-4000-8000-000000000001', 'Stop recovery'),
  ('51600000-0000-4000-8000-000000000024', '51600000-0000-4000-8000-000000000001', 'Stop tool race'),
  ('51600000-0000-4000-8000-000000000025', '51600000-0000-4000-8000-000000000001', 'Atomic tool round');
SELECT public.begin_numo_turn(
  '51600000-0000-4000-8000-000000000020',
  '51600000-0000-4000-8000-000000000001',
  '51600000-0000-4000-8000-000000000040',
  '51600000-0000-4000-8000-000000000041',
  '{"projectId":null,"locale":"en","timezone":"UTC","numoDefaultStatus":"triage","webSearchEnabled":false}',
  'model', 'medium', '51600000-0000-4000-8000-000000000201', 0, 'Answer this question', NULL, '{}'
);
-- Repeating the HTTP request returns the same turn and does not duplicate its message.
SELECT public.begin_numo_turn(
  '51600000-0000-4000-8000-000000000020',
  '51600000-0000-4000-8000-000000000001',
  '51600000-0000-4000-8000-000000000040',
  '51600000-0000-4000-8000-000000000099',
  '{}', 'other-model', 'low', '51600000-0000-4000-8000-000000000101', 0,
  'Duplicate', NULL, '{}'
);
SELECT pg_temp.assert_numo_turn((
  SELECT count(*) = 1 FROM public.assistant_messages
  WHERE conversation_id = '51600000-0000-4000-8000-000000000020' AND role = 'user'
), 'request id is idempotent');

SELECT public.claim_numo_turn(
  (SELECT id FROM public.numo_assistant_turns WHERE conversation_id = '51600000-0000-4000-8000-000000000020'),
  '51600000-0000-4000-8000-000000000042', false
);
SELECT public.append_numo_turn_event(
  (SELECT id FROM public.numo_assistant_turns WHERE conversation_id = '51600000-0000-4000-8000-000000000020'),
  '51600000-0000-4000-8000-000000000043', 'state', '{"status":"running"}'
);
SELECT public.append_numo_turn_event(
  (SELECT id FROM public.numo_assistant_turns WHERE conversation_id = '51600000-0000-4000-8000-000000000020'),
  '51600000-0000-4000-8000-000000000043', 'state', '{"status":"running"}'
);
SELECT pg_temp.assert_numo_turn((
  SELECT count(*) = 1 FROM public.numo_turn_events
  WHERE id = '51600000-0000-4000-8000-000000000043'
), 'activity event id is idempotent');

SELECT public.append_numo_turn_event(
  (SELECT id FROM public.numo_assistant_turns WHERE conversation_id = '51600000-0000-4000-8000-000000000020'),
  '51600000-0000-4000-8000-000000000047', 'reasoning_delta', '{"text":"Trace so far"}'
);
SELECT pg_temp.assert_numo_turn((
  SELECT count(*) = 1 FROM public.numo_turn_events
  WHERE id = '51600000-0000-4000-8000-000000000047' AND type = 'reasoning_delta'
), 'reasoning snapshot passes the activity type check');

UPDATE public.numo_assistant_turns
SET claimed_at = now() - interval '7 minutes'
WHERE conversation_id = '51600000-0000-4000-8000-000000000020';
SELECT public.recover_stale_numo_turns();
SELECT pg_temp.assert_numo_turn((
  SELECT status = 'retryable' FROM public.numo_assistant_turns
  WHERE conversation_id = '51600000-0000-4000-8000-000000000020'
), 'a stale running turn becomes explicitly retryable');

SELECT public.begin_numo_turn(
  '51600000-0000-4000-8000-000000000021',
  '51600000-0000-4000-8000-000000000001',
  '51600000-0000-4000-8000-000000000050',
  '51600000-0000-4000-8000-000000000051', '{}', 'model', 'medium', '51600000-0000-4000-8000-000000000202', 0,
  'Create an external object', NULL, '{}'
);
SELECT public.claim_numo_turn(
  (SELECT id FROM public.numo_assistant_turns WHERE conversation_id = '51600000-0000-4000-8000-000000000021'),
  '51600000-0000-4000-8000-000000000052', false
);
SELECT public.claim_numo_tool_operation(
  (SELECT id FROM public.numo_assistant_turns WHERE conversation_id = '51600000-0000-4000-8000-000000000021'),
  '51600000-0000-4000-8000-000000000052', 'call-create', 'create_issue',
  '{"title":"Only once"}', 'reconcile'
);
UPDATE public.numo_assistant_turns
SET claimed_at = now() - interval '7 minutes'
WHERE conversation_id = '51600000-0000-4000-8000-000000000021';
SELECT public.claim_numo_turn(
  (SELECT id FROM public.numo_assistant_turns WHERE conversation_id = '51600000-0000-4000-8000-000000000021'),
  '51600000-0000-4000-8000-000000000053', false
);
SELECT public.claim_numo_tool_operation(
  (SELECT id FROM public.numo_assistant_turns WHERE conversation_id = '51600000-0000-4000-8000-000000000021'),
  '51600000-0000-4000-8000-000000000053', 'call-create', 'create_issue',
  '{"title":"Only once"}', 'reconcile'
);
SELECT pg_temp.assert_numo_turn((
  SELECT status = 'reconciling' FROM public.numo_assistant_turns
  WHERE conversation_id = '51600000-0000-4000-8000-000000000021'
), 'unfinished mutation requires reconciliation');

SELECT public.begin_numo_turn(
  '51600000-0000-4000-8000-000000000022',
  '51600000-0000-4000-8000-000000000001',
  '51600000-0000-4000-8000-000000000060',
  '51600000-0000-4000-8000-000000000061', '{}', 'model', 'medium', '51600000-0000-4000-8000-000000000203', 0,
  'Long answer', NULL, '{}'
);
SELECT public.claim_numo_turn(
  (SELECT id FROM public.numo_assistant_turns WHERE conversation_id = '51600000-0000-4000-8000-000000000022'),
  '51600000-0000-4000-8000-000000000062', false
);
SELECT public.request_numo_turn_stop(
  '51600000-0000-4000-8000-000000000022',
  '51600000-0000-4000-8000-000000000001'
);
UPDATE public.numo_assistant_turns
SET claimed_at = now() - interval '7 minutes'
WHERE conversation_id = '51600000-0000-4000-8000-000000000022';
SELECT public.recover_stale_numo_turns();
SELECT pg_temp.assert_numo_turn((
  SELECT status = 'stopped' FROM public.numo_assistant_turns
  WHERE conversation_id = '51600000-0000-4000-8000-000000000022'
), 'stale stop reaches an explicit terminal state');
SELECT public.retry_numo_turn(
  '51600000-0000-4000-8000-000000000022',
  '51600000-0000-4000-8000-000000000001'
);
SELECT pg_temp.assert_numo_turn((
  SELECT status = 'retryable' FROM public.numo_assistant_turns
  WHERE conversation_id = '51600000-0000-4000-8000-000000000022'
), 'stopped turn has an explicit retry path');

SELECT public.begin_numo_turn(
  '51600000-0000-4000-8000-000000000024',
  '51600000-0000-4000-8000-000000000001',
  '51600000-0000-4000-8000-000000000070',
  '51600000-0000-4000-8000-000000000071', '{}', 'model', 'medium', '51600000-0000-4000-8000-000000000204', 0,
  'Create and then stop', NULL, '{}'
);
SELECT public.claim_numo_turn(
  (SELECT id FROM public.numo_assistant_turns WHERE conversation_id = '51600000-0000-4000-8000-000000000024'),
  '51600000-0000-4000-8000-000000000072', false
);
SELECT public.claim_numo_tool_operation(
  (SELECT id FROM public.numo_assistant_turns WHERE conversation_id = '51600000-0000-4000-8000-000000000024'),
  '51600000-0000-4000-8000-000000000072', 'call-stop-race', 'create_issue',
  '{"title":"Stop race"}', 'reconcile'
);
SELECT public.request_numo_turn_stop(
  '51600000-0000-4000-8000-000000000024',
  '51600000-0000-4000-8000-000000000001'
);
SELECT pg_temp.assert_numo_turn(public.complete_numo_tool_operation(
  (SELECT id FROM public.numo_assistant_turns WHERE conversation_id = '51600000-0000-4000-8000-000000000024'),
  '51600000-0000-4000-8000-000000000072', 'call-stop-race', true,
  '{"id":"created"}', '{"id":"created"}', false
), 'a tool completion is recorded while stop is pending');
UPDATE public.numo_assistant_turns
SET claimed_at = now() - interval '7 minutes'
WHERE conversation_id = '51600000-0000-4000-8000-000000000024';
SELECT public.recover_stale_numo_turns();
SELECT pg_temp.assert_numo_turn((
  SELECT t.status = 'stopped' AND o.status = 'completed'
  FROM public.numo_assistant_turns t
  JOIN public.numo_tool_operations o ON o.turn_id = t.id
  WHERE t.conversation_id = '51600000-0000-4000-8000-000000000024'
), 'stale stop preserves the completed tool result');

SELECT public.begin_numo_turn(
  '51600000-0000-4000-8000-000000000025',
  '51600000-0000-4000-8000-000000000001',
  '51600000-0000-4000-8000-000000000080',
  '51600000-0000-4000-8000-000000000081', '{}', 'model', 'medium', '51600000-0000-4000-8000-000000000205', 0,
  'Read the issue', NULL, '{}'
);
SELECT public.claim_numo_turn(
  (SELECT id FROM public.numo_assistant_turns WHERE conversation_id = '51600000-0000-4000-8000-000000000025'),
  '51600000-0000-4000-8000-000000000082', false
);
SELECT public.checkpoint_numo_tool_round(
  (SELECT id FROM public.numo_assistant_turns WHERE conversation_id = '51600000-0000-4000-8000-000000000025'),
  '51600000-0000-4000-8000-000000000082', 'I will read it.',
  '[{"id":"call-read","type":"function","function":{"name":"get_issue","arguments":"{}"}}]',
  NULL, 1
);
SELECT pg_temp.assert_numo_turn((
  SELECT t.checkpoint ->> 'phase' = 'tools'
    AND (t.checkpoint ->> 'assistantMessageId')::uuid = m.id
  FROM public.numo_assistant_turns t
  JOIN public.assistant_messages m ON m.turn_id = t.id
    AND m.role = 'assistant' AND m.tool_calls IS NOT NULL
  WHERE t.conversation_id = '51600000-0000-4000-8000-000000000025'
), 'assistant tool-call message and checkpoint commit together');

SELECT pass('Durable Numo turn lifecycle fixtures pass');
SELECT * FROM finish();
ROLLBACK;
