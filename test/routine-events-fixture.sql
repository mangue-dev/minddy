-- Minimal pre-MIN-677 schema for isolated migration/concurrency regressions.
DO $$ BEGIN CREATE ROLE anon; EXCEPTION WHEN duplicate_object THEN NULL; END; $$;
DO $$ BEGIN CREATE ROLE authenticated; EXCEPTION WHEN duplicate_object THEN NULL; END; $$;
DO $$ BEGIN CREATE ROLE service_role; EXCEPTION WHEN duplicate_object THEN NULL; END; $$;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE public.projects(id uuid PRIMARY KEY,owner_id uuid NOT NULL,deleted_at timestamptz);
CREATE TABLE public.issues(id uuid PRIMARY KEY,project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE,status text NOT NULL DEFAULT 'backlog',assignee_id uuid,priority text DEFAULT 'none',effort text,deleted_at timestamptz,title text);
CREATE TABLE public.issue_categories(issue_id uuid REFERENCES public.issues(id) ON DELETE CASCADE,category_id uuid,PRIMARY KEY(issue_id,category_id));
CREATE TABLE public.comments(id uuid PRIMARY KEY,issue_id uuid REFERENCES public.issues(id) ON DELETE CASCADE,body text);
CREATE TABLE public.feedback_posts(id uuid PRIMARY KEY,project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE,deleted_at timestamptz,title text,body text,is_public boolean DEFAULT false,review_state text DEFAULT 'pending');
CREATE TABLE public.pages(id uuid PRIMARY KEY,project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE,parent_id uuid REFERENCES public.pages(id),deleted_at timestamptz,page_is_database boolean DEFAULT false,title text,property_values jsonb,encrypted_content text);
CREATE TABLE public.conversations(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),project_id uuid,user_id uuid,title text,model text,reasoning_level text);
CREATE TABLE public.numo_assistant_turns(id uuid PRIMARY KEY);
CREATE TABLE public.agent_routines(id uuid PRIMARY KEY,project_id uuid REFERENCES public.projects(id),owner_id uuid NOT NULL,title text,prompt text,prompt_mentions jsonb DEFAULT '[]',base_branch text,max_spend_percent integer DEFAULT 15,frequency text DEFAULT 'weekly',hour integer DEFAULT 9,minute integer DEFAULT 0,weekdays smallint[] DEFAULT '{1}',days_of_month smallint[] DEFAULT '{}',timezone text DEFAULT 'Europe/Paris',enabled boolean DEFAULT true,next_run_at timestamptz,last_run_at timestamptz,last_error text,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now(),deleted_at timestamptz,encrypted_content text,encryption_version integer DEFAULT 0,content_revision bigint DEFAULT 0,encryption_checked_at timestamptz);
CREATE TABLE public.agent_routine_content_encryption_scope(id boolean PRIMARY KEY DEFAULT true,activated_at timestamptz DEFAULT now());
CREATE TABLE public.agent_chains(id uuid PRIMARY KEY,status text,stop_reason text,pending_event jsonb,not_before timestamptz);
CREATE FUNCTION public.can_access_project(uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
CREATE FUNCTION public.set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at:=now();RETURN NEW;END; $$;
