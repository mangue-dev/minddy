-- Keep Numo's work branches recognizable while allowing each account to use
-- the namespace expected by its repositories.
ALTER TABLE public.user_agent_preferences
  ADD COLUMN IF NOT EXISTS branch_prefix text NOT NULL DEFAULT 'numo/';

ALTER TABLE public.user_agent_preferences
  DROP CONSTRAINT IF EXISTS user_agent_preferences_branch_prefix_check;
ALTER TABLE public.user_agent_preferences
  ADD CONSTRAINT user_agent_preferences_branch_prefix_check
  CHECK (
    branch_prefix = btrim(branch_prefix)
    AND char_length(branch_prefix) BETWEEN 2 AND 128
    AND right(branch_prefix, 1) = '/'
    AND branch_prefix NOT LIKE '/%'
    AND branch_prefix NOT LIKE '-%'
    AND branch_prefix NOT LIKE '%//%'
    AND branch_prefix NOT LIKE '%..%'
    AND branch_prefix NOT LIKE '%@{%'
    AND branch_prefix !~ '(^|/)\.'
    AND branch_prefix !~ '\.lock/'
    AND branch_prefix !~ '[[:cntrl:][:space:]~^:?*]'
    AND position('[' IN branch_prefix) = 0
    AND position(chr(92) IN branch_prefix) = 0
  );
