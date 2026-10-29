-- MIN-847: administrators are told in their inbox when an instance variable
-- changes from the admin dashboard. The notification has no target: it opens
-- the dashboard, whose history names the change. Adding a value keeps every
-- existing row valid and the previous release unaffected.
ALTER TABLE public.notifications DROP CONSTRAINT notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check CHECK (type = ANY (ARRAY[
  'assigned', 'mention', 'comment', 'agent_done', 'agent_question', 'agent_failed',
  'feedback_new', 'pr_reviewed', 'pr_merged', 'pr_opened', 'automation_paused',
  'automation_stopped', 'routine_done', 'page_mention', 'page_agent_edit', 'page_comment',
  'instance_config_changed'
]::text[]));
