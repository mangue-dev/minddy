-- Freeze the repository identity selected at launch and the desktop identity
-- that wins a local-run claim. Names are mutable; provider repository IDs are
-- stable across renames and prevent a relinked project from inheriting a run.
ALTER TABLE public.agent_runs
  ADD COLUMN repo_provider text,
  ADD COLUMN repo_external_id text,
  ADD COLUMN local_exec_device_id text;

UPDATE public.agent_runs AS run
SET repo_provider = link.provider,
    repo_external_id = link.external_repo_id
FROM public.project_git_links AS link
WHERE run.repo_link_id = link.id;

ALTER TABLE public.agent_runs
  ADD CONSTRAINT agent_runs_repo_binding_ck CHECK (
    (
      repo_link_id IS NULL
      AND connection_id IS NULL
      AND repo_provider IS NULL
      AND repo_external_id IS NULL
    )
    OR
    (repo_provider IN ('github', 'gitlab') AND repo_external_id IS NOT NULL)
  ),
  ADD CONSTRAINT agent_runs_local_exec_device_ck CHECK (
    local_exec_device_id IS NULL OR local_exec_device_id ~ '^[0-9a-f]{32}$'
  );

COMMENT ON COLUMN public.agent_runs.repo_provider IS
  'Repository provider frozen at run creation. Compared with the current project link before privileged repository operations (MIN-457).';
COMMENT ON COLUMN public.agent_runs.repo_external_id IS
  'Stable forge repository ID frozen at run creation. Repository names may change; this identity must not (MIN-457).';
COMMENT ON COLUMN public.agent_runs.local_exec_device_id IS
  'Desktop profile that atomically claimed this local run. Null until the queued-to-running transition (MIN-457).';

-- A queued cloud run may outlive the membership or repository binding that
-- authorized its launch. Keep those checks inside the queued-to-running write;
-- the application repeats them after the RPC to fail closed on read errors.
CREATE OR REPLACE FUNCTION public.claim_agent_run(
  p_run_id uuid
) RETURNS SETOF public.agent_runs
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  UPDATE public.agent_runs
     SET status = 'running',
         started_at = now(),
         window_started_at = coalesce(window_started_at, now()),
         attempts = attempts + 1
   WHERE id = p_run_id
     AND status = 'queued'
     AND created_by IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM public.projects AS project
       WHERE project.id = agent_runs.project_id
         AND project.deleted_at IS NULL
         AND (
           project.owner_id = agent_runs.created_by
           OR EXISTS (
             SELECT 1
             FROM public.project_members AS member
             WHERE member.project_id = project.id
               AND member.user_id = agent_runs.created_by
           )
         )
     )
     AND (
       (
         agent_runs.repo_link_id IS NULL
         AND agent_runs.connection_id IS NULL
         AND agent_runs.repo_provider IS NULL
         AND agent_runs.repo_external_id IS NULL
         AND NOT EXISTS (
           SELECT 1
           FROM public.project_git_links AS current_link
           WHERE current_link.project_id = agent_runs.project_id
         )
       )
       OR EXISTS (
         SELECT 1
         FROM public.project_git_links AS current_link
         WHERE current_link.project_id = agent_runs.project_id
           AND current_link.id = agent_runs.repo_link_id
           AND current_link.connection_id IS NOT DISTINCT FROM agent_runs.connection_id
           AND current_link.provider = agent_runs.repo_provider
           AND current_link.external_repo_id = agent_runs.repo_external_id
       )
     )
  RETURNING *;
$$;

-- The local claim combines authorization and assignment in one write. A
-- project colleague, another desktop profile, or a second claimant cannot win
-- after the row has moved out of queued.
CREATE OR REPLACE FUNCTION public.claim_local_agent_run(
  p_run_id uuid,
  p_user_id uuid,
  p_device_id text
) RETURNS SETOF public.agent_runs
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  UPDATE public.agent_runs
     SET status = 'running',
         started_at = now(),
         window_started_at = coalesce(window_started_at, now()),
         attempts = attempts + 1,
         local_exec_device_id = p_device_id
   WHERE id = p_run_id
     AND status = 'queued'
     AND local_exec = true
     AND created_by = p_user_id
     AND local_exec_device_id IS NULL
     AND p_device_id ~ '^[0-9a-f]{32}$'
     AND EXISTS (
       SELECT 1
       FROM public.projects AS project
       WHERE project.id = agent_runs.project_id
         AND project.deleted_at IS NULL
         AND (
           project.owner_id = p_user_id
           OR EXISTS (
             SELECT 1
             FROM public.project_members AS member
             WHERE member.project_id = project.id
               AND member.user_id = p_user_id
           )
         )
     )
     AND (
       (
         agent_runs.repo_link_id IS NULL
         AND agent_runs.connection_id IS NULL
         AND agent_runs.repo_provider IS NULL
         AND agent_runs.repo_external_id IS NULL
         AND NOT EXISTS (
           SELECT 1
           FROM public.project_git_links AS current_link
           WHERE current_link.project_id = agent_runs.project_id
         )
       )
       OR EXISTS (
         SELECT 1
         FROM public.project_git_links AS current_link
         WHERE current_link.project_id = agent_runs.project_id
           AND current_link.id = agent_runs.repo_link_id
           AND current_link.connection_id IS NOT DISTINCT FROM agent_runs.connection_id
           AND current_link.provider = agent_runs.repo_provider
           AND current_link.external_repo_id = agent_runs.repo_external_id
       )
     )
  RETURNING *;
$$;

REVOKE ALL ON FUNCTION public.claim_local_agent_run(uuid, uuid, text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.claim_local_agent_run(uuid, uuid, text) TO service_role;
