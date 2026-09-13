-- Map shared comment surfaces to private durable Numo conversations. The
-- mapping is scoped by actor so one teammate's private connector context can
-- never become another teammate's model history merely because both replied
-- in the same shared thread.
BEGIN;

CREATE TABLE public.numo_surface_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  surface text NOT NULL,
  source_thread_id text NOT NULL,
  actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT numo_surface_threads_surface_check CHECK (surface IN (
    'issue_comment', 'objective_comment', 'page_comment',
    'feedback_comment', 'pull_request_comment'
  )),
  CONSTRAINT numo_surface_threads_source_actor_unique
    UNIQUE (surface, source_thread_id, actor_id),
  CONSTRAINT numo_surface_threads_conversation_unique UNIQUE (conversation_id)
);

CREATE INDEX numo_surface_threads_project_idx
  ON public.numo_surface_threads (project_id, updated_at DESC);

CREATE TABLE public.numo_surface_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES public.numo_surface_threads(id) ON DELETE CASCADE,
  source_event_id text NOT NULL,
  actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  turn_id uuid REFERENCES public.numo_assistant_turns(id) ON DELETE SET NULL,
  destination jsonb NOT NULL DEFAULT '{}'::jsonb,
  response_id text,
  projection_status text NOT NULL DEFAULT 'pending',
  projected_turn_status text,
  projected_at timestamptz,
  notified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT numo_surface_events_source_unique UNIQUE (thread_id, source_event_id),
  CONSTRAINT numo_surface_events_projection_status_check CHECK (
    projection_status IN ('pending', 'projecting', 'projected', 'failed')
  )
);

CREATE INDEX numo_surface_events_turn_idx
  ON public.numo_surface_events (turn_id, created_at DESC)
  WHERE turn_id IS NOT NULL;

ALTER TABLE public.numo_surface_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.numo_surface_events ENABLE ROW LEVEL SECURITY;

-- These tables contain private-conversation identities and server-controlled
-- delivery destinations. Shared surfaces expose only the projected comment.
REVOKE ALL ON public.numo_surface_threads, public.numo_surface_events
  FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.numo_surface_threads, public.numo_surface_events TO service_role;

COMMIT;
