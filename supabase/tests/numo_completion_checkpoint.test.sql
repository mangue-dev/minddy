-- Run after migrations against a disposable database; all fixtures roll back.
BEGIN;

CREATE FUNCTION pg_temp.assert_completion(condition boolean, label text) RETURNS void
LANGUAGE plpgsql AS $$ BEGIN
  IF condition IS DISTINCT FROM true THEN RAISE EXCEPTION 'Completion checkpoint: %', label; END IF;
END $$;

SELECT pg_temp.assert_completion(
  NOT has_function_privilege('anon', 'public.checkpoint_numo_tool_round(uuid,uuid,text,jsonb,jsonb,integer)', 'EXECUTE')
  AND NOT has_function_privilege('authenticated', 'public.checkpoint_numo_tool_round(uuid,uuid,text,jsonb,jsonb,integer)', 'EXECUTE')
  AND has_function_privilege('service_role', 'public.checkpoint_numo_tool_round(uuid,uuid,text,jsonb,jsonb,integer)', 'EXECUTE'),
  'only the service role can checkpoint a native tool round'
);

INSERT INTO auth.users (id, email) VALUES
  ('63000000-0000-4000-8000-000000000001', 'completion@example.test');
INSERT INTO public.conversations (id, user_id, title) VALUES
  ('63000000-0000-4000-8000-000000000002', '63000000-0000-4000-8000-000000000001', 'Completion repair');
INSERT INTO public.numo_assistant_turns (
  id, conversation_id, user_id, request_id, run_id, status, claim_token, claimed_at, checkpoint
) VALUES (
  '63000000-0000-4000-8000-000000000003', '63000000-0000-4000-8000-000000000002',
  '63000000-0000-4000-8000-000000000001', '63000000-0000-4000-8000-000000000004',
  '63000000-0000-4000-8000-000000000005', 'running',
  '63000000-0000-4000-8000-000000000006', now(),
  '{"phase":"model","completionRepairs":2,"completionRepairPending":true,"completionRepairExhausted":false}'
);

SELECT public.checkpoint_numo_tool_round(
  '63000000-0000-4000-8000-000000000003', '63000000-0000-4000-8000-000000000006', NULL,
  '[{"id":"native-launch","type":"function","function":{"name":"launch_code_agent","arguments":"{}"}}]', NULL, 3
);
SELECT pg_temp.assert_completion((
  SELECT checkpoint ->> 'completionRepairs' = '2'
    AND checkpoint ->> 'phase' = 'tools'
    AND NOT checkpoint ? 'completionRepairPending'
    AND NOT checkpoint ? 'completionRepairExhausted'
  FROM public.numo_assistant_turns WHERE id = '63000000-0000-4000-8000-000000000003'
), 'native tools retain the repair bound and clear pending flags atomically');
SELECT pg_temp.assert_completion((
  SELECT (t.checkpoint ->> 'assistantMessageId')::uuid = m.id
  FROM public.numo_assistant_turns t JOIN public.assistant_messages m ON m.turn_id = t.id
  WHERE t.id = '63000000-0000-4000-8000-000000000003'
), 'the bound and the actual native tool message share a checkpoint');

SELECT pg_temp.assert_completion((
  SELECT count(*) = 0 FROM public.checkpoint_numo_tool_round(
    '63000000-0000-4000-8000-000000000003', '63000000-0000-4000-8000-000000000099', NULL,
    '[{"id":"lost-claim","type":"function","function":{"name":"launch_code_agent","arguments":"{}"}}]', NULL, 4
  )
), 'a lost claim cannot replace the completion checkpoint');
UPDATE public.numo_assistant_turns SET status = 'stopping'
WHERE id = '63000000-0000-4000-8000-000000000003';
SELECT pg_temp.assert_completion((
  SELECT count(*) = 0 FROM public.checkpoint_numo_tool_round(
    '63000000-0000-4000-8000-000000000003', '63000000-0000-4000-8000-000000000006', NULL,
    '[{"id":"stopped-call","type":"function","function":{"name":"launch_code_agent","arguments":"{}"}}]', NULL, 4
  )
), 'a pending stop prevents a new native tool checkpoint');
SELECT pg_temp.assert_completion((
  SELECT count(*) = 1 FROM public.assistant_messages
  WHERE turn_id = '63000000-0000-4000-8000-000000000003'
), 'lost claims and stops do not append tool messages');

UPDATE public.numo_assistant_turns SET status = 'running', checkpoint = '{"phase":"model"}'
WHERE id = '63000000-0000-4000-8000-000000000003';
SELECT public.checkpoint_numo_tool_round(
  '63000000-0000-4000-8000-000000000003', '63000000-0000-4000-8000-000000000006', NULL,
  '[{"id":"ordinary-call","type":"function","function":{"name":"get_issue","arguments":"{}"}}]', NULL, 1
);
SELECT pg_temp.assert_completion((
  SELECT checkpoint ->> 'completionRepairs' = '0'
  FROM public.numo_assistant_turns WHERE id = '63000000-0000-4000-8000-000000000003'
), 'ordinary tool rounds retain a zero correction count');

ROLLBACK;
