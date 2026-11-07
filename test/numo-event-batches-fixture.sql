-- Additions to test/routine-events-fixture.sql for the MIN-926 event batches:
-- the auth tables the recipients read, memberships, and the extra sources.
CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE auth.users(id uuid PRIMARY KEY,raw_user_meta_data jsonb NOT NULL DEFAULT '{}',last_sign_in_at timestamptz,deleted_at timestamptz);
CREATE TABLE auth.sessions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz,refreshed_at timestamp);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub','')::uuid $$;
CREATE TABLE public.project_members(project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE,user_id uuid,role text NOT NULL DEFAULT 'member',PRIMARY KEY(project_id,user_id));
CREATE TABLE public.objectives(id uuid PRIMARY KEY,project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE,status text NOT NULL DEFAULT 'planned',lead_user_id uuid,target_date timestamptz,deleted_at timestamptz);
CREATE TABLE public.issue_events(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),issue_id uuid,actor_id uuid,type text NOT NULL,via_assistant boolean NOT NULL DEFAULT false);
ALTER TABLE public.numo_assistant_turns ADD COLUMN user_id uuid, ADD COLUMN status text NOT NULL DEFAULT 'queued';
ALTER TABLE public.comments ADD COLUMN author_id uuid, ADD COLUMN via_assistant boolean NOT NULL DEFAULT false, ADD COLUMN objective_id uuid, ADD COLUMN feedback_post_id uuid;
ALTER TABLE public.comments ALTER COLUMN issue_id DROP NOT NULL;
ALTER TABLE public.issues ADD COLUMN created_by uuid, ADD COLUMN position double precision NOT NULL DEFAULT 0, ADD COLUMN due_date timestamptz;
ALTER TABLE public.pages ADD COLUMN created_by uuid, ADD COLUMN updated_by uuid;
CREATE TABLE public.page_comments(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),page_id uuid REFERENCES public.pages(id) ON DELETE CASCADE,author_id uuid,via_assistant boolean NOT NULL DEFAULT false,body text);
CREATE TABLE public.notifications(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL,project_id uuid,type text NOT NULL,issue_id uuid,comment_id uuid,actor_id uuid,objective_id uuid,feedback_post_id uuid,page_id uuid,via_assistant boolean NOT NULL DEFAULT false);
