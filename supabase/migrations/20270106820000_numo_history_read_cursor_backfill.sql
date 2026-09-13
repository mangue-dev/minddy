-- Conversations that predate Numo did not have a read cursor. Treat their
-- existing history as read so that only future activity creates an unread badge.
BEGIN;

INSERT INTO public.numo_conversation_state (user_id, conversation_id, last_read_at)
SELECT conversation.user_id, identity.id, now()
FROM public.conversations AS conversation
JOIN public.numo_conversation_ids AS identity ON identity.assistant_id = conversation.id
ON CONFLICT (user_id, conversation_id) DO NOTHING;

COMMIT;
