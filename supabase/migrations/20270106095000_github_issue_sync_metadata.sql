-- GitHub exposes more issue data than minddy's portable issue model can own.
-- Keep that provider-specific data in a sidecar rather than overloading title,
-- description, or arbitrary categories. The primary key and remote comment
-- identity make repeated webhook deliveries safe.

CREATE TABLE public.github_issue_sync_metadata (
    issue_id uuid PRIMARY KEY REFERENCES public.issues(id) ON DELETE CASCADE,
    github_node_id text,
    author_login text,
    author_association text,
    state_reason text,
    locked boolean NOT NULL DEFAULT false,
    active_lock_reason text,
    milestone jsonb,
    created_at_remote timestamp with time zone,
    updated_at_remote timestamp with time zone,
    closed_at_remote timestamp with time zone,
    closed_by_login text,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    synced_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX idx_github_issue_sync_metadata_updated
    ON public.github_issue_sync_metadata (updated_at_remote DESC);

CREATE TABLE public.github_issue_comment_syncs (
    remote_comment_id text NOT NULL,
    issue_id uuid NOT NULL REFERENCES public.issues(id) ON DELETE CASCADE,
    comment_id uuid NOT NULL UNIQUE REFERENCES public.comments(id) ON DELETE CASCADE,
    author_login text,
    author_association text,
    html_url text,
    created_at_remote timestamp with time zone,
    updated_at_remote timestamp with time zone,
    deleted_at_remote timestamp with time zone,
    synced_at timestamp with time zone NOT NULL DEFAULT now(),
    PRIMARY KEY (remote_comment_id, issue_id)
);

CREATE INDEX idx_github_issue_comment_syncs_issue
    ON public.github_issue_comment_syncs (issue_id, created_at_remote);

ALTER TABLE public.github_issue_sync_metadata ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.github_issue_comment_syncs ENABLE ROW LEVEL SECURITY;

CREATE POLICY github_issue_sync_metadata_select ON public.github_issue_sync_metadata
    FOR SELECT TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.issues
        WHERE issues.id = github_issue_sync_metadata.issue_id
          AND public.can_access_project(issues.project_id)
    ));

CREATE POLICY github_issue_comment_syncs_select ON public.github_issue_comment_syncs
    FOR SELECT TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.issues
        WHERE issues.id = github_issue_comment_syncs.issue_id
          AND public.can_access_project(issues.project_id)
    ));
