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
  ('51600000-0000-4000-8000-000000000020', '51600000-0000-4000-8000-000000000001', 'Worker parent'),
  ('51600000-0000-4000-8000-000000000021', '51600000-0000-4000-8000-000000000001', 'Ambiguous mutation'),
  ('51600000-0000-4000-8000-000000000022', '51600000-0000-4000-8000-000000000001', 'Stop recovery');
INSERT INTO public.agent_conversations (id, owner_id, project_id, visibility, title) VALUES
  ('51600000-0000-4000-8000-000000000030', '51600000-0000-4000-8000-000000000001', '51600000-0000-4000-8000-000000000010', 'private', 'Worker');
INSERT INTO public.agent_runs (id, conversation_id, project_id, created_by, status, triggered_by) VALUES
  ('51600000-0000-4000-8000-000000000031', '51600000-0000-4000-8000-000000000030', '51600000-0000-4000-8000-000000000010', '51600000-0000-4000-8000-000000000001', 'running', 'chat');

SELECT public.begin_numo_turn(
  '51600000-0000-4000-8000-000000000020',
  '51600000-0000-4000-8000-000000000001',
  '51600000-0000-4000-8000-000000000040',
  '51600000-0000-4000-8000-000000000041',
  '{"projectId":null,"locale":"en","timezone":"UTC","numoDefaultStatus":"triage","webSearchEnabled":false}',
  'model', 'medium', 'Delegate this work', NULL, '{}'
);
-- Repeating the HTTP request returns the same turn and does not duplicate its message.
SELECT public.begin_numo_turn(
  '51600000-0000-4000-8000-000000000020',
  '51600000-0000-4000-8000-000000000001',
  '51600000-0000-4000-8000-000000000040',
  '51600000-0000-4000-8000-000000000099',
  '{}', 'other-model', 'low', 'Duplicate', NULL, '{}'
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

SELECT public.checkpoint_numo_turn(
  (SELECT id FROM public.numo_assistant_turns WHERE conversation_id = '51600000-0000-4000-8000-000000000020'),
  '51600000-0000-4000-8000-000000000042', 'waiting_work',
  '{"phase":"worker_wait"}', '51600000-0000-4000-8000-000000000031', NULL, NULL, NULL
);
SELECT pg_temp.assert_numo_turn(
  public.resume_numo_turn_from_worker(
    '51600000-0000-4000-8000-000000000031',
    '51600000-0000-4000-8000-000000000044',
    'worker_completed', '{"outcome":"done"}'
  ) = 'queued',
  'current worker completion queues the parent'
);
SELECT pg_temp.assert_numo_turn(
  public.resume_numo_turn_from_worker(
    '51600000-0000-4000-8000-000000000031',
    '51600000-0000-4000-8000-000000000044',
    'worker_completed', '{"outcome":"done"}'
  ) = 'duplicate',
  'duplicate worker completion is ignored'
);
SELECT pg_temp.assert_numo_turn(
  public.resume_numo_turn_from_worker(
    '51600000-0000-4000-8000-000000000031',
    '51600000-0000-4000-8000-000000000045',
    'worker_failed', '{"error":"late"}'
  ) = 'ignored',
  'reordered worker failure cannot wake the parent twice'
);
SELECT public.claim_numo_turn(
  (SELECT id FROM public.numo_assistant_turns WHERE conversation_id = '51600000-0000-4000-8000-000000000020'),
  '51600000-0000-4000-8000-000000000046', false
);
UPDATE public.numo_assistant_turns
SET claimed_at = now() - interval '7 minutes'
WHERE conversation_id = '51600000-0000-4000-8000-000000000020';
SELECT public.recover_stale_numo_turns();
SELECT pg_temp.assert_numo_turn((
  SELECT status = 'queued' FROM public.numo_assistant_turns
  WHERE conversation_id = '51600000-0000-4000-8000-000000000020'
), 'a stale worker continuation returns to the durable queue');

SELECT public.begin_numo_turn(
  '51600000-0000-4000-8000-000000000021',
  '51600000-0000-4000-8000-000000000001',
  '51600000-0000-4000-8000-000000000050',
  '51600000-0000-4000-8000-000000000051', '{}', 'model', 'medium',
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
  '51600000-0000-4000-8000-000000000061', '{}', 'model', 'medium',
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

SELECT pass('Durable Numo turn lifecycle fixtures pass');
SELECT * FROM finish();
ROLLBACK;
