-- Reasoning snapshots are replayed from the journal on reconnect, but the
-- emitter's `reasoning_delta` events were missing from the type allowlist,
-- so every append failed the CHECK constraint. Add the value to the list.
BEGIN;

ALTER TABLE public.numo_turn_events
  DROP CONSTRAINT numo_turn_events_type_check,
  ADD CONSTRAINT numo_turn_events_type_check CHECK (type IN (
    'conversation_id', 'content_delta', 'reasoning_start', 'reasoning_delta',
    'reasoning_end', 'tool_call_start', 'tool_call_args_delta',
    'tool_call_complete', 'message_complete', 'worker_completed',
    'worker_failed', 'worker_input', 'state', 'done', 'error'
  ));

COMMIT;
