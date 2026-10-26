-- MIN-802 — pull request comments mirrored into linked tickets.
--
-- The GitHub issue-comment sidecar becomes the forge-comment sidecar: it also
-- records which forge wrote the comment, the pull request it came from (so a
-- ticket can reply and resolve through that PR) and the forge thread it
-- belongs to (GitHub review-thread root, GitLab discussion), which threads
-- replies under their root. Every column is nullable or defaulted: the
-- previous release keeps writing rows without them.
ALTER TABLE public.github_issue_comment_syncs
  ADD COLUMN provider text NOT NULL DEFAULT 'github'
    CONSTRAINT github_issue_comment_syncs_provider_check
    CHECK (provider IN ('github', 'gitlab')),
  ADD COLUMN pull_request_id uuid
    REFERENCES public.pull_requests(id) ON DELETE SET NULL,
  ADD COLUMN thread_key text;

CREATE INDEX idx_github_issue_comment_syncs_thread
  ON public.github_issue_comment_syncs (issue_id, thread_key)
  WHERE thread_key IS NOT NULL;

CREATE INDEX idx_github_issue_comment_syncs_pull_request
  ON public.github_issue_comment_syncs (pull_request_id)
  WHERE pull_request_id IS NOT NULL;

-- When the PR's past comments were imported into this ticket. NULL = still to
-- do: the importer sets it only once an import completed, so a failed or
-- interrupted import is retried on a later PR event. Links that predate this
-- column start NULL on purpose: their PR history is imported on the next PR
-- event.
ALTER TABLE public.pull_request_issues
  ADD COLUMN comments_backfilled_at timestamptz;
