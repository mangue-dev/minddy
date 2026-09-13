-- A delegated worker notification belongs to the parent Numo conversation and
-- identifies the exact work card to reveal there. The worker conversation is
-- retained for title hydration and compatibility with existing agent notices.
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS numo_conversation_id uuid
    REFERENCES public.numo_conversation_ids(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS numo_work_id uuid
    REFERENCES public.agent_runs(id) ON DELETE CASCADE;

ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_numo_work_pair_check;
ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_numo_work_pair_check CHECK (
    (numo_conversation_id IS NULL AND numo_work_id IS NULL)
    OR (numo_conversation_id IS NOT NULL AND numo_work_id IS NOT NULL)
  );

CREATE INDEX IF NOT EXISTS idx_notifications_numo_conversation
  ON public.notifications (numo_conversation_id, numo_work_id)
  WHERE numo_conversation_id IS NOT NULL;
