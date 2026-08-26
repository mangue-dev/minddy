ALTER TABLE public.project_git_links
  ADD COLUMN repo_previous_names text[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.project_git_links.repo_previous_names IS
  'Former owner/name values retained for local checkout matching after a forge rename.';

-- The canonical repository was renamed before aliases were retained. Existing
-- desktop attachments may still use this valid SSH remote and must survive the
-- upgrade that first deploys this column.
UPDATE public.project_git_links
SET repo_previous_names = ARRAY['mangue-dev/minddy-issues']
WHERE provider = 'github'
  AND external_repo_id = '1288848861'
  AND repo_full_name = 'mangue-dev/minddy';
