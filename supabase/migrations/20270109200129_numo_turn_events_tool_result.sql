-- MIN-1010: a turn's journal records the result of each tool it ran.
--
-- A reader that follows a turn from the journal, after a handoff to a new job
-- or a reconnect, never saw tool results: they were sent on the live stream
-- only, so every tool card stayed "running" until the turn ended. The journal
-- now records the same redacted result the tool message stores, never the
-- live-only one that can show a fresh secret once.
--
-- Additive only: the previous release never writes this type.

BEGIN;

ALTER TABLE public.numo_turn_events
  DROP CONSTRAINT numo_turn_events_type_check,
  ADD CONSTRAINT numo_turn_events_type_check CHECK (type IN (
    'conversation_id', 'content_delta', 'reasoning_start', 'reasoning_delta',
    'reasoning_end', 'tool_call_start', 'tool_call_args_delta',
    'tool_call_complete', 'tool_result', 'message_complete', 'worker_completed',
    'worker_failed', 'worker_input', 'state', 'done', 'error'
  ));

COMMIT;
