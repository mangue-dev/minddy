-- MIN-975: retire the notification types nothing produces any more.
--
-- The code agent (MIN-721), the automation chains and the successful-routine
-- report (MIN-924) used to write these rows; no code path has inserted one
-- since. The inbox redesign no longer renders them, so their remaining rows
-- are deleted and the type check stops accepting them. The previous release
-- never inserts them either, so narrowing the check is safe during rollout.

DELETE FROM public.notifications
WHERE type IN (
  'agent_done', 'pr_reviewed', 'pr_merged', 'automation_paused',
  'automation_stopped', 'routine_done', 'page_agent_edit'
);

ALTER TABLE public.notifications DROP CONSTRAINT notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check CHECK (type = ANY (ARRAY[
  'assigned', 'mention', 'comment', 'agent_question', 'agent_failed',
  'feedback_new', 'pr_opened', 'page_mention', 'page_comment',
  'instance_config_changed', 'numo_message', 'smart_assign_batch'
]::text[]));
