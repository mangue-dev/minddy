

-- minddy — baseline de schéma consolidé (MIN-379).
--
-- Généré par `supabase migration squash --local` après application complète de
-- l'historique précédent. Ne pas éditer à la main : créez une migration après
-- ce fichier. Les données initiales et les buckets Storage vivent
-- respectivement dans `20270106091000_initial_data.sql` et dans le bootstrap,
-- car elles ne font pas partie d'un dump de schéma PostgreSQL.

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE EXTENSION IF NOT EXISTS "pg_net" WITH SCHEMA "extensions";






COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "vector" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."account_storage_bytes"("p_user" "uuid") RETURNS bigint
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select
    coalesce((select sum(a.size_bytes)
                from public.attachments a
                join public.projects p on p.id = a.project_id
               where p.owner_id = p_user
                 and a.storage_path is not null), 0)
  + coalesce((select sum(f.size_bytes)
                from public.page_files f
                join public.projects p on p.id = f.project_id
               where p.owner_id = p_user), 0)
$$;


ALTER FUNCTION "public"."account_storage_bytes"("p_user" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."agent_runs_stamp_completed_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  if new.status = 'completed' and (old.status is distinct from 'completed') then
    new.completed_at := now();
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."agent_runs_stamp_completed_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."attachment_object_owners"("paths" "text"[]) RETURNS TABLE("name" "text", "owner_id" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select o.name, o.owner_id
  from storage.objects o
  where o.bucket_id = 'attachments'
    and o.name = any(paths)
$$;


ALTER FUNCTION "public"."attachment_object_owners"("paths" "text"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."broadcast_activity_scoped"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  pid uuid;
begin
  if coalesce(new.issue_id, old.issue_id) is not null then
    select project_id into pid from public.issues
     where id = coalesce(new.issue_id, old.issue_id);
  elsif coalesce(new.objective_id, old.objective_id) is not null then
    select project_id into pid from public.objectives
     where id = coalesce(new.objective_id, old.objective_id);
  elsif coalesce(new.feedback_post_id, old.feedback_post_id) is not null then
    select project_id into pid from public.feedback_posts
     where id = coalesce(new.feedback_post_id, old.feedback_post_id);
  end if;
  if pid is not null then
    perform realtime.broadcast_changes(
      'project:' || pid, tg_op, tg_op, tg_table_name, tg_table_schema, new, old);
  end if;
  return null;
exception when others then
  return null;
end;
$$;


ALTER FUNCTION "public"."broadcast_activity_scoped"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."broadcast_agent_chain_row"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  pid uuid := coalesce(new.project_id, old.project_id);
  rec jsonb := null;
  old_rec jsonb := null;
begin
  if tg_op <> 'DELETE' then
    rec := to_jsonb(new);
  end if;
  if tg_op <> 'INSERT' then
    old_rec := to_jsonb(old);
  end if;

  if pid is not null then
    perform realtime.send(
      jsonb_build_object(
        'operation', tg_op,
        'table', tg_table_name,
        'schema', tg_table_schema,
        'record', rec,
        'old_record', old_rec
      ),
      tg_op,
      'project:' || pid,
      true
    );
  end if;
  return null;
exception when others then
  -- Un échec de diffusion ne doit JAMAIS faire échouer l'avancement d'une chaîne.
  return null;
end;
$$;


ALTER FUNCTION "public"."broadcast_agent_chain_row"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."broadcast_agent_run_row"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  pid uuid;
  owner uuid;
  visibility text;
  topic text;
  rec jsonb := null;
  old_rec jsonb := null;
  cid uuid;
begin
  cid := case when tg_op = 'DELETE' then old.conversation_id else new.conversation_id end;
  select c.project_id, c.owner_id, c.visibility
    into pid, owner, visibility
  from public.agent_conversations c where c.id = cid;

  if tg_op <> 'DELETE' then
    rec := jsonb_build_object(
      'id', new.id,
      'conversation_id', new.conversation_id,
      'project_id', new.project_id,
      'issue_id', new.issue_id,
      'routine_id', new.routine_id,
      'status', new.status
    );
  end if;
  if tg_op <> 'INSERT' then
    old_rec := jsonb_build_object(
      'id', old.id,
      'conversation_id', old.conversation_id,
      'project_id', old.project_id,
      'issue_id', old.issue_id,
      'routine_id', old.routine_id,
      'status', old.status
    );
  end if;

  topic := case
    when visibility = 'project' and pid is not null then 'project:' || pid
    when visibility = 'private' and owner is not null then 'user:' || owner
  end;
  if topic is not null then
    perform realtime.send(
      jsonb_build_object(
        'operation', tg_op,
        'table', tg_table_name,
        'schema', tg_table_schema,
        'record', rec,
        'old_record', old_rec
      ),
      tg_op,
      topic,
      true
    );
  end if;
  return null;
exception when others then
  return null;
end;
$$;


ALTER FUNCTION "public"."broadcast_agent_run_row"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."broadcast_billing_row"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  uid uuid := coalesce(new.user_id, old.user_id);
begin
  if uid is not null then
    perform realtime.broadcast_changes(
      'user:' || uid, tg_op, tg_op, tg_table_name, tg_table_schema, new, old);
  end if;
  return null;
exception when others then
  return null;
end;
$$;


ALTER FUNCTION "public"."broadcast_billing_row"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."broadcast_event_scoped"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  pid uuid;
begin
  if coalesce(new.issue_id, old.issue_id) is not null then
    select project_id into pid from public.issues
     where id = coalesce(new.issue_id, old.issue_id);
  elsif coalesce(new.objective_id, old.objective_id) is not null then
    select project_id into pid from public.objectives
     where id = coalesce(new.objective_id, old.objective_id);
  elsif coalesce(new.page_id, old.page_id) is not null then
    select project_id into pid from public.pages
     where id = coalesce(new.page_id, old.page_id);
  end if;
  if pid is not null then
    perform realtime.broadcast_changes(
      'project:' || pid, tg_op, tg_op, tg_table_name, tg_table_schema, new, old);
  end if;
  return null;
exception when others then
  return null;
end;
$$;


ALTER FUNCTION "public"."broadcast_event_scoped"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."broadcast_feedback_child"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  pid uuid;
begin
  select project_id into pid from public.feedback_posts
   where id = coalesce(new.post_id, old.post_id);
  if pid is not null then
    perform realtime.broadcast_changes(
      'project:' || pid, tg_op, tg_op, tg_table_name, tg_table_schema, new, old);
  end if;
  return null;
exception when others then
  return null;
end;
$$;


ALTER FUNCTION "public"."broadcast_feedback_child"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."broadcast_feedback_post"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  pid uuid := coalesce(new.project_id, old.project_id);
  rec jsonb := null;
  old_rec jsonb := null;
begin
  if tg_op <> 'DELETE' then
    rec := to_jsonb(new) - 'embedding';
  end if;
  if tg_op <> 'INSERT' then
    old_rec := to_jsonb(old) - 'embedding';
  end if;

  perform realtime.send(
    jsonb_build_object(
      'operation', tg_op,
      'table', tg_table_name,
      'schema', tg_table_schema,
      'record', rec,
      'old_record', old_rec
    ),
    tg_op,
    'project:' || pid,
    true
  );
  return null;
exception when others then
  return null;
end;
$$;


ALTER FUNCTION "public"."broadcast_feedback_post"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."broadcast_invitations_row"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  invitee uuid := coalesce(new.invited_user_id, old.invited_user_id);
begin
  perform realtime.broadcast_changes(
    'project:' || coalesce(new.project_id, old.project_id),
    tg_op, tg_op, tg_table_name, tg_table_schema, new, old);
  if invitee is not null then
    perform realtime.broadcast_changes(
      'user:' || invitee, tg_op, tg_op, tg_table_name, tg_table_schema, new, old);
  end if;
  return null;
exception when others then
  return null;
end;
$$;


ALTER FUNCTION "public"."broadcast_invitations_row"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."broadcast_issue_scoped"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  pid uuid;
begin
  select project_id into pid from public.issues
   where id = coalesce(new.issue_id, old.issue_id);
  if pid is not null then
    perform realtime.broadcast_changes(
      'project:' || pid, tg_op, tg_op, tg_table_name, tg_table_schema, new, old);
  end if;
  return null;
exception when others then
  return null;
end;
$$;


ALTER FUNCTION "public"."broadcast_issue_scoped"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."broadcast_members_row"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  perform realtime.broadcast_changes(
    'project:' || coalesce(new.project_id, old.project_id),
    tg_op, tg_op, tg_table_name, tg_table_schema, new, old);
  perform realtime.broadcast_changes(
    'user:' || coalesce(new.user_id, old.user_id),
    tg_op, tg_op, tg_table_name, tg_table_schema, new, old);
  return null;
exception when others then
  return null;
end;
$$;


ALTER FUNCTION "public"."broadcast_members_row"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."broadcast_notifications_row"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  perform realtime.broadcast_changes(
    'user:' || coalesce(new.user_id, old.user_id),
    tg_op, tg_op, tg_table_name, tg_table_schema, new, old);
  return null;
exception when others then
  return null;
end;
$$;


ALTER FUNCTION "public"."broadcast_notifications_row"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."broadcast_page_row"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  rec jsonb := null;
  old_rec jsonb := null;
begin
  -- Le corps et ses deux dérivées sortent de la charge utile. `-` sur un jsonb
  -- est sans effet si la clé n'existe pas : la fonction survit à une colonne
  -- qu'on renommerait ou retirerait un jour.
  if tg_op <> 'DELETE' then
    rec := to_jsonb(new) - 'content' - 'search_text' - 'search_tsv';
  end if;
  if tg_op <> 'INSERT' then
    old_rec := to_jsonb(old) - 'content' - 'search_text' - 'search_tsv';
  end if;

  perform realtime.send(
    jsonb_build_object(
      'operation', tg_op,
      'table', tg_table_name,
      'schema', tg_table_schema,
      'record', rec,
      'old_record', old_rec
    ),
    tg_op,
    'project:' || coalesce(new.project_id, old.project_id),
    true
  );
  return null;
exception when others then
  -- Une diffusion ratée ne fait JAMAIS tomber l'écriture : le direct est le
  -- confort, écrire la page est le chemin normal.
  return null;
end;
$$;


ALTER FUNCTION "public"."broadcast_page_row"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."broadcast_project_scoped"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  pid uuid := coalesce(new.project_id, old.project_id);
begin
  perform realtime.broadcast_changes(
    'project:' || pid, tg_op, tg_op, tg_table_name, tg_table_schema, new, old);
  return null;
exception when others then
  return null;
end;
$$;


ALTER FUNCTION "public"."broadcast_project_scoped"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."broadcast_projects_row"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  uid uuid;
begin
  for uid in
    select coalesce(new.owner_id, old.owner_id)
    union
    select user_id from public.project_members
     where project_id = coalesce(new.id, old.id)
  loop
    perform realtime.broadcast_changes(
      'user:' || uid, tg_op, tg_op, tg_table_name, tg_table_schema, new, old);
  end loop;
  return null;
exception when others then
  return null;
end;
$$;


ALTER FUNCTION "public"."broadcast_projects_row"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."broadcast_pull_request_row"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  pid uuid;
  rec jsonb := null;
  old_rec jsonb := null;
  row_provider text := coalesce(new.provider, old.provider);
  row_repo text := coalesce(new.repo_full_name, old.repo_full_name);
begin
  if tg_op <> 'DELETE' then
    rec := to_jsonb(new);
  end if;
  if tg_op <> 'INSERT' then
    old_rec := to_jsonb(old);
  end if;

  for pid in
    select l.project_id
    from public.project_git_links l
    where l.provider = row_provider
      and l.repo_full_name = row_repo
  loop
    perform realtime.send(
      jsonb_build_object(
        'operation', tg_op,
        'table', tg_table_name,
        'schema', tg_table_schema,
        'record', rec,
        'old_record', old_rec
      ),
      tg_op,
      'project:' || pid,
      true
    );
  end loop;
  return null;
exception when others then
  -- Une diffusion ratée ne doit JAMAIS faire tomber un webhook : l'ingestion
  -- d'une PR est le chemin normal, le direct n'en est que le confort.
  return null;
end;
$$;


ALTER FUNCTION "public"."broadcast_pull_request_row"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."broadcast_scratchpad_row"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  perform realtime.broadcast_changes(
    'user:' || coalesce(new.user_id, old.user_id),
    tg_op, tg_op, tg_table_name, tg_table_schema, new, old);
  return null;
exception when others then
  return null;
end;
$$;


ALTER FUNCTION "public"."broadcast_scratchpad_row"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."broadcast_views_row"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  pid uuid := coalesce(new.project_id, old.project_id);
  uid uuid := coalesce(new.user_id, old.user_id);
begin
  if pid is not null then
    perform realtime.broadcast_changes(
      'project:' || pid, tg_op, tg_op, tg_table_name, tg_table_schema, new, old);
  elsif uid is not null then
    perform realtime.broadcast_changes(
      'user:' || uid, tg_op, tg_op, tg_table_name, tg_table_schema, new, old);
  end if;
  return null;
exception when others then
  return null;
end;
$$;


ALTER FUNCTION "public"."broadcast_views_row"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_access_comment_parent"("issue_uuid" "uuid", "objective_uuid" "uuid", "feedback_post_uuid" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select exists (
    select 1 from public.issues i
    where i.id = issue_uuid and public.can_access_project(i.project_id)
  ) or exists (
    select 1 from public.objectives o
    where o.id = objective_uuid and public.can_access_project(o.project_id)
  ) or exists (
    select 1 from public.feedback_posts f
    where f.id = feedback_post_uuid and public.can_access_project(f.project_id)
  );
$$;


ALTER FUNCTION "public"."can_access_comment_parent"("issue_uuid" "uuid", "objective_uuid" "uuid", "feedback_post_uuid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_access_project"("project_uuid" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select public.is_project_owner(project_uuid)
      or public.is_project_member(project_uuid);
$$;


ALTER FUNCTION "public"."can_access_project"("project_uuid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_watch_agent_run"("topic" "text") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  rid uuid;
  c public.agent_conversations;
begin
  begin
    rid := split_part(topic, ':', 2)::uuid;
  exception when others then
    return false;
  end;
  select ac.* into c
  from public.agent_runs r
  join public.agent_conversations ac on ac.id = r.conversation_id
  where r.id = rid;
  if not found or not public.can_access_project(c.project_id) then return false; end if;
  return c.visibility = 'project' or c.owner_id = (select auth.uid());
end;
$$;


ALTER FUNCTION "public"."can_watch_agent_run"("topic" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_watch_numo_comment"("topic" "text") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  cid uuid;
  pid uuid;
  c record;
begin
  begin
    cid := split_part(topic, ':', 2)::uuid;
  exception when others then
    return false;
  end;

  select issue_id, objective_id, feedback_post_id into c
    from public.comments where id = cid;
  if not found then
    return false;
  end if;

  if c.issue_id is not null then
    select project_id into pid from public.issues where id = c.issue_id;
  elsif c.objective_id is not null then
    select project_id into pid from public.objectives where id = c.objective_id;
  elsif c.feedback_post_id is not null then
    select project_id into pid from public.feedback_posts where id = c.feedback_post_id;
  end if;

  if pid is null then
    return false;
  end if;
  return public.can_access_project(pid);
end;
$$;


ALTER FUNCTION "public"."can_watch_numo_comment"("topic" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_watch_pull_request"("topic" "text") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  prid uuid;
begin
  begin
    prid := split_part(topic, ':', 2)::uuid;
  exception when others then
    return false;
  end;
  return exists (
    select 1
    from public.pull_requests p
    join public.project_git_links l
      on l.provider = p.provider
     and l.repo_full_name = p.repo_full_name
    where p.id = prid
      and public.can_access_project(l.project_id)
  );
end;
$$;


ALTER FUNCTION "public"."can_watch_pull_request"("topic" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."capture_agent_assistant_message"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  r public.agent_runs;
  turn_id uuid;
  content text;
begin
  if new.type <> 'summary' then return null; end if;
  content := nullif(btrim(new.payload->>'text'), '');
  if content is null then return null; end if;
  select * into r from public.agent_runs where id = new.run_id;
  select t.id into turn_id
  from public.agent_turns t
  where t.run_id = new.run_id
  order by t.created_at desc, t.id desc
  limit 1;
  insert into public.agent_messages (
    conversation_id, turn_id, run_id, role, content, source,
    legacy_event_id, created_at
  ) values (
    r.conversation_id, turn_id, new.run_id, 'assistant', content,
    'assistant_summary', new.id, new.created_at
  ) on conflict (legacy_event_id) where legacy_event_id is not null do nothing;
  update public.agent_conversations
  set updated_at = greatest(updated_at, new.created_at)
  where id = r.conversation_id;
  return null;
end;
$$;


ALTER FUNCTION "public"."capture_agent_assistant_message"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."capture_agent_queue_message"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  r public.agent_runs;
  turn_id uuid;
begin
  select * into r from public.agent_runs where id = new.run_id;
  select t.id into turn_id
  from public.agent_turns t
  where t.run_id = new.run_id
  order by t.created_at desc, t.id desc
  limit 1;
  insert into public.agent_messages (
    conversation_id, turn_id, run_id, role, content, created_by, source,
    legacy_queue_message_id, created_at
  ) values (
    r.conversation_id, turn_id, new.run_id, 'user', new.content,
    new.created_by, 'steering', new.id, new.created_at
  ) on conflict (legacy_queue_message_id) where legacy_queue_message_id is not null do nothing;
  update public.agent_conversations
  set updated_at = greatest(updated_at, new.created_at)
  where id = r.conversation_id;
  return null;
end;
$$;


ALTER FUNCTION "public"."capture_agent_queue_message"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."agent_runs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "project_id" "uuid" NOT NULL,
    "issue_id" "uuid",
    "repo_link_id" "uuid",
    "connection_id" "uuid",
    "status" "text" DEFAULT 'queued'::"text" NOT NULL,
    "triggered_by" "text" DEFAULT 'button'::"text" NOT NULL,
    "created_by" "uuid",
    "prompt" "text",
    "model" "text",
    "model_forced" boolean DEFAULT false NOT NULL,
    "key_mode" "text" DEFAULT 'platform'::"text" NOT NULL,
    "base_branch" "text",
    "branch_name" "text",
    "pr_number" integer,
    "pr_url" "text",
    "pr_state" "text",
    "sandbox_id" "text",
    "checkpoint" "jsonb",
    "continuations" integer DEFAULT 0 NOT NULL,
    "attempts" integer DEFAULT 0 NOT NULL,
    "not_before" timestamp with time zone DEFAULT "now"() NOT NULL,
    "started_at" timestamp with time zone,
    "window_started_at" timestamp with time zone,
    "run_id" "uuid",
    "cost_usd" numeric(12,6) DEFAULT 0 NOT NULL,
    "outcome" "text",
    "error_message" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_activity_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "interrupt_requested" boolean DEFAULT false NOT NULL,
    "sandbox_stopped_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "prompt_mentions" "jsonb",
    "awaiting_input" boolean DEFAULT false NOT NULL,
    "reasoning_level" "text" DEFAULT 'off'::"text" NOT NULL,
    "title" "text",
    "deployment_url" "text",
    "chain_id" "uuid",
    "budget_usd" numeric(12,6),
    "intent" "text",
    "verdict" "jsonb",
    "pull_request_id" "uuid",
    "pr_head_sha" "text",
    "routine_id" "uuid",
    "provider_key_id" "text",
    "loop_in_vm" boolean DEFAULT false NOT NULL,
    "loop_command_id" "text",
    "agent_engine" "text" DEFAULT 'opencode'::"text" NOT NULL,
    "local_exec" boolean DEFAULT false NOT NULL,
    "local_exec_gen" integer DEFAULT 0 NOT NULL,
    "local_worktree" boolean DEFAULT false NOT NULL,
    "conversation_id" "uuid" NOT NULL,
    CONSTRAINT "agent_runs_agent_engine_check" CHECK (("agent_engine" = ANY (ARRAY['loop'::"text", 'opencode'::"text"]))),
    CONSTRAINT "agent_runs_intent_check" CHECK ((("intent" IS NULL) OR ("intent" = ANY (ARRAY['implement'::"text", 'plan'::"text", 'verify'::"text", 'custom'::"text", 'review'::"text"])))),
    CONSTRAINT "agent_runs_key_mode_check" CHECK (("key_mode" = ANY (ARRAY['platform'::"text", 'byok'::"text"]))),
    CONSTRAINT "agent_runs_pr_state_check" CHECK (("pr_state" = ANY (ARRAY['draft'::"text", 'open'::"text", 'merged'::"text", 'closed'::"text"]))),
    CONSTRAINT "agent_runs_reasoning_level_check" CHECK (("reasoning_level" = ANY (ARRAY['off'::"text", 'minimal'::"text", 'low'::"text", 'medium'::"text", 'high'::"text", 'xhigh'::"text", 'max'::"text"]))),
    CONSTRAINT "agent_runs_status_check" CHECK (("status" = ANY (ARRAY['queued'::"text", 'running'::"text", 'completed'::"text", 'failed'::"text", 'canceled'::"text"]))),
    CONSTRAINT "agent_runs_triggered_by_check" CHECK (("triggered_by" = ANY (ARRAY['button'::"text", 'chat'::"text", 'mention'::"text", 'automation'::"text", 'routine'::"text"])))
);


ALTER TABLE "public"."agent_runs" OWNER TO "postgres";


COMMENT ON COLUMN "public"."agent_runs"."deployment_url" IS 'Affinité de déploiement (MIN-165) : null = production ou local (drainé par le cron de prod), sinon le VERCEL_URL EXACT du déploiement preview qui a créé le run — seul ce déploiement le claim, sur toute sa durée. On stampe le déploiement et pas la branche : un run continue avec le code qui l''a lancé, même si on repousse la branche entre deux chunks.';



COMMENT ON COLUMN "public"."agent_runs"."provider_key_id" IS 'Identifiant de révocation de la clé LLM émise pour ce run (hash OpenRouter). Jamais le secret. Null = pas de clé par run (BYOK, ou provisioning non configuré).';



COMMENT ON COLUMN "public"."agent_runs"."loop_in_vm" IS 'La boucle de ce run tourne DANS la microVM (MIN-224). Figé au lancement depuis app_config.agent_loop_in_vm_projects : une conversation ne change jamais de moteur en cours de vie.';



COMMENT ON COLUMN "public"."agent_runs"."loop_command_id" IS 'Identifiant de la commande Vercel Sandbox qui porte la boucle (detached). Null hors loop_in_vm. Le chien de garde s''en sert pour constater qu''un process de boucle est mort.';



COMMENT ON COLUMN "public"."agent_runs"."agent_engine" IS 'Le harness qui joue ce run : ''opencode'' (serveur headless piloté par notre superviseur, MIN-286) pour tout run neuf, ''loop'' pour les runs antérieurs à la bascule. Écrit à la création et jamais relu ailleurs : chaque moteur relit SA mémoire dans le checkpoint, donc une conversation ne change jamais de moteur en cours de vie.';



COMMENT ON COLUMN "public"."agent_runs"."local_exec" IS 'Ce run s''exécute sur la machine de l''utilisateur (MIN-355), pas dans une microVM. Écrit à la création et jamais relu ailleurs, comme loop_in_vm et agent_engine : une conversation ne change pas d''environnement en cours de vie.';



COMMENT ON COLUMN "public"."agent_runs"."local_exec_gen" IS 'Génération du bail d''exécution locale (MIN-355). Le jeton du harness porte ce nombre en claim ; émettre un jeton l''incrémente, ce qui tue tous les précédents. C''est la seule révocation possible d''un jeton auto-porteur, et elle est gratuite : elle se paie là où la ligne du run est déjà lue.';



COMMENT ON COLUMN "public"."agent_runs"."local_worktree" IS 'Le run local travaille dans un worktree isolé, créé sur la machine qui exécute le tour. Figé au lancement; le chemin reste local à cette machine.';



CREATE OR REPLACE FUNCTION "public"."claim_agent_run"("p_run_id" "uuid") RETURNS SETOF "public"."agent_runs"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  update public.agent_runs
     set status = 'running',
         started_at = now(),
         window_started_at = coalesce(window_started_at, now()),
         attempts = attempts + 1
   where id = p_run_id and status = 'queued'
  returning *;
$$;


ALTER FUNCTION "public"."claim_agent_run"("p_run_id" "uuid") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."feedback_posts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "project_id" "uuid" NOT NULL,
    "author_id" "uuid",
    "created_by_member" "uuid",
    "title" "text" NOT NULL,
    "body" "text" DEFAULT ''::"text" NOT NULL,
    "submitted_title" "text" NOT NULL,
    "submitted_body" "text" DEFAULT ''::"text" NOT NULL,
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "vote_count" integer DEFAULT 0 NOT NULL,
    "issue_id" "uuid",
    "merged_into_id" "uuid",
    "suggested_merge_into_id" "uuid",
    "suggested_confidence" real,
    "source" "text" NOT NULL,
    "embedding" "extensions"."vector"(1536),
    "analyzed_at" timestamp with time zone,
    "analysis_claimed_at" timestamp with time zone,
    "analysis_failures" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "is_public" boolean DEFAULT true NOT NULL,
    "review_state" "text" DEFAULT 'pending'::"text" NOT NULL,
    "classified_at" timestamp with time zone,
    "sensitivity" "text",
    "moderation_reason" "text",
    "deleted_at" timestamp with time zone,
    "deleted_by" "uuid",
    "source_language" "text",
    "translated_title" "text",
    "translated_body" "text",
    "translated_language" "text",
    CONSTRAINT "feedback_posts_review_state_check" CHECK (("review_state" = ANY (ARRAY['pending'::"text", 'published'::"text"]))),
    CONSTRAINT "feedback_posts_source_check" CHECK (("source" = ANY (ARRAY['board'::"text", 'api'::"text", 'internal'::"text"]))),
    CONSTRAINT "feedback_posts_status_check" CHECK (("status" = ANY (ARRAY['open'::"text", 'planned'::"text", 'in_progress'::"text", 'shipped'::"text", 'declined'::"text", 'spam'::"text"])))
);


ALTER TABLE "public"."feedback_posts" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."claim_feedback_post_for_review"("p_post" "uuid") RETURNS SETOF "public"."feedback_posts"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
  update public.feedback_posts p
     set analysis_claimed_at = now()
   where p.id = (
     select id from public.feedback_posts
      where id = p_post
        and (analyzed_at is null or classified_at is null)
        and merged_into_id is null
        and deleted_at is null
        and analysis_failures < 3
        and (analysis_claimed_at is null or analysis_claimed_at < now() - interval '15 minutes')
      for update skip locked
   )
  returning p.*;
$$;


ALTER FUNCTION "public"."claim_feedback_post_for_review"("p_post" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."claim_feedback_posts_for_review"("p_limit" integer) RETURNS SETOF "public"."feedback_posts"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
  update public.feedback_posts p
     set analysis_claimed_at = now()
   where p.id in (
     select id from public.feedback_posts
      where (analyzed_at is null or classified_at is null)
        and merged_into_id is null
        and deleted_at is null
        and analysis_failures < 3
        and (analysis_claimed_at is null or analysis_claimed_at < now() - interval '15 minutes')
      order by created_at
      limit p_limit
      for update skip locked
   )
  returning p.*;
$$;


ALTER FUNCTION "public"."claim_feedback_posts_for_review"("p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."claim_forge_mention"("p_key" "text", "p_window_seconds" integer) RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_count integer;
begin
  insert into public.forge_mention_throttle as t (key, window_start, count)
  values (p_key, now(), 1)
  on conflict (key) do update
    set count = case
          when t.window_start < now() - make_interval(secs => p_window_seconds) then 1
          else t.count + 1
        end,
        window_start = case
          when t.window_start < now() - make_interval(secs => p_window_seconds) then now()
          else t.window_start
        end,
        updated_at = now()
  returning t.count into v_count;

  -- Ménage opportuniste : la cardinalité de la table est celle des logins de
  -- forge croisés, qu'un attaquant peut faire grossir à volonté. Une chance sur
  -- cent par appel suffit à la tenir, et ne coûte rien au chemin normal.
  if random() < 0.01 then
    delete from public.forge_mention_throttle
    where window_start < now() - interval '7 days';
  end if;

  return v_count;
end;
$$;


ALTER FUNCTION "public"."claim_forge_mention"("p_key" "text", "p_window_seconds" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cleanup_agent_run_conversation"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if not exists (
    select 1 from public.agent_runs where conversation_id = old.conversation_id
  ) then
    delete from public.agent_conversations where id = old.conversation_id;
  end if;
  return null;
end;
$$;


ALTER FUNCTION "public"."cleanup_agent_run_conversation"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_agent_turn_for_run"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  turn_id uuid := gen_random_uuid();
begin
  insert into public.agent_turns (
    id, conversation_id, run_id, status, model, reasoning_level, initiated_by,
    cost_usd, outcome, error_message, started_at, completed_at, created_at, updated_at
  ) values (
    turn_id, new.conversation_id, new.id, new.status, new.model,
    new.reasoning_level, new.created_by, new.cost_usd, new.outcome,
    new.error_message, new.started_at, new.completed_at, new.created_at, new.updated_at
  );
  if nullif(btrim(new.prompt), '') is not null then
    insert into public.agent_messages (
      conversation_id, turn_id, run_id, role, content, created_by, source, created_at
    ) values (
      new.conversation_id, turn_id, new.id, 'user', new.prompt, new.created_by,
      'initial_prompt', new.created_at
    );
  end if;
  return null;
end;
$$;


ALTER FUNCTION "public"."create_agent_turn_for_run"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."effective_plan_id"("p_user" "uuid") RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select coalesce(
    (select a.admin_override_plan_id
       from public.billing_accounts a
      where a.user_id = p_user
        and a.admin_override_plan_id is not null
        and (a.admin_override_expires_at is null
             or a.admin_override_expires_at > now())),
    (select a.stripe_plan_id
       from public.billing_accounts a
      where a.user_id = p_user
        and a.stripe_plan_id is not null
        and a.stripe_subscription_status in ('active', 'trialing', 'past_due')),
    'free')
$$;


ALTER FUNCTION "public"."effective_plan_id"("p_user" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_issue_cycle"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
declare
  owner uuid;
begin
  if new.cycle_id is not null then
    if new.status = 'triage' then
      new.cycle_id := null;
    else
      select user_id into owner from public.cycles where id = new.cycle_id;
      if owner is null or new.assignee_id is distinct from owner then
        new.cycle_id := null;
      end if;
    end if;
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."enforce_issue_cycle"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_issue_refs_same_project"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  if new.objective_id is not null and not exists (
    select 1 from public.objectives o
    where o.id = new.objective_id and o.project_id = new.project_id
  ) then
    raise exception 'L''objectif doit être dans le même projet';
  end if;

  if new.duplicate_of_id is not null and not exists (
    select 1 from public.issues i
    where i.id = new.duplicate_of_id and i.project_id = new.project_id
  ) then
    raise exception 'Le ticket dupliqué doit être dans le même projet';
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."enforce_issue_refs_same_project"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_issue_relation"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
declare
  tmp uuid;
begin
  if not exists (
    select 1 from public.issues i
    where i.id = new.source_id and i.project_id = new.project_id
  ) then
    raise exception 'La source de la relation doit être dans le même projet';
  end if;
  if not exists (
    select 1 from public.issues i
    where i.id = new.target_id and i.project_id = new.project_id
  ) then
    raise exception 'La cible de la relation doit être dans le même projet';
  end if;

  if new.type = 'related' and new.source_id > new.target_id then
    tmp := new.source_id;
    new.source_id := new.target_id;
    new.target_id := tmp;
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."enforce_issue_relation"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_one_level_subissues"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  if new.parent_id is not null then
    if new.parent_id = new.id then
      raise exception 'Une issue ne peut pas être son propre parent';
    end if;
    if exists (
      select 1 from public.issues p
      where p.id = new.parent_id and p.parent_id is not null
    ) then
      raise exception 'Imbrication limitée à un niveau';
    end if;
    if exists (
      select 1 from public.issues p
      where p.id = new.parent_id and p.project_id <> new.project_id
    ) then
      raise exception 'Le parent doit être dans le même projet';
    end if;
    if exists (select 1 from public.issues c where c.parent_id = new.id) then
      raise exception 'Cette issue a déjà des sous-issues';
    end if;
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."enforce_one_level_subissues"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ensure_agent_run_conversation"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if new.conversation_id is null then
    insert into public.agent_conversations (
      id, project_id, owner_id, title, visibility, created_at, updated_at
    ) values (
      new.id,
      new.project_id,
      new.created_by,
      new.title,
      case
        when new.routine_id is not null
          or new.chain_id is not null
          or new.pull_request_id is not null then 'project'
        else 'private'
      end,
      new.created_at,
      new.updated_at
    );
    new.conversation_id := new.id;
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."ensure_agent_run_conversation"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."feedback_votes_maintain_count"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if tg_op = 'INSERT' then
    update public.feedback_posts set vote_count = vote_count + 1 where id = new.post_id;
  elsif tg_op = 'DELETE' then
    update public.feedback_posts set vote_count = greatest(vote_count - 1, 0) where id = old.post_id;
  elsif tg_op = 'UPDATE' and new.post_id is distinct from old.post_id then
    update public.feedback_posts set vote_count = greatest(vote_count - 1, 0) where id = old.post_id;
    update public.feedback_posts set vote_count = vote_count + 1 where id = new.post_id;
  end if;
  return null;
end;
$$;


ALTER FUNCTION "public"."feedback_votes_maintain_count"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."freeze_project_id"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  if new.project_id is distinct from old.project_id then
    -- 42501 = insufficient_privilege : PostgREST le rend en 403, pas en 500.
    raise exception 'cross_project_move' using errcode = '42501';
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."freeze_project_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_admin_user_totals"("p_tz" "text" DEFAULT 'UTC'::"text") RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  with bounds as (
    select
      (now() at time zone p_tz)::date as today,
      now() - interval '7 days'       as since_7,
      now() - interval '30 days'      as since_30
  ),
  accounts as (
    select u.id, u.created_at, u.last_sign_in_at
    from auth.users u
    where u.deleted_at is null
      and coalesce(u.raw_app_meta_data->>'internal', '') <> 'true'
  ),
  raw_activity as (
    select se.user_id, (se.occurred_at at time zone p_tz)::date as day
      from public.stat_events se, bounds b
     where se.occurred_at >= b.since_30
    union
    select c.author_id, (c.created_at at time zone p_tz)::date
      from public.comments c, bounds b
     where c.author_id is not null and c.created_at >= b.since_30
    union
    select a.user_id, (a.created_at at time zone p_tz)::date
      from public.ai_usage a, bounds b
     where a.user_id is not null and a.created_at >= b.since_30
    union
    select i.created_by, (i.created_at at time zone p_tz)::date
      from public.issues i, bounds b
     where i.created_by is not null and i.created_at >= b.since_30
    union
    select acc.id, (acc.last_sign_in_at at time zone p_tz)::date
      from accounts acc, bounds b
     where acc.last_sign_in_at >= b.since_30
  ),
  -- La jointure sur `accounts` retire d'un coup les traces des comptes internes
  -- ET celles des comptes supprimés (le ledger `ai_usage` garde l'attribution).
  activity as (
    select ra.user_id, ra.day
    from raw_activity ra
    join accounts acc on acc.id = ra.user_id
  ),
  -- Projets « publics » : ceux d'un compte compté. Les tickets suivent.
  live_projects as (
    select p.id
    from public.projects p
    join accounts acc on acc.id = p.owner_id
    where p.deleted_at is null
  ),
  series as (
    select d::date as day
    from bounds b,
         generate_series(b.today - 29, b.today, interval '1 day') d
  )
  select jsonb_build_object(
    'total_users',    (select count(*) from accounts),
    'internal_users', (select count(*)
                         from auth.users u
                        where u.deleted_at is null
                          and coalesce(u.raw_app_meta_data->>'internal', '') = 'true'),
    'new_7d',         (select count(*) from accounts a, bounds b where a.created_at >= b.since_7),
    'new_30d',        (select count(*) from accounts a, bounds b where a.created_at >= b.since_30),
    'active_today',   (select count(distinct a.user_id) from activity a, bounds b where a.day = b.today),
    'active_7d',      (select count(distinct a.user_id) from activity a, bounds b where a.day > b.today - 7),
    'active_30d',     (select count(distinct a.user_id) from activity a),
    'total_projects', (select count(*) from live_projects),
    'total_issues',   (select count(*)
                         from public.issues i
                         join live_projects lp on lp.id = i.project_id),
    'days', (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'day',     s.day,
            'signups', (select count(*)
                          from accounts a
                         where (a.created_at at time zone p_tz)::date = s.day),
            'active',  (select count(distinct a.user_id) from activity a where a.day = s.day)
          )
          order by s.day
        ),
        '[]'::jsonb
      )
      from series s
    )
  );
$$;


ALTER FUNCTION "public"."get_admin_user_totals"("p_tz" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_admin_users_overview"("p_search" "text" DEFAULT NULL::"text", "p_limit" integer DEFAULT 25, "p_offset" integer DEFAULT 0) RETURNS TABLE("user_id" "uuid", "email" "text", "meta" "jsonb", "created_at" timestamp with time zone, "last_sign_in_at" timestamp with time zone, "email_confirmed_at" timestamp with time zone, "is_internal" boolean, "projects_owned" bigint, "projects_member" bigint, "issues_accessible" bigint, "issues_created" bigint, "last_activity_at" timestamp with time zone, "spent_month" numeric, "ai_calls" bigint, "reset_at" timestamp with time zone, "total_count" bigint)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  with matched as (
    select
      u.id,
      u.email::text as email,
      coalesce(u.raw_user_meta_data, '{}'::jsonb) as meta,
      u.created_at,
      u.last_sign_in_at,
      u.email_confirmed_at,
      coalesce(u.raw_app_meta_data->>'internal', '') = 'true' as is_internal
    from auth.users u
    where u.deleted_at is null
      and (
        nullif(btrim(coalesce(p_search, '')), '') is null
        or u.email ilike '%' || btrim(p_search) || '%'
        or coalesce(
             u.raw_user_meta_data->>'display_name',
             u.raw_user_meta_data->>'full_name',
             u.raw_user_meta_data->>'name',
             ''
           ) ilike '%' || btrim(p_search) || '%'
      )
  ),
  page as (
    select m.*, count(*) over () as total_count
    from matched m
    order by m.created_at desc
    limit greatest(coalesce(p_limit, 25), 0)
    offset greatest(coalesce(p_offset, 0), 0)
  )
  select
    p.id,
    p.email,
    p.meta,
    p.created_at,
    p.last_sign_in_at,
    p.email_confirmed_at,
    p.is_internal,
    counts.projects_owned,
    counts.projects_member,
    counts.issues_accessible,
    counts.issues_created,
    -- GREATEST ignore les NULL en Postgres : un compte sans activité renvoie
    -- simplement sa dernière connexion (ou NULL s'il ne s'est jamais connecté).
    greatest(p.last_sign_in_at, activity.last_at) as last_activity_at,
    spend.spent_month,
    spend.ai_calls,
    r.reset_at,
    p.total_count
  from page p
  left join lateral (
    select
      -- Projets VIVANTS : un projet soft-supprimé ne compte plus, ni pour la
      -- vue admin ni pour le signal d'onboarding « créer son premier projet ».
      (select count(*)
         from public.projects pr
        where pr.owner_id = p.id and pr.deleted_at is null) as projects_owned,
      (select count(*)
         from public.project_members pm
         join public.projects pr on pr.id = pm.project_id and pr.deleted_at is null
        where pm.user_id = p.id) as projects_member,
      -- Tickets ACCESSIBLES (projets possédés + projets rejoints) : c'est le
      -- signal que lit l'onboarding, et le « nombre de tickets » que l'admin
      -- attend en face d'un compte.
      (select count(*)
         from public.issues i
         join public.projects pr on pr.id = i.project_id and pr.deleted_at is null
        where pr.owner_id = p.id
           or exists (
                select 1 from public.project_members pm
                 where pm.project_id = pr.id and pm.user_id = p.id
              )) as issues_accessible,
      -- Tickets écrits de sa main, où qu'ils soient : sa contribution réelle.
      (select count(*)
         from public.issues i
        where i.created_by = p.id) as issues_created
  ) counts on true
  left join lateral (
    select greatest(
      (select max(se.occurred_at) from public.stat_events se where se.user_id  = p.id),
      (select max(c.created_at)   from public.comments    c  where c.author_id = p.id),
      (select max(a.created_at)   from public.ai_usage    a  where a.user_id   = p.id),
      (select max(i.created_at)   from public.issues      i  where i.created_by = p.id)
    ) as last_at
  ) activity on true
  left join lateral (
    -- Dépense du MOIS CALENDAIRE, brute. La dépense réellement comptée par le
    -- budget (fenêtre Stripe + filigrane de remise à zéro) est résolue côté
    -- route par `getUserUsage` — elle dépend du cycle de facturation.
    select
      coalesce(sum(a.cost), 0)::numeric as spent_month,
      count(*)::bigint                  as ai_calls
    from public.ai_usage a
    where a.user_id = p.id
      and a.created_at >= date_trunc('month', now())
  ) spend on true
  -- La table est un REGISTRE depuis 20261105 : une ligne par remise à zéro.
  -- Une jointure directe multiplierait donc la ligne du compte par le nombre de
  -- gestes posés — la page se mettrait à répéter les comptes et à mentir sur
  -- son total. Ce qui compte ici est la PLUS RÉCENTE, et elle seule.
  left join lateral (
    select max(q.reset_at) as reset_at
      from public.agent_quota_resets q
     where q.user_id = p.id
  ) r on true
  order by p.created_at desc;
$$;


ALTER FUNCTION "public"."get_admin_users_overview"("p_search" "text", "p_limit" integer, "p_offset" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_agent_quota_usage"("p_month_start" timestamp with time zone) RETURNS TABLE("user_id" "uuid", "spent_month" numeric, "spent_counted" numeric, "calls" bigint, "last_used_at" timestamp with time zone, "reset_at" timestamp with time zone)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select
    u.user_id,
    coalesce(sum(u.cost), 0)::numeric as spent_month,
    coalesce(
      sum(u.cost) filter (
        where u.created_at >= greatest(p_month_start, coalesce(r.reset_at, p_month_start))
      ),
      0
    )::numeric as spent_counted,
    count(*)::bigint as calls,
    max(u.created_at) as last_used_at,
    r.reset_at
  from public.ai_usage u
  left join lateral (
    select max(q.reset_at) as reset_at
      from public.agent_quota_resets q
     where q.user_id = u.user_id
  ) r on true
  where u.user_id is not null
    and u.created_at >= p_month_start
  group by u.user_id, r.reset_at
  order by spent_month desc
$$;


ALTER FUNCTION "public"."get_agent_quota_usage"("p_month_start" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_ai_cost_daily"("p_days" integer DEFAULT 30, "p_tz" "text" DEFAULT 'UTC'::"text") RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  with bounds as (
    select
      (now() at time zone p_tz)::date                       as today,
      greatest(least(coalesce(p_days, 30), 365), 1)         as span
  ),
  series as (
    select d::date as day
    from bounds b,
         generate_series(b.today - (b.span - 1), b.today, interval '1 day') d
  ),
  daily as (
    select
      (a.created_at at time zone p_tz)::date as day,
      sum(coalesce(a.cost, 0))               as cost_usd,
      count(*)                               as calls,
      count(distinct a.run_id)               as runs
    from public.ai_usage a, bounds b
    where (a.created_at at time zone p_tz)::date >= b.today - (b.span - 1)
    group by 1
  ),
  rated as (
    select
      s.day,
      coalesce(d.cost_usd, 0) as cost_usd,
      coalesce(d.calls, 0)    as calls,
      coalesce(d.runs, 0)     as runs,
      coalesce(
        (select f.usd_eur from public.fx_rates f
          where f.day <= s.day order by f.day desc limit 1),
        (select f.usd_eur from public.fx_rates f
          where f.day >  s.day order by f.day asc  limit 1)
      ) as usd_eur
    from series s
    left join daily d on d.day = s.day
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'day',      r.day,
        'cost_usd', round(r.cost_usd, 6),
        -- null (et pas 0) quand aucun taux n'est connu : « pas encore
        -- convertible » et « zéro euro » ne se confondent pas à l'écran.
        'cost_eur', case when r.usd_eur is null then null
                         else round(r.cost_usd * r.usd_eur, 6) end,
        'usd_eur',  r.usd_eur,
        'calls',    r.calls,
        'runs',     r.runs
      ) order by r.day
    ),
    '[]'::jsonb
  )
  from rated r;
$$;


ALTER FUNCTION "public"."get_ai_cost_daily"("p_days" integer, "p_tz" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_ai_run_calls"("p_run_id" "uuid") RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', id, 'seq', seq, 'feature', feature, 'model', model,
        'generation_id', generation_id, 'prompt_tokens', prompt_tokens,
        'completion_tokens', completion_tokens, 'total_tokens', total_tokens,
        'cached_tokens', cached_tokens, 'cache_write_tokens', cache_write_tokens,
        'cost', cost, 'estimated', estimated, 'created_at', created_at
      ) order by seq asc, created_at asc
    ),
    '[]'::jsonb
  )
  from public.ai_usage
  where run_id = p_run_id;
$$;


ALTER FUNCTION "public"."get_ai_run_calls"("p_run_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_ai_run_spend"("p_run_id" "uuid") RETURNS numeric
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select coalesce(sum(coalesce(cost, 0)), 0)
  from public.ai_usage
  where run_id = p_run_id;
$$;


ALTER FUNCTION "public"."get_ai_run_spend"("p_run_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_ai_usage_stats"("p_since" timestamp with time zone DEFAULT ("now"() - '30 days'::interval)) RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  with evts as (
    select * from public.ai_usage where created_at >= p_since
  ),
  -- un enregistrement par run (un run_id appartient toujours à une seule feature)
  runs as (
    select
      run_id,
      max(feature)                       as feature,
      sum(coalesce(cost, 0))             as run_cost,
      count(*)                           as run_calls,
      sum(coalesce(total_tokens, 0))     as run_tokens,
      min(created_at)                    as first_at,
      max(model)                         as model
    from evts
    group by run_id
  ),
  totals as (
    select
      coalesce(sum(coalesce(cost, 0)), 0)         as cost,
      count(*)                                    as calls,
      count(distinct run_id)                      as runs,
      coalesce(sum(coalesce(total_tokens, 0)), 0) as tokens
    from evts
  ),
  by_feature as (
    select
      f.feature,
      f.cost,
      f.calls,
      f.tokens,
      rr.runs,
      case when rr.runs > 0  then f.cost / rr.runs  else 0 end as avg_cost_per_run,
      case when f.calls > 0  then f.cost / f.calls  else 0 end as avg_cost_per_call
    from (
      select
        feature,
        coalesce(sum(coalesce(cost, 0)), 0)         as cost,
        count(*)                                    as calls,
        coalesce(sum(coalesce(total_tokens, 0)), 0) as tokens
      from evts
      group by feature
    ) f
    join (
      select feature, count(*) as runs from runs group by feature
    ) rr on rr.feature = f.feature
  )
  select jsonb_build_object(
    'since', p_since,
    'totals', (select to_jsonb(t) from totals t),
    'by_feature', coalesce(
      (select jsonb_agg(to_jsonb(bf) order by bf.cost desc) from by_feature bf),
      '[]'::jsonb
    ),
    'recent_runs', coalesce(
      (select jsonb_agg(
                jsonb_build_object(
                  'run_id', run_id, 'feature', feature, 'cost', run_cost,
                  'calls', run_calls, 'tokens', run_tokens,
                  'first_at', first_at, 'model', model
                ) order by first_at desc
              )
       from (select * from runs order by first_at desc limit 50) r),
      '[]'::jsonb
    )
  );
$$;


ALTER FUNCTION "public"."get_ai_usage_stats"("p_since" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_cycle_stats"("p_tz" "text" DEFAULT 'UTC'::"text") RETURNS "jsonb"
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
  with today as (
    select (now() at time zone p_tz)::date as d
  ),
  -- 1. Cadence : écart (jours) entre la complétion et l'échéance. due_date est
  --    un timestamptz (migration 20260707120000) : on le ramène, comme
  --    completed_at, à sa date calendaire dans p_tz pour que date - date donne
  --    un entier (et non un interval).
  completion_offsets as (
    select ((i.completed_at at time zone p_tz)::date
              - (i.due_date at time zone p_tz)::date) as offset_days
    from public.issues i
    where i.assignee_id = auth.uid()
      and i.status = 'done'
      and i.completed_at is not null
      and i.due_date is not null
  ),
  cadence as (
    select avg(offset_days)::numeric as avg_offset, count(*) as sample
    from completion_offsets
  ),
  -- 2. Tickets par cycle : moyenne sur les cycles déjà démarrés.
  started_cycles as (
    select c.id
    from public.cycles c, today
    where c.user_id = auth.uid() and c.start_date <= today.d
  ),
  per_cycle as (
    select sc.id, count(i.id) as n
    from started_cycles sc
    left join public.issues i on i.cycle_id = sc.id
    group by sc.id
  ),
  cycles_agg as (
    select avg(n)::numeric as avg_per_cycle, count(*) as cycle_count
    from per_cycle
  ),
  -- 3. Durée de complétion par effort (« cycle time » : 1er in_progress → done).
  first_started as (
    select e.issue_id, min(e.created_at) as started_at
    from public.issue_events e
    where e.field = 'status' and e.to_value = 'in_progress'
    group by e.issue_id
  ),
  durations as (
    select
      i.effort,
      extract(epoch from (i.completed_at - fs.started_at)) as secs
    from public.issues i
    join first_started fs on fs.issue_id = i.id
    where i.assignee_id = auth.uid()
      and i.status = 'done'
      and i.completed_at is not null
      and i.effort is not null
      and i.completed_at > fs.started_at
  ),
  by_effort as (
    select
      effort,
      percentile_cont(0.5) within group (order by secs)::numeric as median_seconds,
      count(*) as sample
    from durations
    group by effort
  )
  select jsonb_build_object(
    'avg_completion_offset_days', (select avg_offset from cadence),
    'completion_offset_sample', coalesce((select sample from cadence), 0),
    'avg_issues_per_cycle', (select avg_per_cycle from cycles_agg),
    'cycle_count', coalesce((select cycle_count from cycles_agg), 0),
    'by_effort', coalesce(
      (select jsonb_agg(jsonb_build_object(
                'effort', be.effort,
                'median_seconds', be.median_seconds,
                'sample', be.sample))
       from by_effort be),
      '[]'::jsonb
    )
  );
$$;


ALTER FUNCTION "public"."get_cycle_stats"("p_tz" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_user_stats"("p_tz" "text" DEFAULT 'UTC'::"text", "p_since" timestamp with time zone DEFAULT ("now"() - '371 days'::interval)) RETURNS "jsonb"
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
  with me as (
    select * from public.stat_events where user_id = auth.uid()
  ),
  issue_events as (
    select * from me where kind in ('issue_created', 'issue_completed')
  ),
  totals as (
    select
      count(*) filter (where kind = 'issue_created') as created,
      count(distinct coalesce(issue_id::text, id::text))
        filter (where kind = 'issue_completed') as completed,
      count(distinct coalesce(project_id::text, 'name:' || coalesce(project_name, ''))) as projects,
      (select count(*) from me where kind = 'scratchpad_task_completed') as tasks_completed
    from issue_events
  ),
  per_project as (
    select
      coalesce(e.project_id::text, 'name:' || coalesce(e.project_name, '')) as bucket,
      coalesce(p.name, e.project_name) as name,
      p.color as color,
      (p.id is null or p.deleted_at is not null) as deleted,
      count(*) filter (where e.kind = 'issue_created') as created,
      count(distinct coalesce(e.issue_id::text, e.id::text))
        filter (where e.kind = 'issue_completed') as completed
    from issue_events e
    left join public.projects p on p.id = e.project_id
    group by 1, 2, p.color, (p.id is null or p.deleted_at is not null)
  ),
  days as (
    select
      to_char((me.occurred_at at time zone p_tz)::date, 'YYYY-MM-DD') as date,
      count(*) as count,
      count(*) filter (where me.kind = 'issue_completed') as issues,
      count(*) filter (where me.kind = 'scratchpad_task_completed') as tasks
    from me
    where me.kind in ('issue_completed', 'scratchpad_task_completed')
      and me.occurred_at >= p_since
    group by 1
  )
  select jsonb_build_object(
    'totals', (select to_jsonb(t) from totals t),
    'per_project', coalesce(
      (select jsonb_agg(to_jsonb(pp) order by pp.completed desc, pp.created desc)
       from per_project pp),
      '[]'::jsonb
    ),
    'days', coalesce(
      (select jsonb_agg(jsonb_build_object(
         'date', d.date, 'count', d.count, 'issues', d.issues, 'tasks', d.tasks))
       from days d),
      '[]'::jsonb
    )
  );
$$;


ALTER FUNCTION "public"."get_user_stats"("p_tz" "text", "p_since" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_user_usage_history"("p_user_id" "uuid", "p_since" timestamp with time zone, "p_features" "text"[] DEFAULT NULL::"text"[], "p_limit" integer DEFAULT 25, "p_offset" integer DEFAULT 0) RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  with runs as (
    select
      u.run_id,
      -- min() : dans un run mixte agent, 'agent_code' < 'sandbox_compute' —
      -- le run garde le type que l'utilisateur reconnaît.
      min(u.feature)             as feature,
      sum(coalesce(u.cost, 0))   as cost,
      count(*)                   as calls,
      min(u.created_at)          as first_at,
      max(u.project_id::text)::uuid as project_id
    from public.ai_usage u
    where u.user_id = p_user_id
      and u.created_at >= p_since
      and (p_features is null or u.feature = any(p_features))
    group by u.run_id
  )
  select jsonb_build_object(
    'total', (select count(*) from runs),
    'entries', coalesce((
      select jsonb_agg(jsonb_build_object(
               'run_id', r.run_id,
               'feature', r.feature,
               'cost', r.cost,
               'calls', r.calls,
               'first_at', r.first_at,
               'project_id', r.project_id,
               'project_name', p.name
             ) order by r.first_at desc)
      from (
        select * from runs order by first_at desc limit p_limit offset p_offset
      ) r
      left join public.projects p on p.id = r.project_id
    ), '[]'::jsonb)
  );
$$;


ALTER FUNCTION "public"."get_user_usage_history"("p_user_id" "uuid", "p_since" timestamp with time zone, "p_features" "text"[], "p_limit" integer, "p_offset" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_user_usage_since"("p_user_id" "uuid", "p_since" timestamp with time zone) RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  with evts as (
    select feature, coalesce(cost, 0) as cost, run_id
    from public.ai_usage
    where user_id = p_user_id
      and created_at >= p_since
      and key_mode = 'platform'
  ),
  by_feature as (
    select feature,
           sum(cost)               as cost,
           count(*)                as calls,
           count(distinct run_id)  as runs
    from evts
    group by feature
  )
  select jsonb_build_object(
    'since', p_since,
    'total_cost', coalesce((select sum(cost) from evts), 0),
    'by_feature', coalesce(
      (select jsonb_agg(to_jsonb(bf) order by bf.cost desc) from by_feature bf),
      '[]'::jsonb
    )
  );
$$;


ALTER FUNCTION "public"."get_user_usage_since"("p_user_id" "uuid", "p_since" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_project_member"("project_uuid" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1 from public.project_members
    where project_id = project_uuid and user_id = auth.uid()
  );
$$;


ALTER FUNCTION "public"."is_project_member"("project_uuid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_project_owner"("project_uuid" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1 from public.projects
    where id = project_uuid and owner_id = auth.uid()
  );
$$;


ALTER FUNCTION "public"."is_project_owner"("project_uuid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."issues_sync_objective_status"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if tg_op = 'INSERT' then
    perform public.reconcile_objective_status(new.objective_id);
  elsif tg_op = 'DELETE' then
    perform public.reconcile_objective_status(old.objective_id);
  elsif new.objective_id is distinct from old.objective_id then
    perform public.reconcile_objective_status(old.objective_id);
    perform public.reconcile_objective_status(new.objective_id);
  elsif new.status is distinct from old.status
     or new.deleted_at is distinct from old.deleted_at then
    perform public.reconcile_objective_status(new.objective_id);
  end if;
  return null;
end;
$$;


ALTER FUNCTION "public"."issues_sync_objective_status"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."match_feedback_posts"("p_project_id" "uuid", "p_embedding" "extensions"."vector", "p_exclude" "uuid" DEFAULT NULL::"uuid", "p_limit" integer DEFAULT 8, "p_public_only" boolean DEFAULT false) RETURNS TABLE("id" "uuid", "title" "text", "body" "text", "status" "text", "vote_count" integer, "issue_id" "uuid", "similarity" real)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
  select p.id, p.title, p.body, p.status, p.vote_count, p.issue_id,
         (1 - (p.embedding <=> p_embedding))::real as similarity
    from public.feedback_posts p
   where p.project_id = p_project_id
     and p.embedding is not null
     and p.merged_into_id is null
     and p.deleted_at is null
     and (not p_public_only or (p.is_public and p.review_state = 'published' and p.status <> 'spam'))
     and (p_exclude is null or p.id <> p_exclude)
   order by p.embedding <=> p_embedding
   limit p_limit;
$$;


ALTER FUNCTION "public"."match_feedback_posts"("p_project_id" "uuid", "p_embedding" "extensions"."vector", "p_exclude" "uuid", "p_limit" integer, "p_public_only" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."merge_feedback_posts"("p_dup" "uuid", "p_canonical" "uuid", "p_performed_by" "text", "p_actor" "uuid" DEFAULT NULL::"uuid", "p_confidence" real DEFAULT NULL::real) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
declare
  v_dup          public.feedback_posts%rowtype;
  v_can          public.feedback_posts%rowtype;
  v_target       uuid;
  v_dropped      uuid[];
  v_moved        uuid[];
  v_repointed    uuid[];
  v_event        uuid;
begin
  if p_performed_by not in ('ai', 'team') then
    raise exception 'feedback_merge_invalid_performer';
  end if;

  -- Résolution un saut vers le haut si la cible est elle-même tombstonée
  -- (l'aplatissement garantit une profondeur ≤ 1).
  select coalesce(merged_into_id, id) into v_target
    from public.feedback_posts where id = p_canonical;
  if v_target is null then raise exception 'feedback_merge_target_not_found'; end if;
  if v_target = p_dup then raise exception 'feedback_merge_self'; end if;

  -- Locks ordonnés par id (anti-deadlock).
  if p_dup < v_target then
    select * into v_dup from public.feedback_posts where id = p_dup for update;
    select * into v_can from public.feedback_posts where id = v_target for update;
  else
    select * into v_can from public.feedback_posts where id = v_target for update;
    select * into v_dup from public.feedback_posts where id = p_dup for update;
  end if;

  if v_dup.id is null then raise exception 'feedback_merge_dup_not_found'; end if;
  if v_can.id is null then raise exception 'feedback_merge_target_not_found'; end if;
  if v_dup.project_id <> v_can.project_id then raise exception 'feedback_merge_cross_project'; end if;
  if v_dup.merged_into_id is not null then raise exception 'feedback_merge_dup_already_merged'; end if;
  if v_can.merged_into_id is not null then raise exception 'feedback_merge_target_merged'; end if;
  -- Un post promu en issue ne peut pas être absorbé (il reste cible valide).
  if v_dup.issue_id is not null then raise exception 'feedback_merge_dup_promoted'; end if;

  -- Votes présents des deux côtés : dédupliqués (supprimés côté doublon).
  select coalesce(array_agg(v.user_id), '{}') into v_dropped
    from public.feedback_votes v
   where v.post_id = p_dup
     and exists (
       select 1 from public.feedback_votes c
        where c.post_id = v_target and c.user_id = v.user_id
     );

  delete from public.feedback_votes
   where post_id = p_dup and user_id = any(v_dropped);

  -- Le reste migre (le trigger maintient les deux compteurs).
  with moved as (
    update public.feedback_votes set post_id = v_target
     where post_id = p_dup
    returning user_id
  )
  select coalesce(array_agg(user_id), '{}') into v_moved from moved;

  -- Aplatissement : tout ce qui pointait vers le doublon repointe la cible.
  with rp as (
    update public.feedback_posts set merged_into_id = v_target
     where merged_into_id = p_dup
    returning id
  )
  select coalesce(array_agg(id), '{}') into v_repointed from rp;

  -- Les suggestions visant le doublon deviennent caduques (non restaurées à
  -- l'undo : l'analyseur les régénère).
  update public.feedback_posts
     set suggested_merge_into_id = null, suggested_confidence = null
   where suggested_merge_into_id = p_dup;

  -- Tombstone.
  update public.feedback_posts
     set merged_into_id = v_target,
         suggested_merge_into_id = null,
         suggested_confidence = null
   where id = p_dup;

  insert into public.feedback_merge_events
    (project_id, kind, dup_id, canonical_id, performed_by, actor_id, confidence, payload)
  values
    (v_dup.project_id, 'post', p_dup, v_target, p_performed_by, p_actor, p_confidence,
     jsonb_build_object(
       'moved_vote_user_ids',   to_jsonb(v_moved),
       'dropped_vote_user_ids', to_jsonb(v_dropped),
       'repointed_chain_ids',   to_jsonb(v_repointed)
     ))
  returning id into v_event;

  return v_event;
end;
$$;


ALTER FUNCTION "public"."merge_feedback_posts"("p_dup" "uuid", "p_canonical" "uuid", "p_performed_by" "text", "p_actor" "uuid", "p_confidence" real) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."next_issue_number"("p_project_id" "uuid") RETURNS integer
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  update public.projects
     set issue_seq = issue_seq + 1
   where id = p_project_id
  returning issue_seq;
$$;


ALTER FUNCTION "public"."next_issue_number"("p_project_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."next_issue_numbers"("p_project_id" "uuid", "p_count" integer) RETURNS integer
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  update public.projects
     set issue_seq = issue_seq + greatest(p_count, 0)
   where id = p_project_id
  returning issue_seq - greatest(p_count, 0) + 1;
$$;


ALTER FUNCTION "public"."next_issue_numbers"("p_project_id" "uuid", "p_count" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."orphan_attachment_objects"("p_before" timestamp with time zone, "p_limit" integer DEFAULT 500) RETURNS TABLE("name" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select o.name
  from storage.objects o
  where o.bucket_id = 'attachments'
    and o.created_at < p_before
    and (storage.foldername(o.name))[1] = 'projects'
    and not exists (select 1 from public.attachments a where a.storage_path = o.name)
    and not exists (select 1 from public.page_files f where f.storage_path = o.name)
  order by o.created_at
  limit p_limit
$$;


ALTER FUNCTION "public"."orphan_attachment_objects"("p_before" timestamp with time zone, "p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."project_storage_quota_ok"("p_project" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select public.storage_quota_ok(
    (select p.owner_id from public.projects p where p.id = p_project))
$$;


ALTER FUNCTION "public"."project_storage_quota_ok"("p_project" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."purge_dormant_feedback_identities"("p_before" timestamp with time zone, "p_limit" integer DEFAULT 500) RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_deleted integer;
begin
  with dormant as (
    select u.id
      from public.feedback_users u
     where u.created_at < p_before
       and not exists (select 1 from public.feedback_posts p where p.author_id = u.id)
       and not exists (select 1 from public.feedback_votes v where v.user_id = u.id)
       and not exists (select 1 from public.comments c where c.feedback_user_id = u.id)
       and not exists (
         select 1 from public.feedback_sessions s
          where s.user_id = u.id and s.expires_at > now()
       )
       -- Protège l'undo de fusion : `feedback_merge_events.payload` garde des
       -- uuid d'identités que `undo_feedback_merge` réinsère dans
       -- `feedback_votes`. Une identité citée par une fusion non défaite ferait
       -- échouer l'undo sur la clé étrangère — elle attend son tour.
       and not exists (
         select 1 from public.feedback_merge_events e
          where e.undone_at is null
            and (
              e.payload->'moved_vote_user_ids'      @> to_jsonb(u.id::text)
              or e.payload->'dropped_vote_user_ids' @> to_jsonb(u.id::text)
            )
       )
     limit p_limit
  )
  delete from public.feedback_users u using dormant d where u.id = d.id;
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;


ALTER FUNCTION "public"."purge_dormant_feedback_identities"("p_before" timestamp with time zone, "p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reconcile_objective_status"("obj_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  total   int;
  started int;
  closed  int;
  derived text;
begin
  if obj_id is null then
    return;
  end if;

  select
    count(*),
    count(*) filter (where status not in ('triage', 'backlog', 'todo')),
    count(*) filter (where status in ('done', 'canceled', 'duplicate'))
  into total, started, closed
  from public.issues
  where objective_id = obj_id
    and deleted_at is null;

  if total = 0 then
    derived := 'planned';
  elsif closed = total then
    derived := 'done';
  elsif started > 0 then
    derived := 'in_progress';
  else
    derived := 'planned';
  end if;

  -- No-op (no broadcast) when unchanged; leave a manually-canceled objective be.
  update public.objectives
     set status = derived
   where id = obj_id
     and status <> derived
     and status <> 'canceled';
end;
$$;


ALTER FUNCTION "public"."reconcile_objective_status"("obj_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."search_pages"("p_query" "text", "p_project_id" "uuid" DEFAULT NULL::"uuid", "p_limit" integer DEFAULT 20) RETURNS TABLE("id" "uuid", "project_id" "uuid", "parent_id" "uuid", "title" "text", "icon" "text", "updated_at" timestamp with time zone, "excerpt" "text", "rank" real)
    LANGUAGE "sql" STABLE
    AS $$
  with q as (select websearch_to_tsquery('simple', coalesce(p_query, '')) as tsq)
  select
    p.id,
    p.project_id,
    p.parent_id,
    p.title,
    p.icon,
    p.updated_at,
    -- Sans balise de surlignage : l'extrait est lu dans une ligne de palette et
    -- dans un résultat d'outil, deux surfaces qui ne rendent pas de HTML.
    ts_headline(
      'simple',
      p.search_text,
      q.tsq,
      'StartSel="", StopSel="", MaxWords=22, MinWords=8, ShortWord=2, MaxFragments=1, FragmentDelimiter=" … "'
    ) as excerpt,
    ts_rank_cd(p.search_tsv, q.tsq) as rank
  from public.pages p, q
  where p.deleted_at is null
    and (p_project_id is null or p.project_id = p_project_id)
    and p.search_tsv @@ q.tsq
  order by rank desc, p.updated_at desc
  limit greatest(1, least(coalesce(p_limit, 20), 50));
$$;


ALTER FUNCTION "public"."search_pages"("p_query" "text", "p_project_id" "uuid", "p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."storage_quota_ok"("p_user" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select p_user is not null
     and public.account_storage_bytes(p_user) < coalesce(
           (select q.bytes from public.plan_storage_quotas q
             where q.plan_id = public.effective_plan_id(p_user)),
           (select q.bytes from public.plan_storage_quotas q where q.plan_id = 'free'),
           0)
$$;


ALTER FUNCTION "public"."storage_quota_ok"("p_user" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_agent_run_conversation"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  update public.agent_conversations
  set title = case
        when tg_op = 'INSERT' or new.title is distinct from old.title then new.title
        else title
      end,
      updated_at = greatest(updated_at, new.updated_at)
  where id = new.conversation_id;

  if new.issue_id is not null then
    insert into public.agent_conversation_contexts (conversation_id, kind, resource_id, role)
    values (new.conversation_id, 'issue', new.issue_id, 'primary')
    on conflict (conversation_id, kind, resource_id) do nothing;
  end if;
  if new.pull_request_id is not null then
    insert into public.agent_conversation_contexts (conversation_id, kind, resource_id, role)
    values (new.conversation_id, 'pull_request', new.pull_request_id, 'primary')
    on conflict (conversation_id, kind, resource_id) do nothing;
  end if;
  return null;
end;
$$;


ALTER FUNCTION "public"."sync_agent_run_conversation"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_agent_runtime_from_run"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  insert into public.agent_runtime_sessions (
    conversation_id, current_run_id, repo_link_id, connection_id, base_branch,
    work_branch, sandbox_id, checkpoint, engine, execution, local_worktree,
    provider_key_id, last_activity_at, sandbox_stopped_at, created_at, updated_at
  ) values (
    new.conversation_id, new.id, new.repo_link_id, new.connection_id,
    new.base_branch, new.branch_name, new.sandbox_id, new.checkpoint,
    new.agent_engine, case when new.local_exec then 'local' else 'cloud' end,
    new.local_worktree, new.provider_key_id, new.last_activity_at,
    new.sandbox_stopped_at, new.created_at, new.updated_at
  ) on conflict (conversation_id) do update set
    current_run_id = excluded.current_run_id,
    repo_link_id = excluded.repo_link_id,
    connection_id = excluded.connection_id,
    base_branch = excluded.base_branch,
    work_branch = excluded.work_branch,
    sandbox_id = excluded.sandbox_id,
    checkpoint = excluded.checkpoint,
    engine = excluded.engine,
    execution = excluded.execution,
    local_worktree = excluded.local_worktree,
    provider_key_id = excluded.provider_key_id,
    last_activity_at = excluded.last_activity_at,
    sandbox_stopped_at = excluded.sandbox_stopped_at,
    updated_at = excluded.updated_at;

  if new.branch_name is not null then
    insert into public.agent_artifacts (
      conversation_id, run_id, kind, ref, created_at, updated_at
    ) values (
      new.conversation_id, new.id, 'branch', new.branch_name, new.created_at, new.updated_at
    ) on conflict (conversation_id, kind, ref) do update
      set run_id = excluded.run_id, updated_at = excluded.updated_at;
  end if;
  if new.pr_number is not null then
    insert into public.agent_artifacts (
      conversation_id, run_id, kind, ref, url, state, created_at, updated_at
    ) values (
      new.conversation_id, new.id, 'pull_request', new.pr_number::text,
      new.pr_url, new.pr_state, new.created_at, new.updated_at
    ) on conflict (conversation_id, kind, ref) do update
      set run_id = excluded.run_id, url = excluded.url,
          state = excluded.state, updated_at = excluded.updated_at;
  end if;
  return null;
end;
$$;


ALTER FUNCTION "public"."sync_agent_runtime_from_run"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_agent_turn_from_run"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  turn_id uuid;
  new_turn_id uuid;
begin
  -- Se reveiller apres un etat terminal = nouvelle demande naturelle. Une
  -- requeue running -> queued reste un detail d'execution du tour courant.
  if old.status in ('completed', 'failed', 'canceled') and new.status = 'queued' then
    insert into public.agent_turns (
      conversation_id, run_id, status, model, reasoning_level, initiated_by,
      cost_usd, created_at, updated_at
    ) values (
      new.conversation_id, new.id, new.status, new.model, new.reasoning_level,
      new.created_by, 0, now(), now()
    ) returning id into new_turn_id;

    -- Course fin-de-tour : /steer peut inserer son message pendant que le run
    -- est encore `running`, puis constater `completed` et le re-queue. Le
    -- trigger de capture l'a alors provisoirement rattache au tour precedent.
    -- Tout message encore non consomme est precisement la demande qui doit
    -- ouvrir ce nouveau tour : on repare son rattachement dans la meme
    -- transaction que la transition terminale -> queued.
    update public.agent_messages am
    set turn_id = new_turn_id
    where am.run_id = new.id
      and am.legacy_queue_message_id in (
        select qm.id
        from public.agent_run_messages qm
        where qm.run_id = new.id and qm.consumed_at is null
      );
  else
    select t.id into turn_id
    from public.agent_turns t
    where t.run_id = new.id
    order by t.created_at desc, t.id desc
    limit 1;
    update public.agent_turns
    set status = new.status,
        model = new.model,
        reasoning_level = new.reasoning_level,
        cost_usd = agent_turns.cost_usd + greatest(0, new.cost_usd - old.cost_usd),
        outcome = new.outcome,
        error_message = new.error_message,
        started_at = coalesce(started_at, new.started_at),
        completed_at = new.completed_at,
        updated_at = new.updated_at
    where id = turn_id;
  end if;
  return null;
end;
$$;


ALTER FUNCTION "public"."sync_agent_turn_from_run"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."topic_uuid"("topic" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" IMMUTABLE PARALLEL SAFE
    AS $$
begin
  return split_part(topic, ':', 2)::uuid;
exception when others then
  return null;
end;
$$;


ALTER FUNCTION "public"."topic_uuid"("topic" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."undo_feedback_merge"("p_event" "uuid", "p_actor" "uuid" DEFAULT NULL::"uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
declare
  v_ev             public.feedback_merge_events%rowtype;
  v_state          uuid;
  v_moved          uuid[];
  v_dropped        uuid[];
  v_repointed      uuid[];
begin
  select * into v_ev from public.feedback_merge_events where id = p_event for update;
  if v_ev.id is null then raise exception 'feedback_undo_not_found'; end if;
  if v_ev.undone_at is not null then raise exception 'feedback_undo_already_undone'; end if;
  -- Les facettes ayant été retirées (MIN-50), seuls les merges de posts se défont.
  if v_ev.kind <> 'post' then raise exception 'feedback_undo_unsupported_kind'; end if;

  v_moved     := array(select jsonb_array_elements_text(v_ev.payload->'moved_vote_user_ids'))::uuid[];
  v_dropped   := array(select jsonb_array_elements_text(v_ev.payload->'dropped_vote_user_ids'))::uuid[];
  v_repointed := array(select jsonb_array_elements_text(v_ev.payload->'repointed_chain_ids'))::uuid[];

  -- Lock des deux posts, ordonnés par id.
  if v_ev.dup_id < v_ev.canonical_id then
    perform 1 from public.feedback_posts where id = v_ev.dup_id for update;
    perform 1 from public.feedback_posts where id = v_ev.canonical_id for update;
  else
    perform 1 from public.feedback_posts where id = v_ev.canonical_id for update;
    perform 1 from public.feedback_posts where id = v_ev.dup_id for update;
  end if;

  select merged_into_id into v_state from public.feedback_posts where id = v_ev.dup_id;
  if v_state is distinct from v_ev.canonical_id then
    -- La canonique a été mergée depuis (le doublon a été repointé) : undo
    -- LIFO uniquement — défaire d'abord le merge le plus récent.
    raise exception 'feedback_undo_stale';
  end if;

  -- Votes déplacés : reviennent s'ils existent encore (un unvote post-merge
  -- vaut pour le concept fusionné et n'est pas ressuscité).
  update public.feedback_votes set post_id = v_ev.dup_id
   where post_id = v_ev.canonical_id and user_id = any(v_moved);

  -- Votes dédupliqués : leur voix sur le doublon était indépendante.
  insert into public.feedback_votes (post_id, user_id)
  select v_ev.dup_id, u from unnest(v_dropped) as u
  on conflict do nothing;

  -- Dé-tombstone sans re-rentrer dans la file d'analyse.
  update public.feedback_posts
     set merged_into_id = null,
         analyzed_at = coalesce(analyzed_at, now())
   where id = v_ev.dup_id;

  update public.feedback_posts set merged_into_id = v_ev.dup_id
   where id = any(v_repointed) and merged_into_id = v_ev.canonical_id;

  -- Mémoire anti-récidive : la paire ne sera plus re-mergée ni re-suggérée.
  insert into public.feedback_merge_rejections (dup_id, canonical_id, project_id, kind, rejected_by)
  values (v_ev.dup_id, v_ev.canonical_id, v_ev.project_id, v_ev.kind, p_actor)
  on conflict do nothing;

  update public.feedback_merge_events
     set undone_at = now(), undone_by = p_actor
   where id = p_event;
end;
$$;


ALTER FUNCTION "public"."undo_feedback_merge"("p_event" "uuid", "p_actor" "uuid") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."agent_artifacts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "conversation_id" "uuid" NOT NULL,
    "run_id" "uuid",
    "kind" "text" NOT NULL,
    "ref" "text" NOT NULL,
    "url" "text",
    "state" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "agent_artifacts_kind_check" CHECK (("kind" = ANY (ARRAY['branch'::"text", 'pull_request'::"text"])))
);


ALTER TABLE "public"."agent_artifacts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."agent_chains" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "project_id" "uuid" NOT NULL,
    "issue_id" "uuid" NOT NULL,
    "owner_id" "uuid" NOT NULL,
    "preset" "text",
    "status" "text" DEFAULT 'running'::"text" NOT NULL,
    "step" integer DEFAULT 0 NOT NULL,
    "played_rule_ids" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "retries" integer DEFAULT 0 NOT NULL,
    "spent_usd" numeric(12,6) DEFAULT 0 NOT NULL,
    "budget_usd" numeric(12,6),
    "stop_reason" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "not_before" timestamp with time zone,
    "pending_event" "jsonb",
    CONSTRAINT "agent_chains_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'running'::"text", 'awaiting_human'::"text", 'stopped'::"text", 'completed'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."agent_chains" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."agent_conversation_contexts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "conversation_id" "uuid" NOT NULL,
    "kind" "text" NOT NULL,
    "resource_id" "uuid" NOT NULL,
    "role" "text" DEFAULT 'reference'::"text" NOT NULL,
    "snapshot" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "agent_conversation_contexts_kind_check" CHECK (("kind" = ANY (ARRAY['issue'::"text", 'pull_request'::"text", 'page'::"text", 'feedback'::"text", 'resource'::"text"]))),
    CONSTRAINT "agent_conversation_contexts_role_check" CHECK (("role" = ANY (ARRAY['primary'::"text", 'reference'::"text"])))
);


ALTER TABLE "public"."agent_conversation_contexts" OWNER TO "postgres";


COMMENT ON TABLE "public"."agent_conversation_contexts" IS 'Ressources facultatives et multiples donnees en contexte. Aucune ne decide de la visibilite ni des capacites de l agent.';



CREATE TABLE IF NOT EXISTS "public"."agent_conversation_pins" (
    "user_id" "uuid" NOT NULL,
    "conversation_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."agent_conversation_pins" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."agent_conversation_reads" (
    "user_id" "uuid" NOT NULL,
    "conversation_id" "uuid" NOT NULL,
    "last_read_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."agent_conversation_reads" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."agent_conversations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "project_id" "uuid" NOT NULL,
    "owner_id" "uuid",
    "title" "text",
    "visibility" "text" DEFAULT 'private'::"text" NOT NULL,
    "archived_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "agent_conversations_title_length" CHECK ((("title" IS NULL) OR ("char_length"("title") <= 200))),
    CONSTRAINT "agent_conversations_visibility_check" CHECK (("visibility" = ANY (ARRAY['private'::"text", 'project'::"text"])))
);


ALTER TABLE "public"."agent_conversations" OWNER TO "postgres";


COMMENT ON TABLE "public"."agent_conversations" IS 'Identite durable d une conversation avec l agent de code. Son contexte, ses executions et sa visibilite sont des dimensions independantes.';



CREATE TABLE IF NOT EXISTS "public"."agent_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "conversation_id" "uuid" NOT NULL,
    "turn_id" "uuid",
    "run_id" "uuid",
    "role" "text" NOT NULL,
    "content" "text" NOT NULL,
    "created_by" "uuid",
    "source" "text" NOT NULL,
    "legacy_queue_message_id" "uuid",
    "legacy_event_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "agent_messages_non_empty" CHECK (("char_length"("content") > 0)),
    CONSTRAINT "agent_messages_role_check" CHECK (("role" = ANY (ARRAY['user'::"text", 'assistant'::"text", 'system'::"text"]))),
    CONSTRAINT "agent_messages_source_check" CHECK (("source" = ANY (ARRAY['initial_prompt'::"text", 'steering'::"text", 'assistant_summary'::"text", 'system'::"text"])))
);


ALTER TABLE "public"."agent_messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."agent_quota_resets" (
    "user_id" "uuid" NOT NULL,
    "reset_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "reset_by" "uuid",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL
);


ALTER TABLE "public"."agent_quota_resets" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."agent_routines" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "project_id" "uuid" NOT NULL,
    "owner_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "prompt" "text" NOT NULL,
    "model" "text",
    "reasoning_level" "text" DEFAULT 'medium'::"text" NOT NULL,
    "base_branch" "text",
    "frequency" "text" NOT NULL,
    "hour" integer DEFAULT 9 NOT NULL,
    "minute" integer DEFAULT 0 NOT NULL,
    "timezone" "text" DEFAULT 'UTC'::"text" NOT NULL,
    "enabled" boolean DEFAULT true NOT NULL,
    "next_run_at" timestamp with time zone,
    "last_run_at" timestamp with time zone,
    "last_error" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "weekdays" smallint[] DEFAULT '{}'::smallint[] NOT NULL,
    "days_of_month" smallint[] DEFAULT '{}'::smallint[] NOT NULL,
    "max_spend_percent" integer DEFAULT 15 NOT NULL,
    "deleted_at" timestamp with time zone,
    "deleted_by" "uuid",
    CONSTRAINT "agent_routines_days_of_month_check" CHECK (("days_of_month" <@ ARRAY[(1)::smallint, (2)::smallint, (3)::smallint, (4)::smallint, (5)::smallint, (6)::smallint, (7)::smallint, (8)::smallint, (9)::smallint, (10)::smallint, (11)::smallint, (12)::smallint, (13)::smallint, (14)::smallint, (15)::smallint, (16)::smallint, (17)::smallint, (18)::smallint, (19)::smallint, (20)::smallint, (21)::smallint, (22)::smallint, (23)::smallint, (24)::smallint, (25)::smallint, (26)::smallint, (27)::smallint, (28)::smallint, (29)::smallint, (30)::smallint, (31)::smallint])),
    CONSTRAINT "agent_routines_frequency_check" CHECK (("frequency" = ANY (ARRAY['daily'::"text", 'weekly'::"text", 'monthly'::"text"]))),
    CONSTRAINT "agent_routines_hour_check" CHECK ((("hour" >= 0) AND ("hour" <= 23))),
    CONSTRAINT "agent_routines_max_spend_percent_check" CHECK ((("max_spend_percent" >= 1) AND ("max_spend_percent" <= 100))),
    CONSTRAINT "agent_routines_minute_check" CHECK ((("minute" >= 0) AND ("minute" <= 59))),
    CONSTRAINT "agent_routines_weekdays_check" CHECK (("weekdays" <@ ARRAY[(0)::smallint, (1)::smallint, (2)::smallint, (3)::smallint, (4)::smallint, (5)::smallint, (6)::smallint]))
);


ALTER TABLE "public"."agent_routines" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."agent_run_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "run_id" "uuid" NOT NULL,
    "seq" integer NOT NULL,
    "type" "text" NOT NULL,
    "payload" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "agent_run_events_type_check" CHECK (("type" = ANY (ARRAY['status'::"text", 'thinking'::"text", 'tool_call'::"text", 'tool_result'::"text", 'commit'::"text", 'pr_opened'::"text", 'error'::"text", 'summary'::"text", 'user_message'::"text", 'plan_update'::"text", 'files_changed'::"text", 'question'::"text", 'quota_exhausted'::"text"])))
);


ALTER TABLE "public"."agent_run_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."agent_run_journal" (
    "id" bigint NOT NULL,
    "run_id" "uuid" NOT NULL,
    "session_id" "text" NOT NULL,
    "events" "jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."agent_run_journal" OWNER TO "postgres";


COMMENT ON TABLE "public"."agent_run_journal" IS 'MIN-286 — journal d''événements d''une session opencode, en append. Réassemblé dans l''ordre de `id` pour rejouer la session sur une microVM neuve. Le pointeur (session courante + curseur de seq) vit dans agent_runs.checkpoint.opencode.';



CREATE SEQUENCE IF NOT EXISTS "public"."agent_run_journal_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."agent_run_journal_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."agent_run_journal_id_seq" OWNED BY "public"."agent_run_journal"."id";



CREATE TABLE IF NOT EXISTS "public"."agent_run_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "run_id" "uuid" NOT NULL,
    "content" "text" NOT NULL,
    "created_by" "uuid",
    "consumed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "mentions" "jsonb"
);


ALTER TABLE "public"."agent_run_messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."agent_runtime_sessions" (
    "conversation_id" "uuid" NOT NULL,
    "current_run_id" "uuid",
    "repo_link_id" "uuid",
    "connection_id" "uuid",
    "base_branch" "text",
    "work_branch" "text",
    "sandbox_id" "text",
    "checkpoint" "jsonb",
    "engine" "text",
    "execution" "text" DEFAULT 'cloud'::"text" NOT NULL,
    "local_worktree" boolean DEFAULT false NOT NULL,
    "provider_key_id" "text",
    "last_activity_at" timestamp with time zone,
    "sandbox_stopped_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "agent_runtime_sessions_execution_check" CHECK (("execution" = ANY (ARRAY['cloud'::"text", 'local'::"text"])))
);


ALTER TABLE "public"."agent_runtime_sessions" OWNER TO "postgres";


COMMENT ON TABLE "public"."agent_runtime_sessions" IS 'Workspace et memoire technique durables d une conversation. Jamais utilises pour decider de sa visibilite ou de ses contextes.';



CREATE TABLE IF NOT EXISTS "public"."agent_session_reads" (
    "user_id" "uuid" NOT NULL,
    "issue_id" "uuid" NOT NULL,
    "last_read_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."agent_session_reads" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."agent_turns" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "conversation_id" "uuid" NOT NULL,
    "run_id" "uuid" NOT NULL,
    "status" "text" NOT NULL,
    "model" "text",
    "reasoning_level" "text",
    "initiated_by" "uuid",
    "cost_usd" numeric DEFAULT 0 NOT NULL,
    "outcome" "text",
    "error_message" "text",
    "started_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "agent_turns_cost_usd_check" CHECK (("cost_usd" >= (0)::numeric)),
    CONSTRAINT "agent_turns_status_check" CHECK (("status" = ANY (ARRAY['queued'::"text", 'running'::"text", 'completed'::"text", 'failed'::"text", 'canceled'::"text"])))
);


ALTER TABLE "public"."agent_turns" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ai_usage" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "run_id" "uuid" NOT NULL,
    "seq" integer DEFAULT 0 NOT NULL,
    "feature" "text" NOT NULL,
    "model" "text",
    "provider" "text" DEFAULT 'openrouter'::"text" NOT NULL,
    "generation_id" "text",
    "prompt_tokens" integer,
    "completion_tokens" integer,
    "total_tokens" integer,
    "cost" numeric(12,6),
    "user_id" "uuid",
    "project_id" "uuid",
    "conversation_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "billed_reason" "text",
    "estimated" boolean DEFAULT false NOT NULL,
    "cached_tokens" integer,
    "cache_write_tokens" integer,
    "key_mode" "text" DEFAULT 'platform'::"text" NOT NULL,
    CONSTRAINT "ai_usage_billed_reason_check" CHECK (("billed_reason" = ANY (ARRAY['trigger'::"text", 'project_owner'::"text", 'platform'::"text", 'unattributed'::"text"]))),
    CONSTRAINT "ai_usage_cost_non_negative" CHECK ((("cost" IS NULL) OR ("cost" >= (0)::numeric))),
    CONSTRAINT "ai_usage_feature_check" CHECK (("feature" = ANY (ARRAY['numo_chat'::"text", 'numo_comment'::"text", 'dictation'::"text", 'transcription'::"text", 'smart_assign'::"text", 'smart_fill'::"text", 'feedback_classify'::"text", 'feedback_analyze'::"text", 'embedding'::"text", 'agent_code'::"text", 'sandbox_compute'::"text", 'web_search'::"text", 'pr_review'::"text", 'import_map'::"text", 'landing_demo'::"text", 'brief_split'::"text", 'feedback_voice'::"text", 'routine_code'::"text", 'routine_compute'::"text"]))),
    CONSTRAINT "ai_usage_key_mode_check" CHECK (("key_mode" = ANY (ARRAY['platform'::"text", 'byok'::"text"])))
);


ALTER TABLE "public"."ai_usage" OWNER TO "postgres";


COMMENT ON COLUMN "public"."ai_usage"."billed_reason" IS 'Pourquoi cette ligne est imputée à user_id (MIN-131, MIN-150). null = ligne antérieure à la colonne.';



CREATE TABLE IF NOT EXISTS "public"."api_keys" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "key_hash" "text" NOT NULL,
    "key_prefix" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_used_at" timestamp with time zone,
    "revoked_at" timestamp with time zone,
    "agent" "text",
    "oauth_client_id" "text"
);


ALTER TABLE "public"."api_keys" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."app_config" (
    "key" "text" NOT NULL,
    "value" "text" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."app_config" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."assistant_active_conversation" (
    "user_id" "uuid" NOT NULL,
    "conversation_id" "uuid" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."assistant_active_conversation" OWNER TO "postgres";


COMMENT ON TABLE "public"."assistant_active_conversation" IS 'La conversation Numo ouverte pour cet utilisateur (MIN-353). Une ligne par utilisateur : la portée (projet ou global) est portée par la conversation elle-même, pas par ce pointeur. Absence de ligne = aucune conversation ouverte (le panneau part d''un écran vide).';



CREATE TABLE IF NOT EXISTS "public"."assistant_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "conversation_id" "uuid" NOT NULL,
    "role" "text" NOT NULL,
    "content" "text",
    "tool_calls" "jsonb",
    "tool_call_id" "text",
    "tool_name" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "context" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "assistant_messages_role_check" CHECK (("role" = ANY (ARRAY['user'::"text", 'assistant'::"text", 'system'::"text", 'tool'::"text"])))
);


ALTER TABLE "public"."assistant_messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."attachments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "project_id" "uuid" NOT NULL,
    "issue_id" "uuid",
    "comment_id" "uuid",
    "storage_path" "text",
    "file_name" "text" NOT NULL,
    "mime_type" "text" DEFAULT 'application/octet-stream'::"text" NOT NULL,
    "size_bytes" bigint DEFAULT 0 NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "objective_id" "uuid",
    "feedback_post_id" "uuid",
    "kind" "text" DEFAULT 'file'::"text" NOT NULL,
    "url" "text",
    "icon_data_url" "text",
    "page_id" "uuid",
    CONSTRAINT "attachments_kind_ck" CHECK (
CASE "kind"
    WHEN 'file'::"text" THEN (("storage_path" IS NOT NULL) AND ("url" IS NULL) AND ("page_id" IS NULL))
    WHEN 'link'::"text" THEN (("url" IS NOT NULL) AND ("storage_path" IS NULL) AND ("page_id" IS NULL))
    WHEN 'page'::"text" THEN (("page_id" IS NOT NULL) AND ("storage_path" IS NULL) AND ("url" IS NULL))
    ELSE false
END),
    CONSTRAINT "attachments_parent_ck" CHECK (("num_nonnulls"("issue_id", "objective_id", "feedback_post_id") = 1))
);


ALTER TABLE "public"."attachments" OWNER TO "postgres";


COMMENT ON COLUMN "public"."attachments"."kind" IS 'file = objet dans le bucket attachments ; link = URL externe (MIN-184) ; page = page du wiki du projet (MIN-275).';



COMMENT ON COLUMN "public"."attachments"."url" IS 'URL http(s) du lien ; null pour un fichier.';



COMMENT ON COLUMN "public"."attachments"."icon_data_url" IS 'Favicon du lien en data URI (image WebP 32 px, ~1-2 Ko) ; null si absent.';



COMMENT ON COLUMN "public"."attachments"."page_id" IS 'Page du projet référencée ; null hors ressource de genre page (MIN-275).';



CREATE TABLE IF NOT EXISTS "public"."billing_accounts" (
    "user_id" "uuid" NOT NULL,
    "email" "text",
    "admin_override_plan_id" "text",
    "admin_override_note" "text",
    "stripe_customer_id" "text",
    "stripe_subscription_id" "text",
    "stripe_price_id" "text",
    "stripe_plan_id" "text",
    "stripe_subscription_status" "text",
    "stripe_current_period_start" timestamp with time zone,
    "stripe_current_period_end" timestamp with time zone,
    "stripe_cancel_at_period_end" boolean DEFAULT false NOT NULL,
    "stripe_checkout_session_id" "text",
    "stripe_last_event_id" "text",
    "stripe_last_event_created" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "admin_override_expires_at" timestamp with time zone
);


ALTER TABLE "public"."billing_accounts" OWNER TO "postgres";


COMMENT ON COLUMN "public"."billing_accounts"."admin_override_expires_at" IS 'Fin du plan offert par un admin (null = sans limite). Passée, l''override est ignoré à la résolution.';



CREATE TABLE IF NOT EXISTS "public"."categories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "project_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "color" "text" DEFAULT '#6b7280'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."categories" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."comments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "issue_id" "uuid",
    "author_id" "uuid",
    "body" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "parent_id" "uuid",
    "via_assistant" boolean DEFAULT false NOT NULL,
    "assistant_status" "text",
    "assistant_tool" "text",
    "via_mcp" boolean DEFAULT false NOT NULL,
    "api_key_id" "uuid",
    "objective_id" "uuid",
    "feedback_post_id" "uuid",
    "visibility" "text" DEFAULT 'internal'::"text" NOT NULL,
    "feedback_user_id" "uuid",
    CONSTRAINT "comments_assistant_status_check" CHECK (("assistant_status" = ANY (ARRAY['working'::"text", 'done'::"text", 'error'::"text"]))),
    CONSTRAINT "comments_parent_ck" CHECK (("num_nonnulls"("issue_id", "objective_id", "feedback_post_id") = 1)),
    CONSTRAINT "comments_public_author_ck" CHECK ((("feedback_user_id" IS NULL) OR (("feedback_post_id" IS NOT NULL) AND ("visibility" = 'public'::"text")))),
    CONSTRAINT "comments_visibility_ck" CHECK (("visibility" = ANY (ARRAY['internal'::"text", 'public'::"text"]))),
    CONSTRAINT "comments_visibility_scope_ck" CHECK ((("visibility" = 'internal'::"text") OR ("feedback_post_id" IS NOT NULL)))
);


ALTER TABLE "public"."comments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."conversations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "project_id" "uuid",
    "user_id" "uuid" NOT NULL,
    "title" "text",
    "status" "text" DEFAULT 'idle'::"text" NOT NULL,
    "error_message" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "conversations_status_check" CHECK (("status" = ANY (ARRAY['idle'::"text", 'generating'::"text", 'error'::"text"])))
);


ALTER TABLE "public"."conversations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."custom_domains" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "domain" "text" NOT NULL,
    "board_id" "uuid",
    "share_id" "uuid",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "verification" "jsonb",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "cname_target" "text",
    CONSTRAINT "custom_domains_one_target" CHECK ((((("board_id" IS NOT NULL))::integer + (("share_id" IS NOT NULL))::integer) = 1)),
    CONSTRAINT "custom_domains_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'verified'::"text"])))
);


ALTER TABLE "public"."custom_domains" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cycles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "start_date" "date" NOT NULL,
    "end_date" "date" NOT NULL,
    "intensity" "text" NOT NULL,
    "target_points" integer NOT NULL,
    "completed_points" integer,
    "filled_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "cycles_check" CHECK (("end_date" > "start_date")),
    CONSTRAINT "cycles_intensity_check" CHECK (("intensity" = ANY (ARRAY['light'::"text", 'medium'::"text", 'heavy'::"text"]))),
    CONSTRAINT "cycles_target_points_check" CHECK (("target_points" > 0))
);


ALTER TABLE "public"."cycles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."feedback_boards" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "project_id" "uuid" NOT NULL,
    "token" "text" NOT NULL,
    "enabled" boolean DEFAULT true NOT NULL,
    "sso_secret" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "show_views" boolean DEFAULT false NOT NULL,
    "visible_view_ids" "uuid"[] DEFAULT '{}'::"uuid"[] NOT NULL,
    "show_categories" boolean DEFAULT false NOT NULL,
    "accent_light" "text",
    "accent_dark" "text",
    "allow_comments" boolean DEFAULT true NOT NULL
);


ALTER TABLE "public"."feedback_boards" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."feedback_merge_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "project_id" "uuid" NOT NULL,
    "kind" "text" NOT NULL,
    "dup_id" "uuid" NOT NULL,
    "canonical_id" "uuid" NOT NULL,
    "performed_by" "text" NOT NULL,
    "actor_id" "uuid",
    "confidence" real,
    "payload" "jsonb" NOT NULL,
    "undone_at" timestamp with time zone,
    "undone_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "feedback_merge_events_kind_check" CHECK (("kind" = ANY (ARRAY['post'::"text", 'facet'::"text"]))),
    CONSTRAINT "feedback_merge_events_performed_by_check" CHECK (("performed_by" = ANY (ARRAY['ai'::"text", 'team'::"text"])))
);


ALTER TABLE "public"."feedback_merge_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."feedback_merge_rejections" (
    "dup_id" "uuid" NOT NULL,
    "canonical_id" "uuid" NOT NULL,
    "project_id" "uuid" NOT NULL,
    "kind" "text" DEFAULT 'post'::"text" NOT NULL,
    "rejected_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "feedback_merge_rejections_kind_check" CHECK (("kind" = ANY (ARRAY['post'::"text", 'facet'::"text"])))
);


ALTER TABLE "public"."feedback_merge_rejections" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."feedback_otp_codes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "board_id" "uuid" NOT NULL,
    "email" "text" NOT NULL,
    "code_hash" "text" NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "attempts" integer DEFAULT 0 NOT NULL,
    "consumed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "ip_hash" "text"
);


ALTER TABLE "public"."feedback_otp_codes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."feedback_post_categories" (
    "post_id" "uuid" NOT NULL,
    "category_id" "uuid" NOT NULL
);


ALTER TABLE "public"."feedback_post_categories" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."feedback_sessions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "token_hash" "text" NOT NULL,
    "board_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "last_seen_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."feedback_sessions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."feedback_sso_replays" (
    "board_id" "uuid" NOT NULL,
    "token_id" "text" NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."feedback_sso_replays" OWNER TO "postgres";


COMMENT ON TABLE "public"."feedback_sso_replays" IS 'Jetons SSO de board déjà consommés (MIN-345). La clé primaire refuse le rejeu ; les lignes sont purgées passé expires_at.';



CREATE TABLE IF NOT EXISTS "public"."feedback_users" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "project_id" "uuid" NOT NULL,
    "external_id" "text",
    "email" "text",
    "name" "text",
    "pseudonym" "text" NOT NULL,
    "verified_via" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "erased_at" timestamp with time zone,
    CONSTRAINT "feedback_users_identity" CHECK ((("erased_at" IS NOT NULL) OR ("external_id" IS NOT NULL) OR ("email" IS NOT NULL))),
    CONSTRAINT "feedback_users_verified_via_check" CHECK (("verified_via" = ANY (ARRAY['email'::"text", 'sso'::"text", 'api'::"text"])))
);


ALTER TABLE "public"."feedback_users" OWNER TO "postgres";


COMMENT ON COLUMN "public"."feedback_users"."erased_at" IS 'Horodatage de l''effacement RGPD : la ligne ne porte plus d''identifiant, ses contributions restent sous pseudonyme.';



CREATE TABLE IF NOT EXISTS "public"."feedback_votes" (
    "post_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."feedback_votes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."forge_mention_throttle" (
    "key" "text" NOT NULL,
    "window_start" timestamp with time zone DEFAULT "now"() NOT NULL,
    "count" integer DEFAULT 0 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."forge_mention_throttle" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."forge_webhook_deliveries" (
    "provider" "text" NOT NULL,
    "delivery_id" "text" NOT NULL,
    "received_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."forge_webhook_deliveries" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."fx_rates" (
    "day" "date" NOT NULL,
    "usd_eur" numeric(12,6) NOT NULL,
    "fetched_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."fx_rates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."git_connections" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "provider" "text" NOT NULL,
    "installation_id" bigint,
    "provider_account_id" "text",
    "account_login" "text",
    "account_type" "text",
    "repository_selection" "text",
    "access_token_encrypted" "text",
    "refresh_token_encrypted" "text",
    "token_expires_at" timestamp with time zone,
    "oauth_scopes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."git_connections" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."git_user_identities" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "provider" "text" NOT NULL,
    "provider_account_id" "text",
    "account_login" "text",
    "account_avatar_url" "text",
    "access_token_encrypted" "text",
    "refresh_token_encrypted" "text",
    "token_expires_at" timestamp with time zone,
    "oauth_scopes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."git_user_identities" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."integrations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "project_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "key_hash" "text" NOT NULL,
    "key_prefix" "text" NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_used_at" timestamp with time zone,
    "revoked_at" timestamp with time zone,
    "webhook_url" "text",
    "webhook_events" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "webhook_scope" "text" DEFAULT 'integration'::"text" NOT NULL,
    "webhook_last_status" "text",
    "webhook_last_at" timestamp with time zone,
    "kind" "text" DEFAULT 'issues'::"text" NOT NULL,
    CONSTRAINT "integrations_kind_check" CHECK (("kind" = ANY (ARRAY['issues'::"text", 'feedback'::"text"]))),
    CONSTRAINT "integrations_webhook_scope_check" CHECK (("webhook_scope" = ANY (ARRAY['integration'::"text", 'all'::"text"])))
);


ALTER TABLE "public"."integrations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."issue_categories" (
    "issue_id" "uuid" NOT NULL,
    "category_id" "uuid" NOT NULL
);


ALTER TABLE "public"."issue_categories" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."issue_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "issue_id" "uuid",
    "actor_id" "uuid",
    "type" "text" NOT NULL,
    "field" "text",
    "from_value" "text",
    "to_value" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "via_assistant" boolean DEFAULT false NOT NULL,
    "integration_id" "uuid",
    "via_mcp" boolean DEFAULT false NOT NULL,
    "api_key_id" "uuid",
    "via_smart_assign" boolean DEFAULT false NOT NULL,
    "objective_id" "uuid",
    "feedback_post_id" "uuid",
    "forge_sync" "text",
    "smart_assign_ai" boolean DEFAULT false NOT NULL,
    "via_automation" boolean DEFAULT false NOT NULL,
    "via_smart_fill" boolean DEFAULT false NOT NULL,
    "page_id" "uuid",
    CONSTRAINT "issue_events_parent_ck" CHECK (("num_nonnulls"("issue_id", "objective_id", "feedback_post_id", "page_id") = 1))
);


ALTER TABLE "public"."issue_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."issue_relations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "project_id" "uuid" NOT NULL,
    "source_id" "uuid" NOT NULL,
    "target_id" "uuid" NOT NULL,
    "type" "text" NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "issue_relations_check" CHECK (("source_id" <> "target_id")),
    CONSTRAINT "issue_relations_type_check" CHECK (("type" = ANY (ARRAY['blocks'::"text", 'related'::"text"])))
);


ALTER TABLE "public"."issue_relations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."issues" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "project_id" "uuid" NOT NULL,
    "number" integer NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "status" "text" DEFAULT 'backlog'::"text" NOT NULL,
    "priority" "text" DEFAULT 'none'::"text" NOT NULL,
    "effort" "text",
    "assignee_id" "uuid",
    "due_date" timestamp with time zone,
    "position" double precision DEFAULT 0 NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "completed_at" timestamp with time zone,
    "objective_id" "uuid",
    "parent_id" "uuid",
    "duplicate_of_id" "uuid",
    "integration_id" "uuid",
    "plan" "text",
    "cycle_id" "uuid",
    "remote_provider" "text",
    "remote_repo_id" "text",
    "remote_number" integer,
    "remote_url" "text",
    "deleted_at" timestamp with time zone,
    "deleted_by" "uuid",
    "recurrence" "text",
    "recurrence_series_id" "uuid",
    "automation_override" "jsonb",
    CONSTRAINT "issues_effort_check" CHECK (("effort" = ANY (ARRAY['xs'::"text", 's'::"text", 'm'::"text", 'l'::"text", 'xl'::"text"]))),
    CONSTRAINT "issues_priority_check" CHECK (("priority" = ANY (ARRAY['none'::"text", 'urgent'::"text", 'high'::"text", 'medium'::"text", 'low'::"text"]))),
    CONSTRAINT "issues_recurrence_check" CHECK ((("recurrence" IS NULL) OR ("recurrence" = ANY (ARRAY['daily'::"text", 'weekly'::"text", 'monthly'::"text", 'yearly'::"text"])))),
    CONSTRAINT "issues_status_check" CHECK (("status" = ANY (ARRAY['triage'::"text", 'backlog'::"text", 'todo'::"text", 'in_progress'::"text", 'in_review'::"text", 'done'::"text", 'canceled'::"text", 'duplicate'::"text"])))
);


ALTER TABLE "public"."issues" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."mfa_recovery_codes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "code_hash" "text" NOT NULL,
    "used_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."mfa_recovery_codes" OWNER TO "postgres";


COMMENT ON TABLE "public"."mfa_recovery_codes" IS 'Codes de récupération 2FA (MIN-132, durcis en MIN-347). Empreinte scrypt salée par code : scrypt$<N>$<sel hex>$<empreinte hex>. Service role only (RLS sans policy). Un code consommé désactive la 2FA du compte.';



CREATE TABLE IF NOT EXISTS "public"."notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "project_id" "uuid",
    "type" "text" NOT NULL,
    "issue_id" "uuid",
    "comment_id" "uuid",
    "actor_id" "uuid",
    "read_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "objective_id" "uuid",
    "feedback_post_id" "uuid",
    "via_mcp" boolean DEFAULT false NOT NULL,
    "api_key_id" "uuid",
    "via_smart_assign" boolean DEFAULT false NOT NULL,
    "via_automation" boolean DEFAULT false NOT NULL,
    "routine_id" "uuid",
    "pull_request_id" "uuid",
    "page_id" "uuid",
    "block_id" "text",
    "via_assistant" boolean DEFAULT false NOT NULL,
    "agent_conversation_id" "uuid",
    CONSTRAINT "notifications_type_check" CHECK (("type" = ANY (ARRAY['assigned'::"text", 'mention'::"text", 'comment'::"text", 'agent_done'::"text", 'agent_question'::"text", 'agent_failed'::"text", 'feedback_new'::"text", 'pr_reviewed'::"text", 'pr_merged'::"text", 'pr_opened'::"text", 'automation_paused'::"text", 'automation_stopped'::"text", 'routine_done'::"text", 'page_mention'::"text", 'page_agent_edit'::"text", 'page_comment'::"text"])))
);


ALTER TABLE "public"."notifications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."oauth_authorization_codes" (
    "code_hash" "text" NOT NULL,
    "client_id" "text" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "grant_id" "uuid" NOT NULL,
    "redirect_uri" "text" NOT NULL,
    "code_challenge" "text" NOT NULL,
    "code_challenge_method" "text" DEFAULT 'S256'::"text" NOT NULL,
    "scope" "text" DEFAULT 'minddy'::"text" NOT NULL,
    "resource" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "used_at" timestamp with time zone,
    CONSTRAINT "oauth_authorization_codes_code_challenge_method_check" CHECK (("code_challenge_method" = 'S256'::"text"))
);


ALTER TABLE "public"."oauth_authorization_codes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."oauth_clients" (
    "client_id" "text" NOT NULL,
    "client_name" "text" NOT NULL,
    "redirect_uris" "text"[] NOT NULL,
    "logo_uri" "text",
    "client_uri" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_used_at" timestamp with time zone
);


ALTER TABLE "public"."oauth_clients" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."oauth_grants" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "client_id" "text" NOT NULL,
    "api_key_id" "uuid" NOT NULL,
    "scope" "text" DEFAULT 'minddy'::"text" NOT NULL,
    "access_token_hash" "text",
    "access_token_expires_at" timestamp with time zone,
    "refresh_token_hash" "text",
    "refresh_token_expires_at" timestamp with time zone,
    "prev_refresh_token_hash" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_used_at" timestamp with time zone,
    "revoked_at" timestamp with time zone
);


ALTER TABLE "public"."oauth_grants" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."objectives" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "project_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "status" "text" DEFAULT 'planned'::"text" NOT NULL,
    "lead_user_id" "uuid",
    "target_date" timestamp with time zone,
    "color" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    "deleted_by" "uuid",
    CONSTRAINT "objectives_status_check" CHECK (("status" = ANY (ARRAY['planned'::"text", 'in_progress'::"text", 'done'::"text", 'canceled'::"text"])))
);


ALTER TABLE "public"."objectives" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."page_comments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "page_id" "uuid" NOT NULL,
    "project_id" "uuid" NOT NULL,
    "block_id" "text",
    "quote" "text",
    "body" "text" DEFAULT ''::"text" NOT NULL,
    "author_id" "uuid",
    "parent_id" "uuid",
    "via_assistant" boolean DEFAULT false NOT NULL,
    "via_mcp" boolean DEFAULT false NOT NULL,
    "api_key_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."page_comments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."page_files" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "page_id" "uuid" NOT NULL,
    "project_id" "uuid" NOT NULL,
    "storage_path" "text" NOT NULL,
    "file_name" "text" NOT NULL,
    "mime_type" "text" DEFAULT 'application/octet-stream'::"text" NOT NULL,
    "size_bytes" bigint DEFAULT 0 NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."page_files" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."page_links" (
    "page_id" "uuid" NOT NULL,
    "source_kind" "text" NOT NULL,
    "source_id" "uuid" NOT NULL,
    "project_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "page_links_source_kind_check" CHECK (("source_kind" = ANY (ARRAY['issue'::"text", 'objective'::"text", 'page'::"text"])))
);


ALTER TABLE "public"."page_links" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."page_versions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "page_id" "uuid" NOT NULL,
    "project_id" "uuid" NOT NULL,
    "version" integer NOT NULL,
    "title" "text" DEFAULT ''::"text" NOT NULL,
    "icon" "text",
    "content" "jsonb" DEFAULT '{"type": "doc", "content": []}'::"jsonb" NOT NULL,
    "author_id" "uuid",
    "author_kind" "text" DEFAULT 'human'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "author_api_key_id" "uuid",
    CONSTRAINT "page_versions_author_kind_check" CHECK (("author_kind" = ANY (ARRAY['human'::"text", 'agent'::"text"])))
);


ALTER TABLE "public"."page_versions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "project_id" "uuid" NOT NULL,
    "parent_id" "uuid",
    "title" "text" DEFAULT ''::"text" NOT NULL,
    "icon" "text",
    "content" "jsonb" DEFAULT '{"type": "doc", "content": []}'::"jsonb" NOT NULL,
    "version" integer DEFAULT 1 NOT NULL,
    "position" "text" NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    "deleted_by" "uuid",
    "deleted_root_id" "uuid",
    "parent_block_removed" boolean DEFAULT false NOT NULL,
    "favorite" boolean DEFAULT false NOT NULL,
    "search_text" "text" DEFAULT ''::"text" NOT NULL,
    "search_tsv" "tsvector" GENERATED ALWAYS AS (("setweight"("to_tsvector"('"simple"'::"regconfig", COALESCE("title", ''::"text")), 'A'::"char") || "setweight"("to_tsvector"('"simple"'::"regconfig", COALESCE("search_text", ''::"text")), 'B'::"char"))) STORED,
    "updated_by" "uuid",
    "updated_kind" "text" DEFAULT 'human'::"text" NOT NULL,
    "updated_api_key_id" "uuid",
    CONSTRAINT "pages_updated_kind_ck" CHECK (("updated_kind" = ANY (ARRAY['human'::"text", 'agent'::"text"])))
);


ALTER TABLE "public"."pages" OWNER TO "postgres";


COMMENT ON COLUMN "public"."pages"."parent_block_removed" IS 'MIN-272 — un bloc sous-page a été retiré du corps du parent en corbeillant cette page ; la restauration le remet.';



CREATE TABLE IF NOT EXISTS "public"."plan_storage_quotas" (
    "plan_id" "text" NOT NULL,
    "bytes" bigint NOT NULL
);


ALTER TABLE "public"."plan_storage_quotas" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."project_drafts" (
    "id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "step" "text" NOT NULL,
    "data" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."project_drafts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."project_git_links" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "project_id" "uuid" NOT NULL,
    "connection_id" "uuid" NOT NULL,
    "provider" "text" NOT NULL,
    "installation_id" bigint,
    "external_repo_id" "text" NOT NULL,
    "repo_owner" "text",
    "repo_name" "text",
    "repo_full_name" "text",
    "default_branch" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "issue_sync_enabled" boolean DEFAULT false NOT NULL,
    "issue_sync_enabled_at" timestamp with time zone,
    "issue_sync_backfilled_at" timestamp with time zone,
    "issue_sync_hook_id" "text",
    "webhook_secret_encrypted" "text"
);


ALTER TABLE "public"."project_git_links" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."project_invitations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "project_id" "uuid" NOT NULL,
    "invited_email" "text" NOT NULL,
    "invited_user_id" "uuid",
    "invited_by" "uuid" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "responded_at" timestamp with time zone,
    "token" "text" DEFAULT "replace"(("gen_random_uuid"())::"text", '-'::"text", ''::"text") NOT NULL,
    "expires_at" timestamp with time zone DEFAULT ("now"() + '30 days'::interval) NOT NULL,
    CONSTRAINT "project_invitations_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'accepted'::"text", 'rejected'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."project_invitations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."project_members" (
    "project_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "text" DEFAULT 'member'::"text" NOT NULL,
    "added_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."project_members" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."projects" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "key" "text" NOT NULL,
    "color" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    "issue_seq" integer DEFAULT 0 NOT NULL,
    "smart_assign_enabled" boolean DEFAULT false NOT NULL,
    "smart_assign_rules" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "icon_url" "text",
    "auto_assign_enabled" boolean DEFAULT false NOT NULL,
    "feedback_review_enabled" boolean DEFAULT true NOT NULL,
    "feedback_review_skip_over_budget" boolean DEFAULT false NOT NULL,
    "deleted_by" "uuid",
    "automations_enabled" boolean DEFAULT false NOT NULL,
    "automations" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "feedback_translate_enabled" boolean DEFAULT true NOT NULL,
    "feedback_team_language" "text",
    "feedback_no_translate_languages" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "orb_seed" "text"
);


ALTER TABLE "public"."projects" OWNER TO "postgres";


COMMENT ON COLUMN "public"."projects"."orb_seed" IS 'Graine de l''orbe générée. Null = jamais relancée, le lecteur retombe sur projects.id.';



CREATE TABLE IF NOT EXISTS "public"."pull_request_syncs" (
    "provider" "text" NOT NULL,
    "repo_full_name" "text" NOT NULL,
    "synced_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "truncated" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."pull_request_syncs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pull_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "provider" "text" NOT NULL,
    "repo_full_name" "text" NOT NULL,
    "number" integer NOT NULL,
    "url" "text",
    "title" "text",
    "state" "text" DEFAULT 'open'::"text" NOT NULL,
    "author_login" "text",
    "author_avatar_url" "text",
    "head_branch" "text",
    "base_branch" "text",
    "head_sha" "text",
    "issue_id" "uuid",
    "opened_at" timestamp with time zone,
    "merged_at" timestamp with time zone,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "synced_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "pull_requests_state_check" CHECK (("state" = ANY (ARRAY['draft'::"text", 'open'::"text", 'merged'::"text", 'closed'::"text"])))
);


ALTER TABLE "public"."pull_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."push_subscriptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "endpoint" "text" NOT NULL,
    "p256dh" "text",
    "auth" "text",
    "device_label" "text",
    "user_agent" "text",
    "locale" "text" DEFAULT 'en'::"text" NOT NULL,
    "enabled" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_seen_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_push_at" timestamp with time zone,
    "failure_count" integer DEFAULT 0 NOT NULL,
    "transport" "text" DEFAULT 'web'::"text" NOT NULL,
    "native_installation_id" "text",
    CONSTRAINT "push_subscriptions_credentials_check" CHECK (((("transport" = 'web'::"text") AND ("p256dh" IS NOT NULL) AND ("auth" IS NOT NULL) AND ("native_installation_id" IS NULL)) OR (("transport" = 'apns'::"text") AND ("p256dh" IS NULL) AND ("auth" IS NULL) AND ("native_installation_id" IS NOT NULL)))),
    CONSTRAINT "push_subscriptions_transport_check" CHECK (("transport" = ANY (ARRAY['web'::"text", 'apns'::"text"])))
);


ALTER TABLE "public"."push_subscriptions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."saved_views" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "href" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "saved_views_href_check" CHECK ((("href" ~~ '/%'::"text") AND ("href" !~~ '//%'::"text")))
);


ALTER TABLE "public"."saved_views" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."share_unlock_attempts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "share_id" "uuid" NOT NULL,
    "ip_hash" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."share_unlock_attempts" OWNER TO "postgres";


COMMENT ON TABLE "public"."share_unlock_attempts" IS 'Échecs de déverrouillage d''un partage protégé (MIN-347). Compteur persistant — le compteur en mémoire repartait à zéro à chaque déploiement. Purge opportuniste au-delà de la fenêtre. Service role only (RLS sans policy).';



CREATE TABLE IF NOT EXISTS "public"."stat_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "kind" "text" NOT NULL,
    "occurred_at" timestamp with time zone NOT NULL,
    "project_id" "uuid",
    "project_name" "text",
    "issue_id" "uuid",
    "issue_number" integer,
    "issue_title" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "task_text" "text",
    CONSTRAINT "stat_events_kind_check" CHECK (("kind" = ANY (ARRAY['issue_created'::"text", 'issue_completed'::"text", 'scratchpad_task_completed'::"text"])))
);


ALTER TABLE "public"."stat_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."stripe_webhook_events" (
    "stripe_event_id" "text" NOT NULL,
    "type" "text" NOT NULL,
    "livemode" boolean DEFAULT false NOT NULL,
    "payload" "jsonb",
    "processed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."stripe_webhook_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_agent_preferences" (
    "user_id" "uuid" NOT NULL,
    "default_model" "text",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "default_reasoning_level" "text",
    "pr_review_model" "text",
    CONSTRAINT "user_agent_preferences_default_reasoning_level_check" CHECK ((("default_reasoning_level" IS NULL) OR ("default_reasoning_level" = ANY (ARRAY['off'::"text", 'minimal'::"text", 'low'::"text", 'medium'::"text", 'high'::"text", 'xhigh'::"text", 'max'::"text"]))))
);


ALTER TABLE "public"."user_agent_preferences" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_ai_keys" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "provider" "text" DEFAULT 'openrouter'::"text" NOT NULL,
    "key_encrypted" "text" NOT NULL,
    "key_prefix" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_used_at" timestamp with time zone,
    "base_url" "text",
    "validated_at" timestamp with time zone,
    "enabled_surfaces" "text"[] DEFAULT ARRAY['agent'::"text", 'assistant'::"text", 'automations'::"text", 'voice'::"text", 'feedback'::"text"] NOT NULL,
    "feature_models" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    CONSTRAINT "user_ai_keys_enabled_surfaces_check" CHECK (("enabled_surfaces" <@ ARRAY['agent'::"text", 'assistant'::"text", 'automations'::"text", 'voice'::"text", 'feedback'::"text"])),
    CONSTRAINT "user_ai_keys_feature_models_object_check" CHECK (("jsonb_typeof"("feature_models") = 'object'::"text"))
);


ALTER TABLE "public"."user_ai_keys" OWNER TO "postgres";


COMMENT ON COLUMN "public"."user_ai_keys"."validated_at" IS 'Instant où le fournisseur a reconnu la clé (MIN-344). null = non validée : la clé ne lève aucun plafond.';



CREATE TABLE IF NOT EXISTS "public"."user_avatars" (
    "user_id" "uuid" NOT NULL,
    "seed" "text" DEFAULT ("gen_random_uuid"())::"text" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."user_avatars" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_scratchpad" (
    "user_id" "uuid" NOT NULL,
    "content" "text" DEFAULT ''::"text" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "rev" bigint DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."user_scratchpad" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."view_shares" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "view_id" "uuid",
    "level" "text" NOT NULL,
    "token" "text" NOT NULL,
    "password_salt" "text",
    "password_hash" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "page_id" "uuid",
    "include_children" boolean DEFAULT false NOT NULL,
    CONSTRAINT "view_shares_level_check" CHECK (("level" = ANY (ARRAY['password'::"text", 'public'::"text"]))),
    CONSTRAINT "view_shares_password_consistent" CHECK ((("level" = 'password'::"text") = (("password_hash" IS NOT NULL) AND ("password_salt" IS NOT NULL)))),
    CONSTRAINT "view_shares_target_ck" CHECK (((("view_id" IS NOT NULL) AND ("page_id" IS NULL)) OR (("view_id" IS NULL) AND ("page_id" IS NOT NULL))))
);


ALTER TABLE "public"."view_shares" OWNER TO "postgres";


COMMENT ON COLUMN "public"."view_shares"."page_id" IS 'Page du wiki publiée en lecture (MIN-283) ; null sur un partage de vue.';



COMMENT ON COLUMN "public"."view_shares"."include_children" IS 'La branche entière part avec la page (MIN-283) — choix explicite à la publication.';



CREATE TABLE IF NOT EXISTS "public"."views" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "project_id" "uuid",
    "user_id" "uuid",
    "name" "text" NOT NULL,
    "filters" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "sort" "text" DEFAULT 'manual'::"text" NOT NULL,
    "display" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "position" double precision DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "kind" "text" DEFAULT 'custom'::"text" NOT NULL,
    CONSTRAINT "views_global_personal" CHECK ((("project_id" IS NOT NULL) OR ("user_id" IS NOT NULL))),
    CONSTRAINT "views_kind_check" CHECK (("kind" = ANY (ARRAY['custom'::"text", 'my'::"text"]))),
    CONSTRAINT "views_system_personal" CHECK ((("kind" <> 'my'::"text") OR ("user_id" IS NOT NULL)))
);


ALTER TABLE "public"."views" OWNER TO "postgres";


ALTER TABLE ONLY "public"."agent_run_journal" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."agent_run_journal_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."agent_artifacts"
    ADD CONSTRAINT "agent_artifacts_conversation_id_kind_ref_key" UNIQUE ("conversation_id", "kind", "ref");



ALTER TABLE ONLY "public"."agent_artifacts"
    ADD CONSTRAINT "agent_artifacts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."agent_chains"
    ADD CONSTRAINT "agent_chains_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."agent_conversation_contexts"
    ADD CONSTRAINT "agent_conversation_contexts_conversation_id_kind_resource_i_key" UNIQUE ("conversation_id", "kind", "resource_id");



ALTER TABLE ONLY "public"."agent_conversation_contexts"
    ADD CONSTRAINT "agent_conversation_contexts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."agent_conversation_pins"
    ADD CONSTRAINT "agent_conversation_pins_pkey" PRIMARY KEY ("user_id", "conversation_id");



ALTER TABLE ONLY "public"."agent_conversation_reads"
    ADD CONSTRAINT "agent_conversation_reads_pkey" PRIMARY KEY ("user_id", "conversation_id");



ALTER TABLE ONLY "public"."agent_conversations"
    ADD CONSTRAINT "agent_conversations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."agent_messages"
    ADD CONSTRAINT "agent_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."agent_quota_resets"
    ADD CONSTRAINT "agent_quota_resets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."agent_routines"
    ADD CONSTRAINT "agent_routines_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."agent_run_events"
    ADD CONSTRAINT "agent_run_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."agent_run_journal"
    ADD CONSTRAINT "agent_run_journal_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."agent_run_messages"
    ADD CONSTRAINT "agent_run_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."agent_runs"
    ADD CONSTRAINT "agent_runs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."agent_runtime_sessions"
    ADD CONSTRAINT "agent_runtime_sessions_pkey" PRIMARY KEY ("conversation_id");



ALTER TABLE ONLY "public"."agent_session_reads"
    ADD CONSTRAINT "agent_session_reads_pkey" PRIMARY KEY ("user_id", "issue_id");



ALTER TABLE ONLY "public"."agent_turns"
    ADD CONSTRAINT "agent_turns_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ai_usage"
    ADD CONSTRAINT "ai_usage_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."api_keys"
    ADD CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."app_config"
    ADD CONSTRAINT "app_config_pkey" PRIMARY KEY ("key");



ALTER TABLE ONLY "public"."assistant_active_conversation"
    ADD CONSTRAINT "assistant_active_conversation_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."assistant_messages"
    ADD CONSTRAINT "assistant_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."attachments"
    ADD CONSTRAINT "attachments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."billing_accounts"
    ADD CONSTRAINT "billing_accounts_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."billing_accounts"
    ADD CONSTRAINT "billing_accounts_stripe_customer_id_key" UNIQUE ("stripe_customer_id");



ALTER TABLE ONLY "public"."billing_accounts"
    ADD CONSTRAINT "billing_accounts_stripe_subscription_id_key" UNIQUE ("stripe_subscription_id");



ALTER TABLE ONLY "public"."categories"
    ADD CONSTRAINT "categories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."comments"
    ADD CONSTRAINT "comments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."custom_domains"
    ADD CONSTRAINT "custom_domains_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cycles"
    ADD CONSTRAINT "cycles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cycles"
    ADD CONSTRAINT "cycles_user_id_start_date_key" UNIQUE ("user_id", "start_date");



ALTER TABLE ONLY "public"."feedback_boards"
    ADD CONSTRAINT "feedback_boards_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."feedback_boards"
    ADD CONSTRAINT "feedback_boards_project_id_key" UNIQUE ("project_id");



ALTER TABLE ONLY "public"."feedback_boards"
    ADD CONSTRAINT "feedback_boards_token_key" UNIQUE ("token");



ALTER TABLE ONLY "public"."feedback_merge_events"
    ADD CONSTRAINT "feedback_merge_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."feedback_merge_rejections"
    ADD CONSTRAINT "feedback_merge_rejections_pkey" PRIMARY KEY ("dup_id", "canonical_id");



ALTER TABLE ONLY "public"."feedback_otp_codes"
    ADD CONSTRAINT "feedback_otp_codes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."feedback_post_categories"
    ADD CONSTRAINT "feedback_post_categories_pkey" PRIMARY KEY ("post_id", "category_id");



ALTER TABLE ONLY "public"."feedback_posts"
    ADD CONSTRAINT "feedback_posts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."feedback_sessions"
    ADD CONSTRAINT "feedback_sessions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."feedback_sessions"
    ADD CONSTRAINT "feedback_sessions_token_hash_key" UNIQUE ("token_hash");



ALTER TABLE ONLY "public"."feedback_sso_replays"
    ADD CONSTRAINT "feedback_sso_replays_pkey" PRIMARY KEY ("board_id", "token_id");



ALTER TABLE ONLY "public"."feedback_users"
    ADD CONSTRAINT "feedback_users_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."feedback_votes"
    ADD CONSTRAINT "feedback_votes_pkey" PRIMARY KEY ("post_id", "user_id");



ALTER TABLE ONLY "public"."forge_mention_throttle"
    ADD CONSTRAINT "forge_mention_throttle_pkey" PRIMARY KEY ("key");



ALTER TABLE ONLY "public"."forge_webhook_deliveries"
    ADD CONSTRAINT "forge_webhook_deliveries_pkey" PRIMARY KEY ("provider", "delivery_id");



ALTER TABLE ONLY "public"."fx_rates"
    ADD CONSTRAINT "fx_rates_pkey" PRIMARY KEY ("day");



ALTER TABLE ONLY "public"."git_connections"
    ADD CONSTRAINT "git_connections_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."git_user_identities"
    ADD CONSTRAINT "git_user_identities_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."integrations"
    ADD CONSTRAINT "integrations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."issue_categories"
    ADD CONSTRAINT "issue_categories_pkey" PRIMARY KEY ("issue_id", "category_id");



ALTER TABLE ONLY "public"."issue_events"
    ADD CONSTRAINT "issue_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."issue_relations"
    ADD CONSTRAINT "issue_relations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."issue_relations"
    ADD CONSTRAINT "issue_relations_source_id_target_id_type_key" UNIQUE ("source_id", "target_id", "type");



ALTER TABLE ONLY "public"."issues"
    ADD CONSTRAINT "issues_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."issues"
    ADD CONSTRAINT "issues_project_id_number_key" UNIQUE ("project_id", "number");



ALTER TABLE ONLY "public"."mfa_recovery_codes"
    ADD CONSTRAINT "mfa_recovery_codes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."oauth_authorization_codes"
    ADD CONSTRAINT "oauth_authorization_codes_pkey" PRIMARY KEY ("code_hash");



ALTER TABLE ONLY "public"."oauth_clients"
    ADD CONSTRAINT "oauth_clients_pkey" PRIMARY KEY ("client_id");



ALTER TABLE ONLY "public"."oauth_grants"
    ADD CONSTRAINT "oauth_grants_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."objectives"
    ADD CONSTRAINT "objectives_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."page_comments"
    ADD CONSTRAINT "page_comments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."page_files"
    ADD CONSTRAINT "page_files_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."page_links"
    ADD CONSTRAINT "page_links_pkey" PRIMARY KEY ("page_id", "source_kind", "source_id");



ALTER TABLE ONLY "public"."page_versions"
    ADD CONSTRAINT "page_versions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pages"
    ADD CONSTRAINT "pages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."plan_storage_quotas"
    ADD CONSTRAINT "plan_storage_quotas_pkey" PRIMARY KEY ("plan_id");



ALTER TABLE ONLY "public"."project_drafts"
    ADD CONSTRAINT "project_drafts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."project_git_links"
    ADD CONSTRAINT "project_git_links_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."project_git_links"
    ADD CONSTRAINT "project_git_links_project_id_key" UNIQUE ("project_id");



ALTER TABLE ONLY "public"."project_invitations"
    ADD CONSTRAINT "project_invitations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."project_members"
    ADD CONSTRAINT "project_members_pkey" PRIMARY KEY ("project_id", "user_id");



ALTER TABLE ONLY "public"."projects"
    ADD CONSTRAINT "projects_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pull_request_syncs"
    ADD CONSTRAINT "pull_request_syncs_pkey" PRIMARY KEY ("provider", "repo_full_name");



ALTER TABLE ONLY "public"."pull_requests"
    ADD CONSTRAINT "pull_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."push_subscriptions"
    ADD CONSTRAINT "push_subscriptions_endpoint_key" UNIQUE ("endpoint");



ALTER TABLE ONLY "public"."push_subscriptions"
    ADD CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."saved_views"
    ADD CONSTRAINT "saved_views_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."share_unlock_attempts"
    ADD CONSTRAINT "share_unlock_attempts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."stat_events"
    ADD CONSTRAINT "stat_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."stripe_webhook_events"
    ADD CONSTRAINT "stripe_webhook_events_pkey" PRIMARY KEY ("stripe_event_id");



ALTER TABLE ONLY "public"."user_agent_preferences"
    ADD CONSTRAINT "user_agent_preferences_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."user_ai_keys"
    ADD CONSTRAINT "user_ai_keys_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_avatars"
    ADD CONSTRAINT "user_avatars_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."user_scratchpad"
    ADD CONSTRAINT "user_scratchpad_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."view_shares"
    ADD CONSTRAINT "view_shares_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."view_shares"
    ADD CONSTRAINT "view_shares_token_key" UNIQUE ("token");



ALTER TABLE ONLY "public"."view_shares"
    ADD CONSTRAINT "view_shares_view_id_key" UNIQUE ("view_id");



ALTER TABLE ONLY "public"."views"
    ADD CONSTRAINT "views_pkey" PRIMARY KEY ("id");



CREATE UNIQUE INDEX "custom_domains_board_key" ON "public"."custom_domains" USING "btree" ("board_id") WHERE ("board_id" IS NOT NULL);



CREATE UNIQUE INDEX "custom_domains_domain_key" ON "public"."custom_domains" USING "btree" ("lower"("domain"));



CREATE UNIQUE INDEX "custom_domains_share_key" ON "public"."custom_domains" USING "btree" ("share_id") WHERE ("share_id" IS NOT NULL);



CREATE INDEX "feedback_merge_events_dup" ON "public"."feedback_merge_events" USING "btree" ("dup_id");



CREATE INDEX "feedback_merge_events_project" ON "public"."feedback_merge_events" USING "btree" ("project_id", "created_at" DESC);



CREATE INDEX "feedback_merge_rejections_project" ON "public"."feedback_merge_rejections" USING "btree" ("project_id");



CREATE INDEX "feedback_otp_board_email" ON "public"."feedback_otp_codes" USING "btree" ("board_id", "email");



CREATE INDEX "feedback_otp_email_created" ON "public"."feedback_otp_codes" USING "btree" ("email", "created_at" DESC);



CREATE INDEX "feedback_otp_expiry" ON "public"."feedback_otp_codes" USING "btree" ("expires_at");



CREATE INDEX "feedback_otp_ip_hash" ON "public"."feedback_otp_codes" USING "btree" ("ip_hash", "created_at" DESC);



CREATE INDEX "feedback_posts_author" ON "public"."feedback_posts" USING "btree" ("author_id") WHERE ("author_id" IS NOT NULL);



CREATE INDEX "feedback_posts_issue" ON "public"."feedback_posts" USING "btree" ("issue_id") WHERE ("issue_id" IS NOT NULL);



CREATE INDEX "feedback_posts_merged_into" ON "public"."feedback_posts" USING "btree" ("merged_into_id") WHERE ("merged_into_id" IS NOT NULL);



CREATE INDEX "feedback_posts_project_status" ON "public"."feedback_posts" USING "btree" ("project_id", "status");



CREATE INDEX "feedback_posts_public_list" ON "public"."feedback_posts" USING "btree" ("project_id", "status") WHERE ("is_public" AND ("review_state" = 'published'::"text") AND ("status" <> 'spam'::"text") AND ("merged_into_id" IS NULL));



CREATE INDEX "feedback_posts_to_review" ON "public"."feedback_posts" USING "btree" ("created_at") WHERE ((("analyzed_at" IS NULL) OR ("classified_at" IS NULL)) AND ("merged_into_id" IS NULL) AND ("deleted_at" IS NULL));



CREATE INDEX "feedback_sessions_expiry" ON "public"."feedback_sessions" USING "btree" ("expires_at");



CREATE INDEX "feedback_sessions_user" ON "public"."feedback_sessions" USING "btree" ("user_id");



CREATE INDEX "feedback_sso_replays_expiry" ON "public"."feedback_sso_replays" USING "btree" ("expires_at");



CREATE UNIQUE INDEX "feedback_users_project_email" ON "public"."feedback_users" USING "btree" ("project_id", "lower"("email")) WHERE ("email" IS NOT NULL);



CREATE UNIQUE INDEX "feedback_users_project_external" ON "public"."feedback_users" USING "btree" ("project_id", "external_id") WHERE ("external_id" IS NOT NULL);



CREATE INDEX "feedback_votes_user" ON "public"."feedback_votes" USING "btree" ("user_id");



CREATE INDEX "idx_agent_artifacts_conversation" ON "public"."agent_artifacts" USING "btree" ("conversation_id", "created_at");



CREATE UNIQUE INDEX "idx_agent_chains_active_issue" ON "public"."agent_chains" USING "btree" ("issue_id") WHERE ("status" = ANY (ARRAY['pending'::"text", 'running'::"text", 'awaiting_human'::"text"]));



CREATE INDEX "idx_agent_chains_pending_due" ON "public"."agent_chains" USING "btree" ("not_before") WHERE ("status" = 'pending'::"text");



CREATE INDEX "idx_agent_chains_project" ON "public"."agent_chains" USING "btree" ("project_id", "created_at" DESC);



CREATE INDEX "idx_agent_conversation_contexts_resource" ON "public"."agent_conversation_contexts" USING "btree" ("kind", "resource_id");



CREATE INDEX "idx_agent_conversation_pins_conversation" ON "public"."agent_conversation_pins" USING "btree" ("conversation_id");



CREATE INDEX "idx_agent_conversation_reads_conversation" ON "public"."agent_conversation_reads" USING "btree" ("conversation_id");



CREATE UNIQUE INDEX "idx_agent_conversations_id_project" ON "public"."agent_conversations" USING "btree" ("id", "project_id");



CREATE INDEX "idx_agent_conversations_owner_updated" ON "public"."agent_conversations" USING "btree" ("owner_id", "updated_at" DESC);



CREATE INDEX "idx_agent_conversations_project_updated" ON "public"."agent_conversations" USING "btree" ("project_id", "updated_at" DESC);



CREATE INDEX "idx_agent_messages_conversation_created" ON "public"."agent_messages" USING "btree" ("conversation_id", "created_at", "id");



CREATE UNIQUE INDEX "idx_agent_messages_legacy_event" ON "public"."agent_messages" USING "btree" ("legacy_event_id") WHERE ("legacy_event_id" IS NOT NULL);



CREATE UNIQUE INDEX "idx_agent_messages_legacy_queue" ON "public"."agent_messages" USING "btree" ("legacy_queue_message_id") WHERE ("legacy_queue_message_id" IS NOT NULL);



CREATE INDEX "idx_agent_quota_resets_reset_at" ON "public"."agent_quota_resets" USING "btree" ("reset_at" DESC);



CREATE INDEX "idx_agent_quota_resets_user_at" ON "public"."agent_quota_resets" USING "btree" ("user_id", "reset_at" DESC);



CREATE INDEX "idx_agent_routines_due" ON "public"."agent_routines" USING "btree" ("next_run_at") WHERE ("enabled" AND ("deleted_at" IS NULL));



CREATE INDEX "idx_agent_routines_project" ON "public"."agent_routines" USING "btree" ("project_id", "created_at" DESC);



CREATE INDEX "idx_agent_routines_trash" ON "public"."agent_routines" USING "btree" ("project_id", "deleted_at" DESC) WHERE ("deleted_at" IS NOT NULL);



CREATE UNIQUE INDEX "idx_agent_run_events_run_seq" ON "public"."agent_run_events" USING "btree" ("run_id", "seq");



CREATE INDEX "idx_agent_run_journal_run" ON "public"."agent_run_journal" USING "btree" ("run_id", "id");



CREATE INDEX "idx_agent_run_messages_pending" ON "public"."agent_run_messages" USING "btree" ("run_id", "created_at") WHERE ("consumed_at" IS NULL);



CREATE INDEX "idx_agent_run_messages_run" ON "public"."agent_run_messages" USING "btree" ("run_id");



CREATE UNIQUE INDEX "idx_agent_runs_active_chain" ON "public"."agent_runs" USING "btree" ("chain_id") WHERE (("chain_id" IS NOT NULL) AND ("status" = ANY (ARRAY['queued'::"text", 'running'::"text"])));



CREATE UNIQUE INDEX "idx_agent_runs_active_pr" ON "public"."agent_runs" USING "btree" ("pull_request_id") WHERE ("status" = ANY (ARRAY['queued'::"text", 'running'::"text"]));



CREATE UNIQUE INDEX "idx_agent_runs_active_routine" ON "public"."agent_runs" USING "btree" ("routine_id") WHERE (("routine_id" IS NOT NULL) AND ("status" = ANY (ARRAY['queued'::"text", 'running'::"text"])));



CREATE INDEX "idx_agent_runs_chain" ON "public"."agent_runs" USING "btree" ("chain_id") WHERE ("chain_id" IS NOT NULL);



CREATE INDEX "idx_agent_runs_conversation" ON "public"."agent_runs" USING "btree" ("conversation_id", "created_at");



CREATE INDEX "idx_agent_runs_due" ON "public"."agent_runs" USING "btree" ("not_before") WHERE ("status" = 'queued'::"text");



CREATE INDEX "idx_agent_runs_idle_sandbox" ON "public"."agent_runs" USING "btree" ("last_activity_at") WHERE (("status" = 'completed'::"text") AND ("sandbox_id" IS NOT NULL) AND ("sandbox_stopped_at" IS NULL));



CREATE INDEX "idx_agent_runs_issue" ON "public"."agent_runs" USING "btree" ("issue_id");



CREATE INDEX "idx_agent_runs_loop_in_vm_running" ON "public"."agent_runs" USING "btree" ("started_at") WHERE (("status" = 'running'::"text") AND "loop_in_vm");



CREATE INDEX "idx_agent_runs_pr" ON "public"."agent_runs" USING "btree" ("repo_link_id", "pr_number") WHERE ("pr_number" IS NOT NULL);



CREATE INDEX "idx_agent_runs_project" ON "public"."agent_runs" USING "btree" ("project_id");



CREATE INDEX "idx_agent_runs_pull_request" ON "public"."agent_runs" USING "btree" ("pull_request_id", "created_at" DESC);



CREATE INDEX "idx_agent_runs_routine" ON "public"."agent_runs" USING "btree" ("routine_id") WHERE ("routine_id" IS NOT NULL);



CREATE INDEX "idx_agent_runs_running" ON "public"."agent_runs" USING "btree" ("started_at") WHERE ("status" = 'running'::"text");



CREATE INDEX "idx_agent_session_reads_user" ON "public"."agent_session_reads" USING "btree" ("user_id");



CREATE INDEX "idx_agent_turns_conversation_created" ON "public"."agent_turns" USING "btree" ("conversation_id", "created_at");



CREATE INDEX "idx_agent_turns_run_created" ON "public"."agent_turns" USING "btree" ("run_id", "created_at");



CREATE INDEX "idx_ai_usage_created" ON "public"."ai_usage" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_ai_usage_feature_time" ON "public"."ai_usage" USING "btree" ("feature", "created_at" DESC);



CREATE INDEX "idx_ai_usage_project" ON "public"."ai_usage" USING "btree" ("project_id");



CREATE INDEX "idx_ai_usage_run" ON "public"."ai_usage" USING "btree" ("run_id");



CREATE INDEX "idx_ai_usage_user" ON "public"."ai_usage" USING "btree" ("user_id");



CREATE INDEX "idx_ai_usage_user_created" ON "public"."ai_usage" USING "btree" ("user_id", "created_at" DESC);



CREATE UNIQUE INDEX "idx_api_keys_key_hash" ON "public"."api_keys" USING "btree" ("key_hash");



CREATE INDEX "idx_api_keys_user" ON "public"."api_keys" USING "btree" ("user_id");



CREATE INDEX "idx_api_keys_user_agent" ON "public"."api_keys" USING "btree" ("user_id", "agent") WHERE ("revoked_at" IS NULL);



CREATE INDEX "idx_assistant_active_conversation_conversation" ON "public"."assistant_active_conversation" USING "btree" ("conversation_id");



CREATE INDEX "idx_assistant_messages_conversation" ON "public"."assistant_messages" USING "btree" ("conversation_id");



CREATE INDEX "idx_attachments_comment" ON "public"."attachments" USING "btree" ("comment_id") WHERE ("comment_id" IS NOT NULL);



CREATE INDEX "idx_attachments_feedback" ON "public"."attachments" USING "btree" ("feedback_post_id") WHERE ("feedback_post_id" IS NOT NULL);



CREATE INDEX "idx_attachments_issue" ON "public"."attachments" USING "btree" ("issue_id");



CREATE INDEX "idx_attachments_objective" ON "public"."attachments" USING "btree" ("objective_id") WHERE ("objective_id" IS NOT NULL);



CREATE INDEX "idx_attachments_page" ON "public"."attachments" USING "btree" ("page_id") WHERE ("page_id" IS NOT NULL);



CREATE INDEX "idx_attachments_storage_path" ON "public"."attachments" USING "btree" ("storage_path") WHERE ("storage_path" IS NOT NULL);



CREATE INDEX "idx_billing_accounts_override_expiry" ON "public"."billing_accounts" USING "btree" ("admin_override_expires_at") WHERE ("admin_override_expires_at" IS NOT NULL);



CREATE INDEX "idx_billing_accounts_stripe_customer" ON "public"."billing_accounts" USING "btree" ("stripe_customer_id") WHERE ("stripe_customer_id" IS NOT NULL);



CREATE INDEX "idx_billing_accounts_stripe_subscription" ON "public"."billing_accounts" USING "btree" ("stripe_subscription_id") WHERE ("stripe_subscription_id" IS NOT NULL);



CREATE INDEX "idx_categories_project" ON "public"."categories" USING "btree" ("project_id");



CREATE INDEX "idx_comments_author" ON "public"."comments" USING "btree" ("author_id", "created_at" DESC);



CREATE INDEX "idx_comments_feedback" ON "public"."comments" USING "btree" ("feedback_post_id", "created_at") WHERE ("feedback_post_id" IS NOT NULL);



CREATE INDEX "idx_comments_feedback_public" ON "public"."comments" USING "btree" ("feedback_post_id", "created_at") WHERE (("feedback_post_id" IS NOT NULL) AND ("visibility" = 'public'::"text"));



CREATE INDEX "idx_comments_issue" ON "public"."comments" USING "btree" ("issue_id", "created_at");



CREATE INDEX "idx_comments_objective" ON "public"."comments" USING "btree" ("objective_id", "created_at") WHERE ("objective_id" IS NOT NULL);



CREATE INDEX "idx_comments_parent" ON "public"."comments" USING "btree" ("parent_id") WHERE ("parent_id" IS NOT NULL);



CREATE INDEX "idx_conversations_project" ON "public"."conversations" USING "btree" ("project_id");



CREATE INDEX "idx_conversations_user" ON "public"."conversations" USING "btree" ("user_id");



CREATE INDEX "idx_cycles_user" ON "public"."cycles" USING "btree" ("user_id", "start_date" DESC);



CREATE INDEX "idx_feedback_post_categories_category" ON "public"."feedback_post_categories" USING "btree" ("category_id");



CREATE INDEX "idx_feedback_posts_trash" ON "public"."feedback_posts" USING "btree" ("project_id", "deleted_at" DESC) WHERE ("deleted_at" IS NOT NULL);



CREATE INDEX "idx_forge_webhook_deliveries_received" ON "public"."forge_webhook_deliveries" USING "btree" ("received_at");



CREATE UNIQUE INDEX "idx_git_connections_account" ON "public"."git_connections" USING "btree" ("user_id", "provider", "provider_account_id") WHERE ("provider_account_id" IS NOT NULL);



CREATE UNIQUE INDEX "idx_git_connections_installation" ON "public"."git_connections" USING "btree" ("installation_id") WHERE ("installation_id" IS NOT NULL);



CREATE INDEX "idx_git_connections_user" ON "public"."git_connections" USING "btree" ("user_id");



CREATE INDEX "idx_git_user_identities_user" ON "public"."git_user_identities" USING "btree" ("user_id");



CREATE UNIQUE INDEX "idx_git_user_identities_user_provider" ON "public"."git_user_identities" USING "btree" ("user_id", "provider");



CREATE UNIQUE INDEX "idx_integrations_key_hash" ON "public"."integrations" USING "btree" ("key_hash");



CREATE INDEX "idx_integrations_project" ON "public"."integrations" USING "btree" ("project_id");



CREATE INDEX "idx_issue_categories_category" ON "public"."issue_categories" USING "btree" ("category_id");



CREATE INDEX "idx_issue_events_feedback" ON "public"."issue_events" USING "btree" ("feedback_post_id", "created_at") WHERE ("feedback_post_id" IS NOT NULL);



CREATE INDEX "idx_issue_events_issue" ON "public"."issue_events" USING "btree" ("issue_id", "created_at");



CREATE INDEX "idx_issue_events_objective" ON "public"."issue_events" USING "btree" ("objective_id", "created_at") WHERE ("objective_id" IS NOT NULL);



CREATE INDEX "idx_issue_events_page" ON "public"."issue_events" USING "btree" ("page_id", "created_at") WHERE ("page_id" IS NOT NULL);



CREATE INDEX "idx_issue_relations_project" ON "public"."issue_relations" USING "btree" ("project_id");



CREATE INDEX "idx_issue_relations_source" ON "public"."issue_relations" USING "btree" ("source_id");



CREATE INDEX "idx_issue_relations_target" ON "public"."issue_relations" USING "btree" ("target_id");



CREATE INDEX "idx_issues_assignee" ON "public"."issues" USING "btree" ("assignee_id");



CREATE INDEX "idx_issues_created_by" ON "public"."issues" USING "btree" ("created_by");



CREATE INDEX "idx_issues_cycle" ON "public"."issues" USING "btree" ("cycle_id");



CREATE INDEX "idx_issues_duplicate_of" ON "public"."issues" USING "btree" ("duplicate_of_id");



CREATE INDEX "idx_issues_objective" ON "public"."issues" USING "btree" ("objective_id");



CREATE INDEX "idx_issues_parent" ON "public"."issues" USING "btree" ("parent_id");



CREATE INDEX "idx_issues_project" ON "public"."issues" USING "btree" ("project_id");



CREATE INDEX "idx_issues_project_status" ON "public"."issues" USING "btree" ("project_id", "status");



CREATE INDEX "idx_issues_recurrence" ON "public"."issues" USING "btree" ("project_id") WHERE ("recurrence" IS NOT NULL);



CREATE UNIQUE INDEX "idx_issues_remote_identity" ON "public"."issues" USING "btree" ("project_id", "remote_provider", "remote_repo_id", "remote_number") WHERE ("remote_provider" IS NOT NULL);



CREATE INDEX "idx_issues_trash" ON "public"."issues" USING "btree" ("project_id", "deleted_at" DESC) WHERE ("deleted_at" IS NOT NULL);



CREATE INDEX "idx_notifications_agent_conversation" ON "public"."notifications" USING "btree" ("agent_conversation_id") WHERE ("agent_conversation_id" IS NOT NULL);



CREATE INDEX "idx_notifications_unread" ON "public"."notifications" USING "btree" ("user_id") WHERE ("read_at" IS NULL);



CREATE INDEX "idx_notifications_user" ON "public"."notifications" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "idx_oauth_codes_expires" ON "public"."oauth_authorization_codes" USING "btree" ("expires_at");



CREATE UNIQUE INDEX "idx_oauth_grants_access_hash" ON "public"."oauth_grants" USING "btree" ("access_token_hash") WHERE ("access_token_hash" IS NOT NULL);



CREATE INDEX "idx_oauth_grants_prev_refresh_hash" ON "public"."oauth_grants" USING "btree" ("prev_refresh_token_hash") WHERE ("prev_refresh_token_hash" IS NOT NULL);



CREATE UNIQUE INDEX "idx_oauth_grants_refresh_hash" ON "public"."oauth_grants" USING "btree" ("refresh_token_hash") WHERE ("refresh_token_hash" IS NOT NULL);



CREATE INDEX "idx_oauth_grants_user" ON "public"."oauth_grants" USING "btree" ("user_id");



CREATE UNIQUE INDEX "idx_oauth_grants_user_client_active" ON "public"."oauth_grants" USING "btree" ("user_id", "client_id") WHERE ("revoked_at" IS NULL);



CREATE INDEX "idx_objectives_project" ON "public"."objectives" USING "btree" ("project_id");



CREATE INDEX "idx_objectives_trash" ON "public"."objectives" USING "btree" ("project_id", "deleted_at" DESC) WHERE ("deleted_at" IS NOT NULL);



CREATE INDEX "idx_page_comments_page" ON "public"."page_comments" USING "btree" ("page_id", "created_at");



CREATE INDEX "idx_page_comments_parent" ON "public"."page_comments" USING "btree" ("parent_id") WHERE ("parent_id" IS NOT NULL);



CREATE INDEX "idx_page_files_page" ON "public"."page_files" USING "btree" ("page_id");



CREATE INDEX "idx_page_files_project" ON "public"."page_files" USING "btree" ("project_id");



CREATE INDEX "idx_page_files_storage_path" ON "public"."page_files" USING "btree" ("storage_path");



CREATE INDEX "idx_page_links_source" ON "public"."page_links" USING "btree" ("source_kind", "source_id");



CREATE INDEX "idx_page_versions_created" ON "public"."page_versions" USING "btree" ("created_at");



CREATE INDEX "idx_page_versions_page" ON "public"."page_versions" USING "btree" ("page_id", "version" DESC);



CREATE INDEX "idx_pages_deleted_root" ON "public"."pages" USING "btree" ("deleted_root_id") WHERE ("deleted_root_id" IS NOT NULL);



CREATE INDEX "idx_pages_favorite" ON "public"."pages" USING "btree" ("project_id") WHERE ("favorite" AND ("deleted_at" IS NULL));



CREATE INDEX "idx_pages_parent" ON "public"."pages" USING "btree" ("parent_id");



CREATE INDEX "idx_pages_project" ON "public"."pages" USING "btree" ("project_id") WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_pages_search" ON "public"."pages" USING "gin" ("search_tsv") WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_pages_trash" ON "public"."pages" USING "btree" ("project_id", "deleted_at" DESC) WHERE ("deleted_at" IS NOT NULL);



CREATE INDEX "idx_project_drafts_user" ON "public"."project_drafts" USING "btree" ("user_id", "updated_at" DESC);



CREATE INDEX "idx_project_git_links_connection" ON "public"."project_git_links" USING "btree" ("connection_id");



CREATE INDEX "idx_project_git_links_issue_sync" ON "public"."project_git_links" USING "btree" ("provider", "repo_full_name") WHERE "issue_sync_enabled";



CREATE INDEX "idx_project_git_links_repo_id" ON "public"."project_git_links" USING "btree" ("provider", "external_repo_id");



CREATE INDEX "idx_project_invitations_invited_user" ON "public"."project_invitations" USING "btree" ("invited_user_id", "status", "created_at" DESC);



CREATE UNIQUE INDEX "idx_project_invitations_pending_unique" ON "public"."project_invitations" USING "btree" ("project_id", "invited_email") WHERE ("status" = 'pending'::"text");



CREATE INDEX "idx_project_invitations_project" ON "public"."project_invitations" USING "btree" ("project_id", "status", "created_at" DESC);



CREATE UNIQUE INDEX "idx_project_invitations_token" ON "public"."project_invitations" USING "btree" ("token");



CREATE INDEX "idx_project_invitations_unclaimed" ON "public"."project_invitations" USING "btree" ("invited_email") WHERE (("invited_user_id" IS NULL) AND ("status" = 'pending'::"text"));



CREATE INDEX "idx_project_members_user" ON "public"."project_members" USING "btree" ("user_id");



CREATE INDEX "idx_projects_owner" ON "public"."projects" USING "btree" ("owner_id");



CREATE UNIQUE INDEX "idx_projects_owner_key_live" ON "public"."projects" USING "btree" ("owner_id", "key") WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_projects_trash" ON "public"."projects" USING "btree" ("owner_id", "deleted_at" DESC) WHERE ("deleted_at" IS NOT NULL);



CREATE INDEX "idx_pull_requests_issue" ON "public"."pull_requests" USING "btree" ("issue_id") WHERE ("issue_id" IS NOT NULL);



CREATE UNIQUE INDEX "idx_pull_requests_key" ON "public"."pull_requests" USING "btree" ("provider", "repo_full_name", "number");



CREATE INDEX "idx_pull_requests_repo" ON "public"."pull_requests" USING "btree" ("provider", "repo_full_name", "updated_at" DESC);



CREATE INDEX "idx_push_subscriptions_active_transport" ON "public"."push_subscriptions" USING "btree" ("user_id", "transport") WHERE ("enabled" = true);



CREATE INDEX "idx_push_subscriptions_user" ON "public"."push_subscriptions" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "idx_saved_views_user" ON "public"."saved_views" USING "btree" ("user_id", "created_at" DESC);



CREATE UNIQUE INDEX "idx_saved_views_user_name" ON "public"."saved_views" USING "btree" ("user_id", "name");



CREATE INDEX "idx_stat_events_user_kind_time" ON "public"."stat_events" USING "btree" ("user_id", "kind", "occurred_at");



CREATE INDEX "idx_stat_events_user_project" ON "public"."stat_events" USING "btree" ("user_id", "project_id");



CREATE UNIQUE INDEX "idx_user_ai_keys_user_provider" ON "public"."user_ai_keys" USING "btree" ("user_id", "provider");



CREATE INDEX "idx_views_project" ON "public"."views" USING "btree" ("project_id");



CREATE UNIQUE INDEX "mfa_recovery_codes_user_hash_key" ON "public"."mfa_recovery_codes" USING "btree" ("user_id", "code_hash");



CREATE INDEX "mfa_recovery_codes_user_idx" ON "public"."mfa_recovery_codes" USING "btree" ("user_id") WHERE ("used_at" IS NULL);



CREATE INDEX "notifications_page_id_idx" ON "public"."notifications" USING "btree" ("page_id") WHERE ("page_id" IS NOT NULL);



CREATE INDEX "notifications_pull_request_id_idx" ON "public"."notifications" USING "btree" ("pull_request_id") WHERE ("pull_request_id" IS NOT NULL);



CREATE INDEX "push_subscriptions_native_installation_idx" ON "public"."push_subscriptions" USING "btree" ("native_installation_id") WHERE ("native_installation_id" IS NOT NULL);



CREATE INDEX "share_unlock_attempts_share_idx" ON "public"."share_unlock_attempts" USING "btree" ("share_id", "created_at" DESC);



CREATE INDEX "share_unlock_attempts_share_ip_idx" ON "public"."share_unlock_attempts" USING "btree" ("share_id", "ip_hash", "created_at" DESC);



CREATE UNIQUE INDEX "uniq_views_system_global" ON "public"."views" USING "btree" ("user_id") WHERE (("kind" = 'my'::"text") AND ("project_id" IS NULL));



CREATE UNIQUE INDEX "uniq_views_system_project" ON "public"."views" USING "btree" ("user_id", "project_id") WHERE (("kind" = 'my'::"text") AND ("project_id" IS NOT NULL));



CREATE UNIQUE INDEX "view_shares_page_unique" ON "public"."view_shares" USING "btree" ("page_id") WHERE ("page_id" IS NOT NULL);



CREATE OR REPLACE TRIGGER "agent_chains_broadcast_insert" AFTER INSERT ON "public"."agent_chains" FOR EACH ROW EXECUTE FUNCTION "public"."broadcast_agent_chain_row"();



CREATE OR REPLACE TRIGGER "agent_chains_broadcast_update" AFTER UPDATE ON "public"."agent_chains" FOR EACH ROW WHEN ((("old"."status" IS DISTINCT FROM "new"."status") OR ("old"."step" IS DISTINCT FROM "new"."step") OR ("old"."spent_usd" IS DISTINCT FROM "new"."spent_usd") OR ("old"."not_before" IS DISTINCT FROM "new"."not_before") OR ("old"."stop_reason" IS DISTINCT FROM "new"."stop_reason"))) EXECUTE FUNCTION "public"."broadcast_agent_chain_row"();



CREATE OR REPLACE TRIGGER "agent_chains_set_updated_at" BEFORE UPDATE ON "public"."agent_chains" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "agent_conversations_set_updated_at" BEFORE UPDATE ON "public"."agent_conversations" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "agent_routines_set_updated_at" BEFORE UPDATE ON "public"."agent_routines" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "agent_runs_broadcast_insert" AFTER INSERT ON "public"."agent_runs" FOR EACH ROW EXECUTE FUNCTION "public"."broadcast_agent_run_row"();



CREATE OR REPLACE TRIGGER "agent_runs_broadcast_update" AFTER UPDATE ON "public"."agent_runs" FOR EACH ROW WHEN ((("old"."status" IS DISTINCT FROM "new"."status") OR ("old"."pr_state" IS DISTINCT FROM "new"."pr_state") OR ("old"."pr_number" IS DISTINCT FROM "new"."pr_number") OR ("old"."awaiting_input" IS DISTINCT FROM "new"."awaiting_input"))) EXECUTE FUNCTION "public"."broadcast_agent_run_row"();



CREATE OR REPLACE TRIGGER "agent_runs_set_completed_at" BEFORE UPDATE ON "public"."agent_runs" FOR EACH ROW EXECUTE FUNCTION "public"."agent_runs_stamp_completed_at"();



CREATE OR REPLACE TRIGGER "agent_runs_set_updated_at" BEFORE UPDATE ON "public"."agent_runs" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "ai_usage_broadcast" AFTER INSERT ON "public"."ai_usage" FOR EACH ROW EXECUTE FUNCTION "public"."broadcast_billing_row"();



CREATE OR REPLACE TRIGGER "assistant_active_conversation_set_updated_at" BEFORE UPDATE ON "public"."assistant_active_conversation" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "attachments_broadcast" AFTER INSERT OR DELETE OR UPDATE ON "public"."attachments" FOR EACH ROW EXECUTE FUNCTION "public"."broadcast_project_scoped"();



CREATE OR REPLACE TRIGGER "billing_accounts_broadcast" AFTER INSERT OR UPDATE ON "public"."billing_accounts" FOR EACH ROW EXECUTE FUNCTION "public"."broadcast_billing_row"();



CREATE OR REPLACE TRIGGER "categories_broadcast" AFTER INSERT OR DELETE OR UPDATE ON "public"."categories" FOR EACH ROW EXECUTE FUNCTION "public"."broadcast_project_scoped"();



CREATE OR REPLACE TRIGGER "categories_freeze_project_id" BEFORE UPDATE OF "project_id" ON "public"."categories" FOR EACH ROW EXECUTE FUNCTION "public"."freeze_project_id"();



CREATE OR REPLACE TRIGGER "comments_broadcast" AFTER INSERT OR DELETE OR UPDATE ON "public"."comments" FOR EACH ROW EXECUTE FUNCTION "public"."broadcast_activity_scoped"();



CREATE OR REPLACE TRIGGER "comments_set_updated_at" BEFORE UPDATE ON "public"."comments" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "conversations_freeze_project_id" BEFORE UPDATE OF "project_id" ON "public"."conversations" FOR EACH ROW EXECUTE FUNCTION "public"."freeze_project_id"();



CREATE OR REPLACE TRIGGER "conversations_set_updated_at" BEFORE UPDATE ON "public"."conversations" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "custom_domains_set_updated_at" BEFORE UPDATE ON "public"."custom_domains" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "cycles_broadcast" AFTER INSERT OR DELETE OR UPDATE ON "public"."cycles" FOR EACH ROW EXECUTE FUNCTION "public"."broadcast_notifications_row"();



CREATE OR REPLACE TRIGGER "cycles_set_updated_at" BEFORE UPDATE ON "public"."cycles" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "feedback_boards_set_updated_at" BEFORE UPDATE ON "public"."feedback_boards" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "feedback_post_categories_broadcast" AFTER INSERT OR DELETE OR UPDATE ON "public"."feedback_post_categories" FOR EACH ROW EXECUTE FUNCTION "public"."broadcast_feedback_child"();



CREATE OR REPLACE TRIGGER "feedback_posts_broadcast" AFTER INSERT OR DELETE OR UPDATE ON "public"."feedback_posts" FOR EACH ROW EXECUTE FUNCTION "public"."broadcast_feedback_post"();



CREATE OR REPLACE TRIGGER "feedback_posts_set_updated_at" BEFORE UPDATE ON "public"."feedback_posts" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "feedback_users_set_updated_at" BEFORE UPDATE ON "public"."feedback_users" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "feedback_votes_broadcast" AFTER INSERT OR DELETE OR UPDATE ON "public"."feedback_votes" FOR EACH ROW EXECUTE FUNCTION "public"."broadcast_feedback_child"();



CREATE OR REPLACE TRIGGER "feedback_votes_count" AFTER INSERT OR DELETE OR UPDATE OF "post_id" ON "public"."feedback_votes" FOR EACH ROW EXECUTE FUNCTION "public"."feedback_votes_maintain_count"();



CREATE OR REPLACE TRIGGER "issue_categories_broadcast" AFTER INSERT OR DELETE OR UPDATE ON "public"."issue_categories" FOR EACH ROW EXECUTE FUNCTION "public"."broadcast_issue_scoped"();



CREATE OR REPLACE TRIGGER "issue_events_broadcast" AFTER INSERT OR DELETE OR UPDATE ON "public"."issue_events" FOR EACH ROW EXECUTE FUNCTION "public"."broadcast_event_scoped"();



CREATE OR REPLACE TRIGGER "issue_relations_broadcast" AFTER INSERT OR DELETE OR UPDATE ON "public"."issue_relations" FOR EACH ROW EXECUTE FUNCTION "public"."broadcast_project_scoped"();



CREATE OR REPLACE TRIGGER "issue_relations_enforce" BEFORE INSERT OR UPDATE ON "public"."issue_relations" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_issue_relation"();



CREATE OR REPLACE TRIGGER "issues_broadcast" AFTER INSERT OR DELETE OR UPDATE ON "public"."issues" FOR EACH ROW EXECUTE FUNCTION "public"."broadcast_project_scoped"();



CREATE OR REPLACE TRIGGER "issues_enforce_cycle" BEFORE INSERT OR UPDATE ON "public"."issues" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_issue_cycle"();



CREATE OR REPLACE TRIGGER "issues_freeze_project_id" BEFORE UPDATE OF "project_id" ON "public"."issues" FOR EACH ROW EXECUTE FUNCTION "public"."freeze_project_id"();



CREATE OR REPLACE TRIGGER "issues_one_level" BEFORE INSERT OR UPDATE ON "public"."issues" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_one_level_subissues"();



CREATE OR REPLACE TRIGGER "issues_refs_same_project" BEFORE INSERT OR UPDATE OF "objective_id", "duplicate_of_id" ON "public"."issues" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_issue_refs_same_project"();



CREATE OR REPLACE TRIGGER "issues_set_updated_at" BEFORE UPDATE ON "public"."issues" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "issues_sync_objective_status" AFTER INSERT OR DELETE OR UPDATE ON "public"."issues" FOR EACH ROW EXECUTE FUNCTION "public"."issues_sync_objective_status"();



CREATE OR REPLACE TRIGGER "notifications_broadcast" AFTER INSERT OR DELETE OR UPDATE ON "public"."notifications" FOR EACH ROW EXECUTE FUNCTION "public"."broadcast_notifications_row"();



CREATE OR REPLACE TRIGGER "notifications_freeze_project_id" BEFORE UPDATE OF "project_id" ON "public"."notifications" FOR EACH ROW EXECUTE FUNCTION "public"."freeze_project_id"();



CREATE OR REPLACE TRIGGER "objectives_broadcast" AFTER INSERT OR DELETE OR UPDATE ON "public"."objectives" FOR EACH ROW EXECUTE FUNCTION "public"."broadcast_project_scoped"();



CREATE OR REPLACE TRIGGER "objectives_freeze_project_id" BEFORE UPDATE OF "project_id" ON "public"."objectives" FOR EACH ROW EXECUTE FUNCTION "public"."freeze_project_id"();



CREATE OR REPLACE TRIGGER "objectives_set_updated_at" BEFORE UPDATE ON "public"."objectives" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "page_comments_broadcast" AFTER INSERT OR DELETE OR UPDATE ON "public"."page_comments" FOR EACH ROW EXECUTE FUNCTION "public"."broadcast_project_scoped"();



CREATE OR REPLACE TRIGGER "page_comments_freeze_project_id" BEFORE UPDATE OF "project_id" ON "public"."page_comments" FOR EACH ROW EXECUTE FUNCTION "public"."freeze_project_id"();



CREATE OR REPLACE TRIGGER "page_comments_set_updated_at" BEFORE UPDATE ON "public"."page_comments" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "page_links_broadcast" AFTER INSERT OR DELETE OR UPDATE ON "public"."page_links" FOR EACH ROW EXECUTE FUNCTION "public"."broadcast_project_scoped"();



CREATE OR REPLACE TRIGGER "pages_broadcast_delete" AFTER DELETE ON "public"."pages" FOR EACH ROW EXECUTE FUNCTION "public"."broadcast_page_row"();



CREATE OR REPLACE TRIGGER "pages_broadcast_insert" AFTER INSERT ON "public"."pages" FOR EACH ROW EXECUTE FUNCTION "public"."broadcast_page_row"();



CREATE OR REPLACE TRIGGER "pages_broadcast_update" AFTER UPDATE ON "public"."pages" FOR EACH ROW WHEN ((("old"."title" IS DISTINCT FROM "new"."title") OR ("old"."icon" IS DISTINCT FROM "new"."icon") OR ("old"."parent_id" IS DISTINCT FROM "new"."parent_id") OR ("old"."position" IS DISTINCT FROM "new"."position") OR ("old"."favorite" IS DISTINCT FROM "new"."favorite") OR ("old"."deleted_at" IS DISTINCT FROM "new"."deleted_at") OR ("old"."deleted_root_id" IS DISTINCT FROM "new"."deleted_root_id") OR ("old"."parent_block_removed" IS DISTINCT FROM "new"."parent_block_removed"))) EXECUTE FUNCTION "public"."broadcast_page_row"();



CREATE OR REPLACE TRIGGER "pages_freeze_project_id" BEFORE UPDATE OF "project_id" ON "public"."pages" FOR EACH ROW EXECUTE FUNCTION "public"."freeze_project_id"();



CREATE OR REPLACE TRIGGER "pages_set_updated_at" BEFORE UPDATE ON "public"."pages" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "project_drafts_set_updated_at" BEFORE UPDATE ON "public"."project_drafts" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "project_invitations_broadcast" AFTER INSERT OR DELETE OR UPDATE ON "public"."project_invitations" FOR EACH ROW EXECUTE FUNCTION "public"."broadcast_invitations_row"();



CREATE OR REPLACE TRIGGER "project_invitations_freeze_project_id" BEFORE UPDATE OF "project_id" ON "public"."project_invitations" FOR EACH ROW EXECUTE FUNCTION "public"."freeze_project_id"();



CREATE OR REPLACE TRIGGER "project_invitations_set_updated_at" BEFORE UPDATE ON "public"."project_invitations" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "project_members_broadcast" AFTER INSERT OR DELETE OR UPDATE ON "public"."project_members" FOR EACH ROW EXECUTE FUNCTION "public"."broadcast_members_row"();



CREATE OR REPLACE TRIGGER "project_members_freeze_project_id" BEFORE UPDATE OF "project_id" ON "public"."project_members" FOR EACH ROW EXECUTE FUNCTION "public"."freeze_project_id"();



CREATE OR REPLACE TRIGGER "projects_broadcast" AFTER INSERT OR DELETE OR UPDATE ON "public"."projects" FOR EACH ROW EXECUTE FUNCTION "public"."broadcast_projects_row"();



CREATE OR REPLACE TRIGGER "projects_set_updated_at" BEFORE UPDATE ON "public"."projects" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "pull_requests_broadcast_insert" AFTER INSERT ON "public"."pull_requests" FOR EACH ROW EXECUTE FUNCTION "public"."broadcast_pull_request_row"();



CREATE OR REPLACE TRIGGER "pull_requests_broadcast_update" AFTER UPDATE ON "public"."pull_requests" FOR EACH ROW WHEN ((("old"."state" IS DISTINCT FROM "new"."state") OR ("old"."title" IS DISTINCT FROM "new"."title") OR ("old"."url" IS DISTINCT FROM "new"."url") OR ("old"."head_sha" IS DISTINCT FROM "new"."head_sha") OR ("old"."issue_id" IS DISTINCT FROM "new"."issue_id") OR ("old"."merged_at" IS DISTINCT FROM "new"."merged_at"))) EXECUTE FUNCTION "public"."broadcast_pull_request_row"();



CREATE OR REPLACE TRIGGER "saved_views_set_updated_at" BEFORE UPDATE ON "public"."saved_views" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_agent_assistant_message_capture" AFTER INSERT ON "public"."agent_run_events" FOR EACH ROW EXECUTE FUNCTION "public"."capture_agent_assistant_message"();



CREATE OR REPLACE TRIGGER "trg_agent_queue_message_capture" AFTER INSERT ON "public"."agent_run_messages" FOR EACH ROW EXECUTE FUNCTION "public"."capture_agent_queue_message"();



CREATE OR REPLACE TRIGGER "trg_agent_run_cleanup_conversation" AFTER DELETE ON "public"."agent_runs" FOR EACH ROW EXECUTE FUNCTION "public"."cleanup_agent_run_conversation"();



CREATE OR REPLACE TRIGGER "trg_agent_run_create_turn" AFTER INSERT ON "public"."agent_runs" FOR EACH ROW EXECUTE FUNCTION "public"."create_agent_turn_for_run"();



CREATE OR REPLACE TRIGGER "trg_agent_run_ensure_conversation" BEFORE INSERT ON "public"."agent_runs" FOR EACH ROW EXECUTE FUNCTION "public"."ensure_agent_run_conversation"();



CREATE OR REPLACE TRIGGER "trg_agent_run_runtime_sync" AFTER INSERT OR UPDATE OF "repo_link_id", "connection_id", "base_branch", "branch_name", "sandbox_id", "checkpoint", "agent_engine", "local_exec", "local_worktree", "provider_key_id", "last_activity_at", "sandbox_stopped_at", "pr_number", "pr_url", "pr_state", "updated_at" ON "public"."agent_runs" FOR EACH ROW EXECUTE FUNCTION "public"."sync_agent_runtime_from_run"();



CREATE OR REPLACE TRIGGER "trg_agent_run_sync_conversation" AFTER INSERT OR UPDATE OF "title", "issue_id", "pull_request_id", "status", "completed_at" ON "public"."agent_runs" FOR EACH ROW EXECUTE FUNCTION "public"."sync_agent_run_conversation"();



CREATE OR REPLACE TRIGGER "trg_agent_run_sync_turn" AFTER UPDATE OF "status", "model", "reasoning_level", "cost_usd", "outcome", "error_message", "started_at", "completed_at", "updated_at" ON "public"."agent_runs" FOR EACH ROW EXECUTE FUNCTION "public"."sync_agent_turn_from_run"();



CREATE OR REPLACE TRIGGER "user_agent_preferences_set_updated_at" BEFORE UPDATE ON "public"."user_agent_preferences" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "user_ai_keys_set_updated_at" BEFORE UPDATE ON "public"."user_ai_keys" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "user_scratchpad_broadcast" AFTER INSERT OR DELETE OR UPDATE ON "public"."user_scratchpad" FOR EACH ROW EXECUTE FUNCTION "public"."broadcast_scratchpad_row"();



CREATE OR REPLACE TRIGGER "user_scratchpad_set_updated_at" BEFORE UPDATE ON "public"."user_scratchpad" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "view_shares_set_updated_at" BEFORE UPDATE ON "public"."view_shares" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "views_broadcast" AFTER INSERT OR DELETE OR UPDATE ON "public"."views" FOR EACH ROW EXECUTE FUNCTION "public"."broadcast_views_row"();



CREATE OR REPLACE TRIGGER "views_freeze_project_id" BEFORE UPDATE OF "project_id" ON "public"."views" FOR EACH ROW EXECUTE FUNCTION "public"."freeze_project_id"();



CREATE OR REPLACE TRIGGER "views_set_updated_at" BEFORE UPDATE ON "public"."views" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



ALTER TABLE ONLY "public"."agent_artifacts"
    ADD CONSTRAINT "agent_artifacts_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."agent_conversations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."agent_artifacts"
    ADD CONSTRAINT "agent_artifacts_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "public"."agent_runs"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."agent_chains"
    ADD CONSTRAINT "agent_chains_issue_id_fkey" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."agent_chains"
    ADD CONSTRAINT "agent_chains_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."agent_chains"
    ADD CONSTRAINT "agent_chains_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."agent_conversation_contexts"
    ADD CONSTRAINT "agent_conversation_contexts_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."agent_conversations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."agent_conversation_pins"
    ADD CONSTRAINT "agent_conversation_pins_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."agent_conversations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."agent_conversation_pins"
    ADD CONSTRAINT "agent_conversation_pins_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."agent_conversation_reads"
    ADD CONSTRAINT "agent_conversation_reads_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."agent_conversations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."agent_conversation_reads"
    ADD CONSTRAINT "agent_conversation_reads_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."agent_conversations"
    ADD CONSTRAINT "agent_conversations_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."agent_conversations"
    ADD CONSTRAINT "agent_conversations_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."agent_messages"
    ADD CONSTRAINT "agent_messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."agent_conversations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."agent_messages"
    ADD CONSTRAINT "agent_messages_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."agent_messages"
    ADD CONSTRAINT "agent_messages_legacy_event_id_fkey" FOREIGN KEY ("legacy_event_id") REFERENCES "public"."agent_run_events"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."agent_messages"
    ADD CONSTRAINT "agent_messages_legacy_queue_message_id_fkey" FOREIGN KEY ("legacy_queue_message_id") REFERENCES "public"."agent_run_messages"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."agent_messages"
    ADD CONSTRAINT "agent_messages_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "public"."agent_runs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."agent_messages"
    ADD CONSTRAINT "agent_messages_turn_id_fkey" FOREIGN KEY ("turn_id") REFERENCES "public"."agent_turns"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."agent_quota_resets"
    ADD CONSTRAINT "agent_quota_resets_reset_by_fkey" FOREIGN KEY ("reset_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."agent_quota_resets"
    ADD CONSTRAINT "agent_quota_resets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."agent_routines"
    ADD CONSTRAINT "agent_routines_deleted_by_fkey" FOREIGN KEY ("deleted_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."agent_routines"
    ADD CONSTRAINT "agent_routines_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."agent_routines"
    ADD CONSTRAINT "agent_routines_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."agent_run_events"
    ADD CONSTRAINT "agent_run_events_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "public"."agent_runs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."agent_run_journal"
    ADD CONSTRAINT "agent_run_journal_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "public"."agent_runs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."agent_run_messages"
    ADD CONSTRAINT "agent_run_messages_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."agent_run_messages"
    ADD CONSTRAINT "agent_run_messages_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "public"."agent_runs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."agent_runs"
    ADD CONSTRAINT "agent_runs_chain_id_fkey" FOREIGN KEY ("chain_id") REFERENCES "public"."agent_chains"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."agent_runs"
    ADD CONSTRAINT "agent_runs_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "public"."git_connections"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."agent_runs"
    ADD CONSTRAINT "agent_runs_conversation_project_fkey" FOREIGN KEY ("conversation_id", "project_id") REFERENCES "public"."agent_conversations"("id", "project_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."agent_runs"
    ADD CONSTRAINT "agent_runs_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."agent_runs"
    ADD CONSTRAINT "agent_runs_issue_id_fkey" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."agent_runs"
    ADD CONSTRAINT "agent_runs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."agent_runs"
    ADD CONSTRAINT "agent_runs_pull_request_id_fkey" FOREIGN KEY ("pull_request_id") REFERENCES "public"."pull_requests"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."agent_runs"
    ADD CONSTRAINT "agent_runs_repo_link_id_fkey" FOREIGN KEY ("repo_link_id") REFERENCES "public"."project_git_links"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."agent_runs"
    ADD CONSTRAINT "agent_runs_routine_id_fkey" FOREIGN KEY ("routine_id") REFERENCES "public"."agent_routines"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."agent_runtime_sessions"
    ADD CONSTRAINT "agent_runtime_sessions_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "public"."git_connections"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."agent_runtime_sessions"
    ADD CONSTRAINT "agent_runtime_sessions_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."agent_conversations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."agent_runtime_sessions"
    ADD CONSTRAINT "agent_runtime_sessions_current_run_id_fkey" FOREIGN KEY ("current_run_id") REFERENCES "public"."agent_runs"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."agent_runtime_sessions"
    ADD CONSTRAINT "agent_runtime_sessions_repo_link_id_fkey" FOREIGN KEY ("repo_link_id") REFERENCES "public"."project_git_links"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."agent_session_reads"
    ADD CONSTRAINT "agent_session_reads_issue_id_fkey" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."agent_session_reads"
    ADD CONSTRAINT "agent_session_reads_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."agent_turns"
    ADD CONSTRAINT "agent_turns_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."agent_conversations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."agent_turns"
    ADD CONSTRAINT "agent_turns_initiated_by_fkey" FOREIGN KEY ("initiated_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."agent_turns"
    ADD CONSTRAINT "agent_turns_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "public"."agent_runs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ai_usage"
    ADD CONSTRAINT "ai_usage_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."ai_usage"
    ADD CONSTRAINT "ai_usage_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."api_keys"
    ADD CONSTRAINT "api_keys_oauth_client_id_fkey" FOREIGN KEY ("oauth_client_id") REFERENCES "public"."oauth_clients"("client_id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."api_keys"
    ADD CONSTRAINT "api_keys_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."assistant_active_conversation"
    ADD CONSTRAINT "assistant_active_conversation_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."assistant_active_conversation"
    ADD CONSTRAINT "assistant_active_conversation_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."assistant_messages"
    ADD CONSTRAINT "assistant_messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."attachments"
    ADD CONSTRAINT "attachments_comment_id_fkey" FOREIGN KEY ("comment_id") REFERENCES "public"."comments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."attachments"
    ADD CONSTRAINT "attachments_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."attachments"
    ADD CONSTRAINT "attachments_feedback_post_id_fkey" FOREIGN KEY ("feedback_post_id") REFERENCES "public"."feedback_posts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."attachments"
    ADD CONSTRAINT "attachments_issue_id_fkey" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."attachments"
    ADD CONSTRAINT "attachments_objective_id_fkey" FOREIGN KEY ("objective_id") REFERENCES "public"."objectives"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."attachments"
    ADD CONSTRAINT "attachments_page_id_fkey" FOREIGN KEY ("page_id") REFERENCES "public"."pages"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."attachments"
    ADD CONSTRAINT "attachments_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."billing_accounts"
    ADD CONSTRAINT "billing_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."categories"
    ADD CONSTRAINT "categories_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."comments"
    ADD CONSTRAINT "comments_api_key_id_fkey" FOREIGN KEY ("api_key_id") REFERENCES "public"."api_keys"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."comments"
    ADD CONSTRAINT "comments_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."comments"
    ADD CONSTRAINT "comments_feedback_post_id_fkey" FOREIGN KEY ("feedback_post_id") REFERENCES "public"."feedback_posts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."comments"
    ADD CONSTRAINT "comments_feedback_user_id_fkey" FOREIGN KEY ("feedback_user_id") REFERENCES "public"."feedback_users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."comments"
    ADD CONSTRAINT "comments_issue_id_fkey" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."comments"
    ADD CONSTRAINT "comments_objective_id_fkey" FOREIGN KEY ("objective_id") REFERENCES "public"."objectives"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."comments"
    ADD CONSTRAINT "comments_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "public"."comments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."custom_domains"
    ADD CONSTRAINT "custom_domains_board_id_fkey" FOREIGN KEY ("board_id") REFERENCES "public"."feedback_boards"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."custom_domains"
    ADD CONSTRAINT "custom_domains_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."custom_domains"
    ADD CONSTRAINT "custom_domains_share_id_fkey" FOREIGN KEY ("share_id") REFERENCES "public"."view_shares"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."cycles"
    ADD CONSTRAINT "cycles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."feedback_boards"
    ADD CONSTRAINT "feedback_boards_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."feedback_merge_events"
    ADD CONSTRAINT "feedback_merge_events_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."feedback_merge_events"
    ADD CONSTRAINT "feedback_merge_events_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."feedback_merge_events"
    ADD CONSTRAINT "feedback_merge_events_undone_by_fkey" FOREIGN KEY ("undone_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."feedback_merge_rejections"
    ADD CONSTRAINT "feedback_merge_rejections_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."feedback_merge_rejections"
    ADD CONSTRAINT "feedback_merge_rejections_rejected_by_fkey" FOREIGN KEY ("rejected_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."feedback_otp_codes"
    ADD CONSTRAINT "feedback_otp_codes_board_id_fkey" FOREIGN KEY ("board_id") REFERENCES "public"."feedback_boards"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."feedback_post_categories"
    ADD CONSTRAINT "feedback_post_categories_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."feedback_post_categories"
    ADD CONSTRAINT "feedback_post_categories_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "public"."feedback_posts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."feedback_posts"
    ADD CONSTRAINT "feedback_posts_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "public"."feedback_users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."feedback_posts"
    ADD CONSTRAINT "feedback_posts_created_by_member_fkey" FOREIGN KEY ("created_by_member") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."feedback_posts"
    ADD CONSTRAINT "feedback_posts_deleted_by_fkey" FOREIGN KEY ("deleted_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."feedback_posts"
    ADD CONSTRAINT "feedback_posts_issue_id_fkey" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."feedback_posts"
    ADD CONSTRAINT "feedback_posts_merged_into_id_fkey" FOREIGN KEY ("merged_into_id") REFERENCES "public"."feedback_posts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."feedback_posts"
    ADD CONSTRAINT "feedback_posts_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."feedback_posts"
    ADD CONSTRAINT "feedback_posts_suggested_merge_into_id_fkey" FOREIGN KEY ("suggested_merge_into_id") REFERENCES "public"."feedback_posts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."feedback_sessions"
    ADD CONSTRAINT "feedback_sessions_board_id_fkey" FOREIGN KEY ("board_id") REFERENCES "public"."feedback_boards"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."feedback_sessions"
    ADD CONSTRAINT "feedback_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."feedback_users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."feedback_sso_replays"
    ADD CONSTRAINT "feedback_sso_replays_board_id_fkey" FOREIGN KEY ("board_id") REFERENCES "public"."feedback_boards"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."feedback_users"
    ADD CONSTRAINT "feedback_users_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."feedback_votes"
    ADD CONSTRAINT "feedback_votes_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "public"."feedback_posts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."feedback_votes"
    ADD CONSTRAINT "feedback_votes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."feedback_users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."git_connections"
    ADD CONSTRAINT "git_connections_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."git_user_identities"
    ADD CONSTRAINT "git_user_identities_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."integrations"
    ADD CONSTRAINT "integrations_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."integrations"
    ADD CONSTRAINT "integrations_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."issue_categories"
    ADD CONSTRAINT "issue_categories_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."issue_categories"
    ADD CONSTRAINT "issue_categories_issue_id_fkey" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."issue_events"
    ADD CONSTRAINT "issue_events_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."issue_events"
    ADD CONSTRAINT "issue_events_api_key_id_fkey" FOREIGN KEY ("api_key_id") REFERENCES "public"."api_keys"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."issue_events"
    ADD CONSTRAINT "issue_events_feedback_post_id_fkey" FOREIGN KEY ("feedback_post_id") REFERENCES "public"."feedback_posts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."issue_events"
    ADD CONSTRAINT "issue_events_integration_id_fkey" FOREIGN KEY ("integration_id") REFERENCES "public"."integrations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."issue_events"
    ADD CONSTRAINT "issue_events_issue_id_fkey" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."issue_events"
    ADD CONSTRAINT "issue_events_objective_id_fkey" FOREIGN KEY ("objective_id") REFERENCES "public"."objectives"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."issue_events"
    ADD CONSTRAINT "issue_events_page_id_fkey" FOREIGN KEY ("page_id") REFERENCES "public"."pages"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."issue_relations"
    ADD CONSTRAINT "issue_relations_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."issue_relations"
    ADD CONSTRAINT "issue_relations_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."issue_relations"
    ADD CONSTRAINT "issue_relations_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "public"."issues"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."issue_relations"
    ADD CONSTRAINT "issue_relations_target_id_fkey" FOREIGN KEY ("target_id") REFERENCES "public"."issues"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."issues"
    ADD CONSTRAINT "issues_assignee_id_fkey" FOREIGN KEY ("assignee_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."issues"
    ADD CONSTRAINT "issues_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."issues"
    ADD CONSTRAINT "issues_cycle_id_fkey" FOREIGN KEY ("cycle_id") REFERENCES "public"."cycles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."issues"
    ADD CONSTRAINT "issues_deleted_by_fkey" FOREIGN KEY ("deleted_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."issues"
    ADD CONSTRAINT "issues_duplicate_of_id_fkey" FOREIGN KEY ("duplicate_of_id") REFERENCES "public"."issues"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."issues"
    ADD CONSTRAINT "issues_integration_id_fkey" FOREIGN KEY ("integration_id") REFERENCES "public"."integrations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."issues"
    ADD CONSTRAINT "issues_objective_id_fkey" FOREIGN KEY ("objective_id") REFERENCES "public"."objectives"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."issues"
    ADD CONSTRAINT "issues_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "public"."issues"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."issues"
    ADD CONSTRAINT "issues_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."issues"
    ADD CONSTRAINT "issues_recurrence_series_id_fkey" FOREIGN KEY ("recurrence_series_id") REFERENCES "public"."issues"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."mfa_recovery_codes"
    ADD CONSTRAINT "mfa_recovery_codes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_agent_conversation_project_fkey" FOREIGN KEY ("agent_conversation_id", "project_id") REFERENCES "public"."agent_conversations"("id", "project_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_api_key_id_fkey" FOREIGN KEY ("api_key_id") REFERENCES "public"."api_keys"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_comment_id_fkey" FOREIGN KEY ("comment_id") REFERENCES "public"."comments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_feedback_post_id_fkey" FOREIGN KEY ("feedback_post_id") REFERENCES "public"."feedback_posts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_issue_id_fkey" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_objective_id_fkey" FOREIGN KEY ("objective_id") REFERENCES "public"."objectives"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_page_id_fkey" FOREIGN KEY ("page_id") REFERENCES "public"."pages"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_pull_request_id_fkey" FOREIGN KEY ("pull_request_id") REFERENCES "public"."pull_requests"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_routine_id_fkey" FOREIGN KEY ("routine_id") REFERENCES "public"."agent_routines"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."oauth_authorization_codes"
    ADD CONSTRAINT "oauth_authorization_codes_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."oauth_clients"("client_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."oauth_authorization_codes"
    ADD CONSTRAINT "oauth_authorization_codes_grant_id_fkey" FOREIGN KEY ("grant_id") REFERENCES "public"."oauth_grants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."oauth_authorization_codes"
    ADD CONSTRAINT "oauth_authorization_codes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."oauth_grants"
    ADD CONSTRAINT "oauth_grants_api_key_id_fkey" FOREIGN KEY ("api_key_id") REFERENCES "public"."api_keys"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."oauth_grants"
    ADD CONSTRAINT "oauth_grants_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."oauth_clients"("client_id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."oauth_grants"
    ADD CONSTRAINT "oauth_grants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."objectives"
    ADD CONSTRAINT "objectives_deleted_by_fkey" FOREIGN KEY ("deleted_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."objectives"
    ADD CONSTRAINT "objectives_lead_user_id_fkey" FOREIGN KEY ("lead_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."objectives"
    ADD CONSTRAINT "objectives_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."page_comments"
    ADD CONSTRAINT "page_comments_api_key_id_fkey" FOREIGN KEY ("api_key_id") REFERENCES "public"."api_keys"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."page_comments"
    ADD CONSTRAINT "page_comments_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."page_comments"
    ADD CONSTRAINT "page_comments_page_id_fkey" FOREIGN KEY ("page_id") REFERENCES "public"."pages"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."page_comments"
    ADD CONSTRAINT "page_comments_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "public"."page_comments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."page_comments"
    ADD CONSTRAINT "page_comments_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."page_files"
    ADD CONSTRAINT "page_files_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."page_files"
    ADD CONSTRAINT "page_files_page_id_fkey" FOREIGN KEY ("page_id") REFERENCES "public"."pages"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."page_files"
    ADD CONSTRAINT "page_files_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."page_links"
    ADD CONSTRAINT "page_links_page_id_fkey" FOREIGN KEY ("page_id") REFERENCES "public"."pages"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."page_links"
    ADD CONSTRAINT "page_links_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."page_versions"
    ADD CONSTRAINT "page_versions_author_api_key_id_fkey" FOREIGN KEY ("author_api_key_id") REFERENCES "public"."api_keys"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."page_versions"
    ADD CONSTRAINT "page_versions_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."page_versions"
    ADD CONSTRAINT "page_versions_page_id_fkey" FOREIGN KEY ("page_id") REFERENCES "public"."pages"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."page_versions"
    ADD CONSTRAINT "page_versions_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pages"
    ADD CONSTRAINT "pages_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."pages"
    ADD CONSTRAINT "pages_deleted_by_fkey" FOREIGN KEY ("deleted_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."pages"
    ADD CONSTRAINT "pages_deleted_root_id_fkey" FOREIGN KEY ("deleted_root_id") REFERENCES "public"."pages"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."pages"
    ADD CONSTRAINT "pages_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "public"."pages"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."pages"
    ADD CONSTRAINT "pages_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pages"
    ADD CONSTRAINT "pages_updated_api_key_id_fkey" FOREIGN KEY ("updated_api_key_id") REFERENCES "public"."api_keys"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."pages"
    ADD CONSTRAINT "pages_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."project_drafts"
    ADD CONSTRAINT "project_drafts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."project_git_links"
    ADD CONSTRAINT "project_git_links_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "public"."git_connections"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."project_git_links"
    ADD CONSTRAINT "project_git_links_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."project_git_links"
    ADD CONSTRAINT "project_git_links_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."project_invitations"
    ADD CONSTRAINT "project_invitations_invited_by_fkey" FOREIGN KEY ("invited_by") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."project_invitations"
    ADD CONSTRAINT "project_invitations_invited_user_id_fkey" FOREIGN KEY ("invited_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."project_invitations"
    ADD CONSTRAINT "project_invitations_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."project_members"
    ADD CONSTRAINT "project_members_added_by_fkey" FOREIGN KEY ("added_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."project_members"
    ADD CONSTRAINT "project_members_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."project_members"
    ADD CONSTRAINT "project_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."projects"
    ADD CONSTRAINT "projects_deleted_by_fkey" FOREIGN KEY ("deleted_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."projects"
    ADD CONSTRAINT "projects_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pull_requests"
    ADD CONSTRAINT "pull_requests_issue_id_fkey" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."push_subscriptions"
    ADD CONSTRAINT "push_subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."saved_views"
    ADD CONSTRAINT "saved_views_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."share_unlock_attempts"
    ADD CONSTRAINT "share_unlock_attempts_share_id_fkey" FOREIGN KEY ("share_id") REFERENCES "public"."view_shares"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."stat_events"
    ADD CONSTRAINT "stat_events_issue_id_fkey" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."stat_events"
    ADD CONSTRAINT "stat_events_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."stat_events"
    ADD CONSTRAINT "stat_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_agent_preferences"
    ADD CONSTRAINT "user_agent_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_ai_keys"
    ADD CONSTRAINT "user_ai_keys_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_avatars"
    ADD CONSTRAINT "user_avatars_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_scratchpad"
    ADD CONSTRAINT "user_scratchpad_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."view_shares"
    ADD CONSTRAINT "view_shares_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."view_shares"
    ADD CONSTRAINT "view_shares_page_id_fkey" FOREIGN KEY ("page_id") REFERENCES "public"."pages"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."view_shares"
    ADD CONSTRAINT "view_shares_view_id_fkey" FOREIGN KEY ("view_id") REFERENCES "public"."views"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."views"
    ADD CONSTRAINT "views_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."views"
    ADD CONSTRAINT "views_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE "public"."agent_artifacts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "agent_artifacts_select" ON "public"."agent_artifacts" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."agent_conversations" "c"
  WHERE (("c"."id" = "agent_artifacts"."conversation_id") AND "public"."can_access_project"("c"."project_id") AND (("c"."visibility" = 'project'::"text") OR ("c"."owner_id" = ( SELECT "auth"."uid"() AS "uid")))))));



ALTER TABLE "public"."agent_chains" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "agent_chains_select" ON "public"."agent_chains" FOR SELECT TO "authenticated" USING ("public"."can_access_project"("project_id"));



ALTER TABLE "public"."agent_conversation_contexts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "agent_conversation_contexts_select" ON "public"."agent_conversation_contexts" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."agent_conversations" "c"
  WHERE (("c"."id" = "agent_conversation_contexts"."conversation_id") AND "public"."can_access_project"("c"."project_id") AND (("c"."visibility" = 'project'::"text") OR ("c"."owner_id" = ( SELECT "auth"."uid"() AS "uid")))))));



ALTER TABLE "public"."agent_conversation_pins" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "agent_conversation_pins_delete" ON "public"."agent_conversation_pins" FOR DELETE TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "agent_conversation_pins_insert" ON "public"."agent_conversation_pins" FOR INSERT TO "authenticated" WITH CHECK ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) AND (EXISTS ( SELECT 1
   FROM "public"."agent_conversations" "c"
  WHERE (("c"."id" = "agent_conversation_pins"."conversation_id") AND "public"."can_access_project"("c"."project_id") AND (("c"."visibility" = 'project'::"text") OR ("c"."owner_id" = ( SELECT "auth"."uid"() AS "uid"))))))));



CREATE POLICY "agent_conversation_pins_select" ON "public"."agent_conversation_pins" FOR SELECT TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."agent_conversation_reads" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "agent_conversation_reads_delete" ON "public"."agent_conversation_reads" FOR DELETE TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "agent_conversation_reads_insert" ON "public"."agent_conversation_reads" FOR INSERT TO "authenticated" WITH CHECK ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) AND (EXISTS ( SELECT 1
   FROM "public"."agent_conversations" "c"
  WHERE (("c"."id" = "agent_conversation_reads"."conversation_id") AND "public"."can_access_project"("c"."project_id") AND (("c"."visibility" = 'project'::"text") OR ("c"."owner_id" = ( SELECT "auth"."uid"() AS "uid"))))))));



CREATE POLICY "agent_conversation_reads_select" ON "public"."agent_conversation_reads" FOR SELECT TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "agent_conversation_reads_update" ON "public"."agent_conversation_reads" FOR UPDATE TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."agent_conversations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "agent_conversations_select" ON "public"."agent_conversations" FOR SELECT TO "authenticated" USING (("public"."can_access_project"("project_id") AND (("visibility" = 'project'::"text") OR ("owner_id" = ( SELECT "auth"."uid"() AS "uid")))));



ALTER TABLE "public"."agent_messages" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "agent_messages_select" ON "public"."agent_messages" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."agent_conversations" "c"
  WHERE (("c"."id" = "agent_messages"."conversation_id") AND "public"."can_access_project"("c"."project_id") AND (("c"."visibility" = 'project'::"text") OR ("c"."owner_id" = ( SELECT "auth"."uid"() AS "uid")))))));



ALTER TABLE "public"."agent_quota_resets" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."agent_routines" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "agent_routines_select" ON "public"."agent_routines" FOR SELECT TO "authenticated" USING (("public"."can_access_project"("project_id") AND ("deleted_at" IS NULL)));



ALTER TABLE "public"."agent_run_events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "agent_run_events_select" ON "public"."agent_run_events" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."agent_runs" "r"
     JOIN "public"."agent_conversations" "c" ON (("c"."id" = "r"."conversation_id")))
  WHERE (("r"."id" = "r"."run_id") AND "public"."can_access_project"("c"."project_id") AND (("c"."visibility" = 'project'::"text") OR ("c"."owner_id" = ( SELECT "auth"."uid"() AS "uid")))))));



ALTER TABLE "public"."agent_run_journal" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."agent_run_messages" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "agent_run_messages_select" ON "public"."agent_run_messages" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."agent_runs" "r"
     JOIN "public"."agent_conversations" "c" ON (("c"."id" = "r"."conversation_id")))
  WHERE (("r"."id" = "r"."run_id") AND "public"."can_access_project"("c"."project_id") AND (("c"."visibility" = 'project'::"text") OR ("c"."owner_id" = ( SELECT "auth"."uid"() AS "uid")))))));



ALTER TABLE "public"."agent_runs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "agent_runs_select" ON "public"."agent_runs" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."agent_conversations" "c"
  WHERE (("c"."id" = "agent_runs"."conversation_id") AND "public"."can_access_project"("c"."project_id") AND (("c"."visibility" = 'project'::"text") OR ("c"."owner_id" = ( SELECT "auth"."uid"() AS "uid")))))));



ALTER TABLE "public"."agent_runtime_sessions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."agent_session_reads" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "agent_session_reads_delete" ON "public"."agent_session_reads" FOR DELETE TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "agent_session_reads_insert" ON "public"."agent_session_reads" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "agent_session_reads_select" ON "public"."agent_session_reads" FOR SELECT TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "agent_session_reads_update" ON "public"."agent_session_reads" FOR UPDATE TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."agent_turns" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "agent_turns_select" ON "public"."agent_turns" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."agent_conversations" "c"
  WHERE (("c"."id" = "agent_turns"."conversation_id") AND "public"."can_access_project"("c"."project_id") AND (("c"."visibility" = 'project'::"text") OR ("c"."owner_id" = ( SELECT "auth"."uid"() AS "uid")))))));



ALTER TABLE "public"."ai_usage" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."api_keys" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "api_keys_select" ON "public"."api_keys" FOR SELECT TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."app_config" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."assistant_active_conversation" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "assistant_active_conversation_delete" ON "public"."assistant_active_conversation" FOR DELETE TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "assistant_active_conversation_insert" ON "public"."assistant_active_conversation" FOR INSERT TO "authenticated" WITH CHECK ((("user_id" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."conversations" "c"
  WHERE (("c"."id" = "assistant_active_conversation"."conversation_id") AND ("c"."user_id" = "auth"."uid"()))))));



CREATE POLICY "assistant_active_conversation_select" ON "public"."assistant_active_conversation" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "assistant_active_conversation_update" ON "public"."assistant_active_conversation" FOR UPDATE TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK ((("user_id" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."conversations" "c"
  WHERE (("c"."id" = "assistant_active_conversation"."conversation_id") AND ("c"."user_id" = "auth"."uid"()))))));



ALTER TABLE "public"."assistant_messages" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "assistant_messages_insert" ON "public"."assistant_messages" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."conversations" "c"
  WHERE (("c"."id" = "assistant_messages"."conversation_id") AND ("c"."user_id" = "auth"."uid"())))));



CREATE POLICY "assistant_messages_select" ON "public"."assistant_messages" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."conversations" "c"
  WHERE (("c"."id" = "assistant_messages"."conversation_id") AND ("c"."user_id" = "auth"."uid"())))));



ALTER TABLE "public"."attachments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "attachments_select" ON "public"."attachments" FOR SELECT TO "authenticated" USING ("public"."can_access_project"("project_id"));



ALTER TABLE "public"."billing_accounts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "billing_accounts_select_own" ON "public"."billing_accounts" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."categories" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "categories_delete" ON "public"."categories" FOR DELETE TO "authenticated" USING ("public"."can_access_project"("project_id"));



CREATE POLICY "categories_insert" ON "public"."categories" FOR INSERT TO "authenticated" WITH CHECK ("public"."can_access_project"("project_id"));



CREATE POLICY "categories_select" ON "public"."categories" FOR SELECT TO "authenticated" USING ("public"."can_access_project"("project_id"));



CREATE POLICY "categories_update" ON "public"."categories" FOR UPDATE TO "authenticated" USING ("public"."can_access_project"("project_id")) WITH CHECK ("public"."can_access_project"("project_id"));



ALTER TABLE "public"."comments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "comments_delete" ON "public"."comments" FOR DELETE TO "authenticated" USING ((("author_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("via_assistant" = false) AND "public"."can_access_comment_parent"("issue_id", "objective_id", "feedback_post_id")));



CREATE POLICY "comments_insert" ON "public"."comments" FOR INSERT TO "authenticated" WITH CHECK ((("author_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("via_assistant" = false) AND ("via_mcp" = false) AND "public"."can_access_comment_parent"("issue_id", "objective_id", "feedback_post_id")));



CREATE POLICY "comments_select" ON "public"."comments" FOR SELECT TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM "public"."issues" "i"
  WHERE (("i"."id" = "comments"."issue_id") AND "public"."can_access_project"("i"."project_id")))) OR (EXISTS ( SELECT 1
   FROM "public"."objectives" "o"
  WHERE (("o"."id" = "comments"."objective_id") AND "public"."can_access_project"("o"."project_id"))))));



CREATE POLICY "comments_update" ON "public"."comments" FOR UPDATE TO "authenticated" USING ((("author_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("via_assistant" = false) AND "public"."can_access_comment_parent"("issue_id", "objective_id", "feedback_post_id"))) WITH CHECK ((("author_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("via_assistant" = false) AND "public"."can_access_comment_parent"("issue_id", "objective_id", "feedback_post_id")));



ALTER TABLE "public"."conversations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "conversations_delete" ON "public"."conversations" FOR DELETE TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "conversations_insert" ON "public"."conversations" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "conversations_select" ON "public"."conversations" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "conversations_update" ON "public"."conversations" FOR UPDATE TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."custom_domains" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."cycles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "cycles_select" ON "public"."cycles" FOR SELECT TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."feedback_boards" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."feedback_merge_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."feedback_merge_rejections" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."feedback_otp_codes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."feedback_post_categories" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."feedback_posts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."feedback_sessions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."feedback_sso_replays" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."feedback_users" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."feedback_votes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."forge_mention_throttle" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."forge_webhook_deliveries" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."fx_rates" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."git_connections" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "git_connections_select" ON "public"."git_connections" FOR SELECT TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."git_user_identities" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "git_user_identities_select" ON "public"."git_user_identities" FOR SELECT TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."integrations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "integrations_select" ON "public"."integrations" FOR SELECT TO "authenticated" USING ("public"."can_access_project"("project_id"));



ALTER TABLE "public"."issue_categories" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "issue_categories_delete" ON "public"."issue_categories" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."issues" "i"
  WHERE (("i"."id" = "issue_categories"."issue_id") AND "public"."can_access_project"("i"."project_id")))));



CREATE POLICY "issue_categories_insert" ON "public"."issue_categories" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."issues" "i"
  WHERE (("i"."id" = "issue_categories"."issue_id") AND "public"."can_access_project"("i"."project_id")))));



CREATE POLICY "issue_categories_select" ON "public"."issue_categories" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."issues" "i"
  WHERE (("i"."id" = "issue_categories"."issue_id") AND "public"."can_access_project"("i"."project_id")))));



ALTER TABLE "public"."issue_events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "issue_events_select" ON "public"."issue_events" FOR SELECT TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM "public"."issues" "i"
  WHERE (("i"."id" = "issue_events"."issue_id") AND "public"."can_access_project"("i"."project_id")))) OR (EXISTS ( SELECT 1
   FROM "public"."objectives" "o"
  WHERE (("o"."id" = "issue_events"."objective_id") AND "public"."can_access_project"("o"."project_id")))) OR (EXISTS ( SELECT 1
   FROM "public"."pages" "p"
  WHERE (("p"."id" = "issue_events"."page_id") AND "public"."can_access_project"("p"."project_id"))))));



ALTER TABLE "public"."issue_relations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "issue_relations_delete" ON "public"."issue_relations" FOR DELETE TO "authenticated" USING ("public"."can_access_project"("project_id"));



CREATE POLICY "issue_relations_insert" ON "public"."issue_relations" FOR INSERT TO "authenticated" WITH CHECK (("public"."can_access_project"("project_id") AND ("created_by" = ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "issue_relations_select" ON "public"."issue_relations" FOR SELECT TO "authenticated" USING ("public"."can_access_project"("project_id"));



ALTER TABLE "public"."issues" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "issues_insert" ON "public"."issues" FOR INSERT TO "authenticated" WITH CHECK (("public"."can_access_project"("project_id") AND ("created_by" = ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "issues_select" ON "public"."issues" FOR SELECT TO "authenticated" USING (("public"."can_access_project"("project_id") AND ("deleted_at" IS NULL)));



CREATE POLICY "issues_update" ON "public"."issues" FOR UPDATE TO "authenticated" USING ("public"."can_access_project"("project_id")) WITH CHECK ("public"."can_access_project"("project_id"));



ALTER TABLE "public"."mfa_recovery_codes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "notifications_delete" ON "public"."notifications" FOR DELETE TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "notifications_select" ON "public"."notifications" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "notifications_update" ON "public"."notifications" FOR UPDATE TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."oauth_authorization_codes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."oauth_clients" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."oauth_grants" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "oauth_grants_select" ON "public"."oauth_grants" FOR SELECT TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."objectives" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "objectives_insert" ON "public"."objectives" FOR INSERT TO "authenticated" WITH CHECK ("public"."can_access_project"("project_id"));



CREATE POLICY "objectives_select" ON "public"."objectives" FOR SELECT TO "authenticated" USING (("public"."can_access_project"("project_id") AND ("deleted_at" IS NULL)));



CREATE POLICY "objectives_update" ON "public"."objectives" FOR UPDATE TO "authenticated" USING ("public"."can_access_project"("project_id")) WITH CHECK ("public"."can_access_project"("project_id"));



ALTER TABLE "public"."page_comments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "page_comments_delete" ON "public"."page_comments" FOR DELETE TO "authenticated" USING (("public"."can_access_project"("project_id") AND ("author_id" = ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "page_comments_insert" ON "public"."page_comments" FOR INSERT TO "authenticated" WITH CHECK (("public"."can_access_project"("project_id") AND ("author_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("via_assistant" = false) AND ("via_mcp" = false)));



CREATE POLICY "page_comments_select" ON "public"."page_comments" FOR SELECT TO "authenticated" USING (("public"."can_access_project"("project_id") AND (EXISTS ( SELECT 1
   FROM "public"."pages" "p"
  WHERE (("p"."id" = "page_comments"."page_id") AND ("p"."deleted_at" IS NULL))))));



CREATE POLICY "page_comments_update" ON "public"."page_comments" FOR UPDATE TO "authenticated" USING (("public"."can_access_project"("project_id") AND ("author_id" = ( SELECT "auth"."uid"() AS "uid")))) WITH CHECK (("public"."can_access_project"("project_id") AND ("author_id" = ( SELECT "auth"."uid"() AS "uid"))));



ALTER TABLE "public"."page_files" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "page_files_select" ON "public"."page_files" FOR SELECT TO "authenticated" USING ("public"."can_access_project"("project_id"));



ALTER TABLE "public"."page_links" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "page_links_select" ON "public"."page_links" FOR SELECT TO "authenticated" USING ("public"."can_access_project"("project_id"));



ALTER TABLE "public"."page_versions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "page_versions_select" ON "public"."page_versions" FOR SELECT TO "authenticated" USING ("public"."can_access_project"("project_id"));



ALTER TABLE "public"."pages" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "pages_insert" ON "public"."pages" FOR INSERT TO "authenticated" WITH CHECK ("public"."can_access_project"("project_id"));



CREATE POLICY "pages_select" ON "public"."pages" FOR SELECT TO "authenticated" USING (("public"."can_access_project"("project_id") AND ("deleted_at" IS NULL)));



CREATE POLICY "pages_update" ON "public"."pages" FOR UPDATE TO "authenticated" USING ("public"."can_access_project"("project_id")) WITH CHECK ("public"."can_access_project"("project_id"));



ALTER TABLE "public"."plan_storage_quotas" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "plan_storage_quotas_select" ON "public"."plan_storage_quotas" FOR SELECT TO "authenticated", "service_role" USING (true);



ALTER TABLE "public"."project_drafts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "project_drafts_delete" ON "public"."project_drafts" FOR DELETE TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "project_drafts_insert" ON "public"."project_drafts" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "project_drafts_select" ON "public"."project_drafts" FOR SELECT TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "project_drafts_update" ON "public"."project_drafts" FOR UPDATE TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."project_git_links" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "project_git_links_select" ON "public"."project_git_links" FOR SELECT TO "authenticated" USING ("public"."can_access_project"("project_id"));



ALTER TABLE "public"."project_invitations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "project_invitations_delete" ON "public"."project_invitations" FOR DELETE TO "authenticated" USING ("public"."is_project_owner"("project_id"));



CREATE POLICY "project_invitations_insert" ON "public"."project_invitations" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_project_owner"("project_id"));



CREATE POLICY "project_invitations_select" ON "public"."project_invitations" FOR SELECT TO "authenticated" USING (("public"."is_project_owner"("project_id") OR ("auth"."uid"() = "invited_user_id")));



CREATE POLICY "project_invitations_update_owner" ON "public"."project_invitations" FOR UPDATE TO "authenticated" USING ("public"."is_project_owner"("project_id")) WITH CHECK ("public"."is_project_owner"("project_id"));



ALTER TABLE "public"."project_members" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "project_members_delete" ON "public"."project_members" FOR DELETE TO "authenticated" USING (("public"."is_project_owner"("project_id") OR ("auth"."uid"() = "user_id")));



CREATE POLICY "project_members_insert" ON "public"."project_members" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_project_owner"("project_id"));



CREATE POLICY "project_members_select" ON "public"."project_members" FOR SELECT TO "authenticated" USING ((("auth"."uid"() = "user_id") OR "public"."is_project_owner"("project_id")));



CREATE POLICY "project_members_update" ON "public"."project_members" FOR UPDATE TO "authenticated" USING ("public"."is_project_owner"("project_id")) WITH CHECK ("public"."is_project_owner"("project_id"));



ALTER TABLE "public"."projects" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "projects_delete" ON "public"."projects" FOR DELETE TO "authenticated" USING (("auth"."uid"() = "owner_id"));



CREATE POLICY "projects_insert" ON "public"."projects" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "owner_id"));



CREATE POLICY "projects_select" ON "public"."projects" FOR SELECT TO "authenticated" USING ((("auth"."uid"() = "owner_id") OR "public"."is_project_member"("id")));



CREATE POLICY "projects_update" ON "public"."projects" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "owner_id")) WITH CHECK (("auth"."uid"() = "owner_id"));



ALTER TABLE "public"."pull_request_syncs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "pull_request_syncs_select" ON "public"."pull_request_syncs" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."project_git_links" "l"
  WHERE (("l"."provider" = "pull_request_syncs"."provider") AND ("l"."repo_full_name" = "pull_request_syncs"."repo_full_name") AND "public"."can_access_project"("l"."project_id")))));



ALTER TABLE "public"."pull_requests" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "pull_requests_select" ON "public"."pull_requests" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."project_git_links" "l"
  WHERE (("l"."provider" = "pull_requests"."provider") AND ("l"."repo_full_name" = "pull_requests"."repo_full_name") AND "public"."can_access_project"("l"."project_id")))));



ALTER TABLE "public"."push_subscriptions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "push_subscriptions_delete" ON "public"."push_subscriptions" FOR DELETE TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "push_subscriptions_insert" ON "public"."push_subscriptions" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "push_subscriptions_select" ON "public"."push_subscriptions" FOR SELECT TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "push_subscriptions_update" ON "public"."push_subscriptions" FOR UPDATE TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."saved_views" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "saved_views_delete" ON "public"."saved_views" FOR DELETE TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "saved_views_insert" ON "public"."saved_views" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "saved_views_select" ON "public"."saved_views" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "saved_views_update" ON "public"."saved_views" FOR UPDATE TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."share_unlock_attempts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."stat_events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "stat_events_select" ON "public"."stat_events" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."stripe_webhook_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_agent_preferences" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "user_agent_preferences_insert" ON "public"."user_agent_preferences" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "user_agent_preferences_select" ON "public"."user_agent_preferences" FOR SELECT TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "user_agent_preferences_update" ON "public"."user_agent_preferences" FOR UPDATE TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."user_ai_keys" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "user_ai_keys_select" ON "public"."user_ai_keys" FOR SELECT TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."user_avatars" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_scratchpad" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "user_scratchpad_insert" ON "public"."user_scratchpad" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "user_scratchpad_select" ON "public"."user_scratchpad" FOR SELECT TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "user_scratchpad_update" ON "public"."user_scratchpad" FOR UPDATE TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."view_shares" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."views" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "views_delete" ON "public"."views" FOR DELETE TO "authenticated" USING ((("kind" <> 'my'::"text") AND ((("project_id" IS NULL) AND ("user_id" = "auth"."uid"())) OR (("project_id" IS NOT NULL) AND "public"."can_access_project"("project_id") AND (("user_id" IS NULL) OR ("user_id" = "auth"."uid"()))))));



CREATE POLICY "views_insert" ON "public"."views" FOR INSERT TO "authenticated" WITH CHECK ((("kind" = 'custom'::"text") AND ((("project_id" IS NULL) AND ("user_id" = "auth"."uid"())) OR (("project_id" IS NOT NULL) AND "public"."can_access_project"("project_id") AND (("user_id" IS NULL) OR ("user_id" = "auth"."uid"()))))));



CREATE POLICY "views_select" ON "public"."views" FOR SELECT TO "authenticated" USING (((("project_id" IS NULL) AND ("user_id" = "auth"."uid"())) OR (("project_id" IS NOT NULL) AND "public"."can_access_project"("project_id") AND (("user_id" IS NULL) OR ("user_id" = "auth"."uid"())))));



CREATE POLICY "views_update" ON "public"."views" FOR UPDATE TO "authenticated" USING ((("kind" <> 'my'::"text") AND ((("project_id" IS NULL) AND ("user_id" = "auth"."uid"())) OR (("project_id" IS NOT NULL) AND "public"."can_access_project"("project_id") AND (("user_id" IS NULL) OR ("user_id" = "auth"."uid"())))))) WITH CHECK ((("kind" <> 'my'::"text") AND ((("project_id" IS NULL) AND ("user_id" = "auth"."uid"())) OR (("project_id" IS NOT NULL) AND "public"."can_access_project"("project_id") AND (("user_id" IS NULL) OR ("user_id" = "auth"."uid"()))))));





ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";





GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";


















































































































































































































































































































































































































































































































REVOKE ALL ON FUNCTION "public"."account_storage_bytes"("p_user" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."account_storage_bytes"("p_user" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."agent_runs_stamp_completed_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."agent_runs_stamp_completed_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."agent_runs_stamp_completed_at"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."attachment_object_owners"("paths" "text"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."attachment_object_owners"("paths" "text"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."broadcast_activity_scoped"() TO "anon";
GRANT ALL ON FUNCTION "public"."broadcast_activity_scoped"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."broadcast_activity_scoped"() TO "service_role";



GRANT ALL ON FUNCTION "public"."broadcast_agent_chain_row"() TO "anon";
GRANT ALL ON FUNCTION "public"."broadcast_agent_chain_row"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."broadcast_agent_chain_row"() TO "service_role";



GRANT ALL ON FUNCTION "public"."broadcast_agent_run_row"() TO "anon";
GRANT ALL ON FUNCTION "public"."broadcast_agent_run_row"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."broadcast_agent_run_row"() TO "service_role";



GRANT ALL ON FUNCTION "public"."broadcast_billing_row"() TO "anon";
GRANT ALL ON FUNCTION "public"."broadcast_billing_row"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."broadcast_billing_row"() TO "service_role";



GRANT ALL ON FUNCTION "public"."broadcast_event_scoped"() TO "anon";
GRANT ALL ON FUNCTION "public"."broadcast_event_scoped"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."broadcast_event_scoped"() TO "service_role";



GRANT ALL ON FUNCTION "public"."broadcast_feedback_child"() TO "anon";
GRANT ALL ON FUNCTION "public"."broadcast_feedback_child"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."broadcast_feedback_child"() TO "service_role";



GRANT ALL ON FUNCTION "public"."broadcast_feedback_post"() TO "anon";
GRANT ALL ON FUNCTION "public"."broadcast_feedback_post"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."broadcast_feedback_post"() TO "service_role";



GRANT ALL ON FUNCTION "public"."broadcast_invitations_row"() TO "anon";
GRANT ALL ON FUNCTION "public"."broadcast_invitations_row"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."broadcast_invitations_row"() TO "service_role";



GRANT ALL ON FUNCTION "public"."broadcast_issue_scoped"() TO "anon";
GRANT ALL ON FUNCTION "public"."broadcast_issue_scoped"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."broadcast_issue_scoped"() TO "service_role";



GRANT ALL ON FUNCTION "public"."broadcast_members_row"() TO "anon";
GRANT ALL ON FUNCTION "public"."broadcast_members_row"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."broadcast_members_row"() TO "service_role";



GRANT ALL ON FUNCTION "public"."broadcast_notifications_row"() TO "anon";
GRANT ALL ON FUNCTION "public"."broadcast_notifications_row"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."broadcast_notifications_row"() TO "service_role";



GRANT ALL ON FUNCTION "public"."broadcast_page_row"() TO "anon";
GRANT ALL ON FUNCTION "public"."broadcast_page_row"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."broadcast_page_row"() TO "service_role";



GRANT ALL ON FUNCTION "public"."broadcast_project_scoped"() TO "anon";
GRANT ALL ON FUNCTION "public"."broadcast_project_scoped"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."broadcast_project_scoped"() TO "service_role";



GRANT ALL ON FUNCTION "public"."broadcast_projects_row"() TO "anon";
GRANT ALL ON FUNCTION "public"."broadcast_projects_row"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."broadcast_projects_row"() TO "service_role";



GRANT ALL ON FUNCTION "public"."broadcast_pull_request_row"() TO "anon";
GRANT ALL ON FUNCTION "public"."broadcast_pull_request_row"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."broadcast_pull_request_row"() TO "service_role";



GRANT ALL ON FUNCTION "public"."broadcast_scratchpad_row"() TO "anon";
GRANT ALL ON FUNCTION "public"."broadcast_scratchpad_row"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."broadcast_scratchpad_row"() TO "service_role";



GRANT ALL ON FUNCTION "public"."broadcast_views_row"() TO "anon";
GRANT ALL ON FUNCTION "public"."broadcast_views_row"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."broadcast_views_row"() TO "service_role";



GRANT ALL ON FUNCTION "public"."can_access_comment_parent"("issue_uuid" "uuid", "objective_uuid" "uuid", "feedback_post_uuid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_access_comment_parent"("issue_uuid" "uuid", "objective_uuid" "uuid", "feedback_post_uuid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_access_comment_parent"("issue_uuid" "uuid", "objective_uuid" "uuid", "feedback_post_uuid" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."can_access_project"("project_uuid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_access_project"("project_uuid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_access_project"("project_uuid" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."can_watch_agent_run"("topic" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."can_watch_agent_run"("topic" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_watch_agent_run"("topic" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."can_watch_numo_comment"("topic" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."can_watch_numo_comment"("topic" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_watch_numo_comment"("topic" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."can_watch_pull_request"("topic" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."can_watch_pull_request"("topic" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_watch_pull_request"("topic" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."capture_agent_assistant_message"() TO "anon";
GRANT ALL ON FUNCTION "public"."capture_agent_assistant_message"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."capture_agent_assistant_message"() TO "service_role";



GRANT ALL ON FUNCTION "public"."capture_agent_queue_message"() TO "anon";
GRANT ALL ON FUNCTION "public"."capture_agent_queue_message"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."capture_agent_queue_message"() TO "service_role";



GRANT ALL ON TABLE "public"."agent_runs" TO "anon";
GRANT ALL ON TABLE "public"."agent_runs" TO "authenticated";
GRANT ALL ON TABLE "public"."agent_runs" TO "service_role";



REVOKE ALL ON FUNCTION "public"."claim_agent_run"("p_run_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."claim_agent_run"("p_run_id" "uuid") TO "service_role";



GRANT ALL ON TABLE "public"."feedback_posts" TO "anon";
GRANT ALL ON TABLE "public"."feedback_posts" TO "authenticated";
GRANT ALL ON TABLE "public"."feedback_posts" TO "service_role";



REVOKE ALL ON FUNCTION "public"."claim_feedback_post_for_review"("p_post" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."claim_feedback_post_for_review"("p_post" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."claim_feedback_posts_for_review"("p_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."claim_feedback_posts_for_review"("p_limit" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."claim_forge_mention"("p_key" "text", "p_window_seconds" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."claim_forge_mention"("p_key" "text", "p_window_seconds" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."cleanup_agent_run_conversation"() TO "anon";
GRANT ALL ON FUNCTION "public"."cleanup_agent_run_conversation"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."cleanup_agent_run_conversation"() TO "service_role";



GRANT ALL ON FUNCTION "public"."create_agent_turn_for_run"() TO "anon";
GRANT ALL ON FUNCTION "public"."create_agent_turn_for_run"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_agent_turn_for_run"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."effective_plan_id"("p_user" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."effective_plan_id"("p_user" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."enforce_issue_cycle"() TO "anon";
GRANT ALL ON FUNCTION "public"."enforce_issue_cycle"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enforce_issue_cycle"() TO "service_role";



GRANT ALL ON FUNCTION "public"."enforce_issue_refs_same_project"() TO "anon";
GRANT ALL ON FUNCTION "public"."enforce_issue_refs_same_project"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enforce_issue_refs_same_project"() TO "service_role";



GRANT ALL ON FUNCTION "public"."enforce_issue_relation"() TO "anon";
GRANT ALL ON FUNCTION "public"."enforce_issue_relation"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enforce_issue_relation"() TO "service_role";



GRANT ALL ON FUNCTION "public"."enforce_one_level_subissues"() TO "anon";
GRANT ALL ON FUNCTION "public"."enforce_one_level_subissues"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enforce_one_level_subissues"() TO "service_role";



GRANT ALL ON FUNCTION "public"."ensure_agent_run_conversation"() TO "anon";
GRANT ALL ON FUNCTION "public"."ensure_agent_run_conversation"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."ensure_agent_run_conversation"() TO "service_role";



GRANT ALL ON FUNCTION "public"."feedback_votes_maintain_count"() TO "anon";
GRANT ALL ON FUNCTION "public"."feedback_votes_maintain_count"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."feedback_votes_maintain_count"() TO "service_role";



GRANT ALL ON FUNCTION "public"."freeze_project_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."freeze_project_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."freeze_project_id"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_admin_user_totals"("p_tz" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_admin_user_totals"("p_tz" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_admin_users_overview"("p_search" "text", "p_limit" integer, "p_offset" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_admin_users_overview"("p_search" "text", "p_limit" integer, "p_offset" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_agent_quota_usage"("p_month_start" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_agent_quota_usage"("p_month_start" timestamp with time zone) TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_ai_cost_daily"("p_days" integer, "p_tz" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_ai_cost_daily"("p_days" integer, "p_tz" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_ai_run_calls"("p_run_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_ai_run_calls"("p_run_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_ai_run_spend"("p_run_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_ai_run_spend"("p_run_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_ai_usage_stats"("p_since" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_ai_usage_stats"("p_since" timestamp with time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_cycle_stats"("p_tz" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_cycle_stats"("p_tz" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_cycle_stats"("p_tz" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_user_stats"("p_tz" "text", "p_since" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_stats"("p_tz" "text", "p_since" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_stats"("p_tz" "text", "p_since" timestamp with time zone) TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_user_usage_history"("p_user_id" "uuid", "p_since" timestamp with time zone, "p_features" "text"[], "p_limit" integer, "p_offset" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_user_usage_history"("p_user_id" "uuid", "p_since" timestamp with time zone, "p_features" "text"[], "p_limit" integer, "p_offset" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_user_usage_since"("p_user_id" "uuid", "p_since" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_user_usage_since"("p_user_id" "uuid", "p_since" timestamp with time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."is_project_member"("project_uuid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_project_member"("project_uuid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_project_member"("project_uuid" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_project_owner"("project_uuid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_project_owner"("project_uuid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_project_owner"("project_uuid" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."issues_sync_objective_status"() TO "anon";
GRANT ALL ON FUNCTION "public"."issues_sync_objective_status"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."issues_sync_objective_status"() TO "service_role";






REVOKE ALL ON FUNCTION "public"."merge_feedback_posts"("p_dup" "uuid", "p_canonical" "uuid", "p_performed_by" "text", "p_actor" "uuid", "p_confidence" real) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."merge_feedback_posts"("p_dup" "uuid", "p_canonical" "uuid", "p_performed_by" "text", "p_actor" "uuid", "p_confidence" real) TO "service_role";



REVOKE ALL ON FUNCTION "public"."next_issue_number"("p_project_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."next_issue_number"("p_project_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."next_issue_numbers"("p_project_id" "uuid", "p_count" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."next_issue_numbers"("p_project_id" "uuid", "p_count" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."orphan_attachment_objects"("p_before" timestamp with time zone, "p_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."orphan_attachment_objects"("p_before" timestamp with time zone, "p_limit" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."project_storage_quota_ok"("p_project" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."project_storage_quota_ok"("p_project" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."project_storage_quota_ok"("p_project" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."purge_dormant_feedback_identities"("p_before" timestamp with time zone, "p_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."purge_dormant_feedback_identities"("p_before" timestamp with time zone, "p_limit" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."reconcile_objective_status"("obj_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."reconcile_objective_status"("obj_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."search_pages"("p_query" "text", "p_project_id" "uuid", "p_limit" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."search_pages"("p_query" "text", "p_project_id" "uuid", "p_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."search_pages"("p_query" "text", "p_project_id" "uuid", "p_limit" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."storage_quota_ok"("p_user" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."storage_quota_ok"("p_user" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."storage_quota_ok"("p_user" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_agent_run_conversation"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_agent_run_conversation"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_agent_run_conversation"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_agent_runtime_from_run"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_agent_runtime_from_run"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_agent_runtime_from_run"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_agent_turn_from_run"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_agent_turn_from_run"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_agent_turn_from_run"() TO "service_role";



GRANT ALL ON FUNCTION "public"."topic_uuid"("topic" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."topic_uuid"("topic" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."topic_uuid"("topic" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."undo_feedback_merge"("p_event" "uuid", "p_actor" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."undo_feedback_merge"("p_event" "uuid", "p_actor" "uuid") TO "service_role";






























GRANT ALL ON TABLE "public"."agent_artifacts" TO "anon";
GRANT ALL ON TABLE "public"."agent_artifacts" TO "authenticated";
GRANT ALL ON TABLE "public"."agent_artifacts" TO "service_role";



GRANT ALL ON TABLE "public"."agent_chains" TO "anon";
GRANT ALL ON TABLE "public"."agent_chains" TO "authenticated";
GRANT ALL ON TABLE "public"."agent_chains" TO "service_role";



GRANT ALL ON TABLE "public"."agent_conversation_contexts" TO "anon";
GRANT ALL ON TABLE "public"."agent_conversation_contexts" TO "authenticated";
GRANT ALL ON TABLE "public"."agent_conversation_contexts" TO "service_role";



GRANT ALL ON TABLE "public"."agent_conversation_pins" TO "anon";
GRANT ALL ON TABLE "public"."agent_conversation_pins" TO "authenticated";
GRANT ALL ON TABLE "public"."agent_conversation_pins" TO "service_role";



GRANT ALL ON TABLE "public"."agent_conversation_reads" TO "anon";
GRANT ALL ON TABLE "public"."agent_conversation_reads" TO "authenticated";
GRANT ALL ON TABLE "public"."agent_conversation_reads" TO "service_role";



GRANT ALL ON TABLE "public"."agent_conversations" TO "anon";
GRANT ALL ON TABLE "public"."agent_conversations" TO "authenticated";
GRANT ALL ON TABLE "public"."agent_conversations" TO "service_role";



GRANT ALL ON TABLE "public"."agent_messages" TO "anon";
GRANT ALL ON TABLE "public"."agent_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."agent_messages" TO "service_role";



GRANT ALL ON TABLE "public"."agent_quota_resets" TO "anon";
GRANT ALL ON TABLE "public"."agent_quota_resets" TO "authenticated";
GRANT ALL ON TABLE "public"."agent_quota_resets" TO "service_role";



GRANT ALL ON TABLE "public"."agent_routines" TO "anon";
GRANT ALL ON TABLE "public"."agent_routines" TO "authenticated";
GRANT ALL ON TABLE "public"."agent_routines" TO "service_role";



GRANT ALL ON TABLE "public"."agent_run_events" TO "anon";
GRANT ALL ON TABLE "public"."agent_run_events" TO "authenticated";
GRANT ALL ON TABLE "public"."agent_run_events" TO "service_role";



GRANT ALL ON TABLE "public"."agent_run_journal" TO "anon";
GRANT ALL ON TABLE "public"."agent_run_journal" TO "authenticated";
GRANT ALL ON TABLE "public"."agent_run_journal" TO "service_role";



GRANT ALL ON SEQUENCE "public"."agent_run_journal_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."agent_run_journal_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."agent_run_journal_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."agent_run_messages" TO "anon";
GRANT ALL ON TABLE "public"."agent_run_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."agent_run_messages" TO "service_role";



GRANT ALL ON TABLE "public"."agent_runtime_sessions" TO "anon";
GRANT ALL ON TABLE "public"."agent_runtime_sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."agent_runtime_sessions" TO "service_role";



GRANT ALL ON TABLE "public"."agent_session_reads" TO "anon";
GRANT ALL ON TABLE "public"."agent_session_reads" TO "authenticated";
GRANT ALL ON TABLE "public"."agent_session_reads" TO "service_role";



GRANT ALL ON TABLE "public"."agent_turns" TO "anon";
GRANT ALL ON TABLE "public"."agent_turns" TO "authenticated";
GRANT ALL ON TABLE "public"."agent_turns" TO "service_role";



GRANT ALL ON TABLE "public"."ai_usage" TO "anon";
GRANT ALL ON TABLE "public"."ai_usage" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_usage" TO "service_role";



GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."api_keys" TO "anon";
GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."api_keys" TO "authenticated";
GRANT ALL ON TABLE "public"."api_keys" TO "service_role";



GRANT SELECT("id") ON TABLE "public"."api_keys" TO "authenticated";



GRANT SELECT("user_id") ON TABLE "public"."api_keys" TO "authenticated";



GRANT SELECT("name") ON TABLE "public"."api_keys" TO "authenticated";



GRANT SELECT("key_prefix") ON TABLE "public"."api_keys" TO "authenticated";



GRANT SELECT("created_at") ON TABLE "public"."api_keys" TO "authenticated";



GRANT SELECT("last_used_at") ON TABLE "public"."api_keys" TO "authenticated";



GRANT SELECT("revoked_at") ON TABLE "public"."api_keys" TO "authenticated";



GRANT SELECT("agent") ON TABLE "public"."api_keys" TO "authenticated";



GRANT SELECT("oauth_client_id") ON TABLE "public"."api_keys" TO "authenticated";



GRANT ALL ON TABLE "public"."app_config" TO "anon";
GRANT ALL ON TABLE "public"."app_config" TO "authenticated";
GRANT ALL ON TABLE "public"."app_config" TO "service_role";



GRANT ALL ON TABLE "public"."assistant_active_conversation" TO "anon";
GRANT ALL ON TABLE "public"."assistant_active_conversation" TO "authenticated";
GRANT ALL ON TABLE "public"."assistant_active_conversation" TO "service_role";



GRANT ALL ON TABLE "public"."assistant_messages" TO "anon";
GRANT ALL ON TABLE "public"."assistant_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."assistant_messages" TO "service_role";



GRANT ALL ON TABLE "public"."attachments" TO "anon";
GRANT ALL ON TABLE "public"."attachments" TO "authenticated";
GRANT ALL ON TABLE "public"."attachments" TO "service_role";



GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."billing_accounts" TO "anon";
GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."billing_accounts" TO "authenticated";
GRANT ALL ON TABLE "public"."billing_accounts" TO "service_role";



GRANT SELECT("user_id") ON TABLE "public"."billing_accounts" TO "authenticated";



GRANT SELECT("email") ON TABLE "public"."billing_accounts" TO "authenticated";



GRANT SELECT("admin_override_plan_id") ON TABLE "public"."billing_accounts" TO "authenticated";



GRANT SELECT("stripe_plan_id") ON TABLE "public"."billing_accounts" TO "authenticated";



GRANT SELECT("stripe_subscription_status") ON TABLE "public"."billing_accounts" TO "authenticated";



GRANT SELECT("stripe_current_period_start") ON TABLE "public"."billing_accounts" TO "authenticated";



GRANT SELECT("stripe_current_period_end") ON TABLE "public"."billing_accounts" TO "authenticated";



GRANT SELECT("stripe_cancel_at_period_end") ON TABLE "public"."billing_accounts" TO "authenticated";



GRANT SELECT("created_at") ON TABLE "public"."billing_accounts" TO "authenticated";



GRANT SELECT("updated_at") ON TABLE "public"."billing_accounts" TO "authenticated";



GRANT SELECT("admin_override_expires_at") ON TABLE "public"."billing_accounts" TO "authenticated";



GRANT ALL ON TABLE "public"."categories" TO "anon";
GRANT ALL ON TABLE "public"."categories" TO "authenticated";
GRANT ALL ON TABLE "public"."categories" TO "service_role";



GRANT ALL ON TABLE "public"."comments" TO "anon";
GRANT ALL ON TABLE "public"."comments" TO "authenticated";
GRANT ALL ON TABLE "public"."comments" TO "service_role";



GRANT ALL ON TABLE "public"."conversations" TO "anon";
GRANT ALL ON TABLE "public"."conversations" TO "authenticated";
GRANT ALL ON TABLE "public"."conversations" TO "service_role";



GRANT ALL ON TABLE "public"."custom_domains" TO "anon";
GRANT ALL ON TABLE "public"."custom_domains" TO "authenticated";
GRANT ALL ON TABLE "public"."custom_domains" TO "service_role";



GRANT ALL ON TABLE "public"."cycles" TO "anon";
GRANT ALL ON TABLE "public"."cycles" TO "authenticated";
GRANT ALL ON TABLE "public"."cycles" TO "service_role";



GRANT ALL ON TABLE "public"."feedback_boards" TO "anon";
GRANT ALL ON TABLE "public"."feedback_boards" TO "authenticated";
GRANT ALL ON TABLE "public"."feedback_boards" TO "service_role";



GRANT ALL ON TABLE "public"."feedback_merge_events" TO "anon";
GRANT ALL ON TABLE "public"."feedback_merge_events" TO "authenticated";
GRANT ALL ON TABLE "public"."feedback_merge_events" TO "service_role";



GRANT ALL ON TABLE "public"."feedback_merge_rejections" TO "anon";
GRANT ALL ON TABLE "public"."feedback_merge_rejections" TO "authenticated";
GRANT ALL ON TABLE "public"."feedback_merge_rejections" TO "service_role";



GRANT ALL ON TABLE "public"."feedback_otp_codes" TO "anon";
GRANT ALL ON TABLE "public"."feedback_otp_codes" TO "authenticated";
GRANT ALL ON TABLE "public"."feedback_otp_codes" TO "service_role";



GRANT ALL ON TABLE "public"."feedback_post_categories" TO "anon";
GRANT ALL ON TABLE "public"."feedback_post_categories" TO "authenticated";
GRANT ALL ON TABLE "public"."feedback_post_categories" TO "service_role";



GRANT ALL ON TABLE "public"."feedback_sessions" TO "anon";
GRANT ALL ON TABLE "public"."feedback_sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."feedback_sessions" TO "service_role";



GRANT ALL ON TABLE "public"."feedback_sso_replays" TO "anon";
GRANT ALL ON TABLE "public"."feedback_sso_replays" TO "authenticated";
GRANT ALL ON TABLE "public"."feedback_sso_replays" TO "service_role";



GRANT ALL ON TABLE "public"."feedback_users" TO "anon";
GRANT ALL ON TABLE "public"."feedback_users" TO "authenticated";
GRANT ALL ON TABLE "public"."feedback_users" TO "service_role";



GRANT ALL ON TABLE "public"."feedback_votes" TO "anon";
GRANT ALL ON TABLE "public"."feedback_votes" TO "authenticated";
GRANT ALL ON TABLE "public"."feedback_votes" TO "service_role";



GRANT ALL ON TABLE "public"."forge_mention_throttle" TO "service_role";



GRANT ALL ON TABLE "public"."forge_webhook_deliveries" TO "anon";
GRANT ALL ON TABLE "public"."forge_webhook_deliveries" TO "authenticated";
GRANT ALL ON TABLE "public"."forge_webhook_deliveries" TO "service_role";



GRANT ALL ON TABLE "public"."fx_rates" TO "anon";
GRANT ALL ON TABLE "public"."fx_rates" TO "authenticated";
GRANT ALL ON TABLE "public"."fx_rates" TO "service_role";



GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."git_connections" TO "anon";
GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."git_connections" TO "authenticated";
GRANT ALL ON TABLE "public"."git_connections" TO "service_role";



GRANT SELECT("id") ON TABLE "public"."git_connections" TO "authenticated";



GRANT SELECT("user_id") ON TABLE "public"."git_connections" TO "authenticated";



GRANT SELECT("provider") ON TABLE "public"."git_connections" TO "authenticated";



GRANT SELECT("installation_id") ON TABLE "public"."git_connections" TO "authenticated";



GRANT SELECT("provider_account_id") ON TABLE "public"."git_connections" TO "authenticated";



GRANT SELECT("account_login") ON TABLE "public"."git_connections" TO "authenticated";



GRANT SELECT("account_type") ON TABLE "public"."git_connections" TO "authenticated";



GRANT SELECT("repository_selection") ON TABLE "public"."git_connections" TO "authenticated";



GRANT SELECT("token_expires_at") ON TABLE "public"."git_connections" TO "authenticated";



GRANT SELECT("oauth_scopes") ON TABLE "public"."git_connections" TO "authenticated";



GRANT SELECT("created_at") ON TABLE "public"."git_connections" TO "authenticated";



GRANT SELECT("updated_at") ON TABLE "public"."git_connections" TO "authenticated";



GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."git_user_identities" TO "anon";
GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."git_user_identities" TO "authenticated";
GRANT ALL ON TABLE "public"."git_user_identities" TO "service_role";



GRANT SELECT("id") ON TABLE "public"."git_user_identities" TO "authenticated";



GRANT SELECT("user_id") ON TABLE "public"."git_user_identities" TO "authenticated";



GRANT SELECT("provider") ON TABLE "public"."git_user_identities" TO "authenticated";



GRANT SELECT("provider_account_id") ON TABLE "public"."git_user_identities" TO "authenticated";



GRANT SELECT("account_login") ON TABLE "public"."git_user_identities" TO "authenticated";



GRANT SELECT("account_avatar_url") ON TABLE "public"."git_user_identities" TO "authenticated";



GRANT SELECT("token_expires_at") ON TABLE "public"."git_user_identities" TO "authenticated";



GRANT SELECT("oauth_scopes") ON TABLE "public"."git_user_identities" TO "authenticated";



GRANT SELECT("created_at") ON TABLE "public"."git_user_identities" TO "authenticated";



GRANT SELECT("updated_at") ON TABLE "public"."git_user_identities" TO "authenticated";



GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."integrations" TO "anon";
GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."integrations" TO "authenticated";
GRANT ALL ON TABLE "public"."integrations" TO "service_role";



GRANT SELECT("id") ON TABLE "public"."integrations" TO "authenticated";



GRANT SELECT("project_id") ON TABLE "public"."integrations" TO "authenticated";



GRANT SELECT("name") ON TABLE "public"."integrations" TO "authenticated";



GRANT SELECT("key_prefix") ON TABLE "public"."integrations" TO "authenticated";



GRANT SELECT("created_by") ON TABLE "public"."integrations" TO "authenticated";



GRANT SELECT("created_at") ON TABLE "public"."integrations" TO "authenticated";



GRANT SELECT("last_used_at") ON TABLE "public"."integrations" TO "authenticated";



GRANT SELECT("revoked_at") ON TABLE "public"."integrations" TO "authenticated";



GRANT SELECT("webhook_url") ON TABLE "public"."integrations" TO "authenticated";



GRANT SELECT("webhook_events") ON TABLE "public"."integrations" TO "authenticated";



GRANT SELECT("webhook_scope") ON TABLE "public"."integrations" TO "authenticated";



GRANT SELECT("webhook_last_status") ON TABLE "public"."integrations" TO "authenticated";



GRANT SELECT("webhook_last_at") ON TABLE "public"."integrations" TO "authenticated";



GRANT SELECT("kind") ON TABLE "public"."integrations" TO "authenticated";



GRANT ALL ON TABLE "public"."issue_categories" TO "anon";
GRANT ALL ON TABLE "public"."issue_categories" TO "authenticated";
GRANT ALL ON TABLE "public"."issue_categories" TO "service_role";



GRANT ALL ON TABLE "public"."issue_events" TO "anon";
GRANT ALL ON TABLE "public"."issue_events" TO "authenticated";
GRANT ALL ON TABLE "public"."issue_events" TO "service_role";



GRANT ALL ON TABLE "public"."issue_relations" TO "anon";
GRANT ALL ON TABLE "public"."issue_relations" TO "authenticated";
GRANT ALL ON TABLE "public"."issue_relations" TO "service_role";



GRANT ALL ON TABLE "public"."issues" TO "anon";
GRANT ALL ON TABLE "public"."issues" TO "authenticated";
GRANT ALL ON TABLE "public"."issues" TO "service_role";



GRANT ALL ON TABLE "public"."mfa_recovery_codes" TO "anon";
GRANT ALL ON TABLE "public"."mfa_recovery_codes" TO "authenticated";
GRANT ALL ON TABLE "public"."mfa_recovery_codes" TO "service_role";



GRANT ALL ON TABLE "public"."notifications" TO "anon";
GRANT ALL ON TABLE "public"."notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."notifications" TO "service_role";



GRANT ALL ON TABLE "public"."oauth_authorization_codes" TO "anon";
GRANT ALL ON TABLE "public"."oauth_authorization_codes" TO "authenticated";
GRANT ALL ON TABLE "public"."oauth_authorization_codes" TO "service_role";



GRANT ALL ON TABLE "public"."oauth_clients" TO "anon";
GRANT ALL ON TABLE "public"."oauth_clients" TO "authenticated";
GRANT ALL ON TABLE "public"."oauth_clients" TO "service_role";



GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."oauth_grants" TO "anon";
GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."oauth_grants" TO "authenticated";
GRANT ALL ON TABLE "public"."oauth_grants" TO "service_role";



GRANT SELECT("id") ON TABLE "public"."oauth_grants" TO "authenticated";



GRANT SELECT("user_id") ON TABLE "public"."oauth_grants" TO "authenticated";



GRANT SELECT("client_id") ON TABLE "public"."oauth_grants" TO "authenticated";



GRANT SELECT("api_key_id") ON TABLE "public"."oauth_grants" TO "authenticated";



GRANT SELECT("scope") ON TABLE "public"."oauth_grants" TO "authenticated";



GRANT SELECT("access_token_expires_at") ON TABLE "public"."oauth_grants" TO "authenticated";



GRANT SELECT("refresh_token_expires_at") ON TABLE "public"."oauth_grants" TO "authenticated";



GRANT SELECT("created_at") ON TABLE "public"."oauth_grants" TO "authenticated";



GRANT SELECT("last_used_at") ON TABLE "public"."oauth_grants" TO "authenticated";



GRANT SELECT("revoked_at") ON TABLE "public"."oauth_grants" TO "authenticated";



GRANT ALL ON TABLE "public"."objectives" TO "anon";
GRANT ALL ON TABLE "public"."objectives" TO "authenticated";
GRANT ALL ON TABLE "public"."objectives" TO "service_role";



GRANT ALL ON TABLE "public"."page_comments" TO "anon";
GRANT ALL ON TABLE "public"."page_comments" TO "authenticated";
GRANT ALL ON TABLE "public"."page_comments" TO "service_role";



GRANT ALL ON TABLE "public"."page_files" TO "anon";
GRANT ALL ON TABLE "public"."page_files" TO "authenticated";
GRANT ALL ON TABLE "public"."page_files" TO "service_role";



GRANT ALL ON TABLE "public"."page_links" TO "anon";
GRANT ALL ON TABLE "public"."page_links" TO "authenticated";
GRANT ALL ON TABLE "public"."page_links" TO "service_role";



GRANT ALL ON TABLE "public"."page_versions" TO "anon";
GRANT ALL ON TABLE "public"."page_versions" TO "authenticated";
GRANT ALL ON TABLE "public"."page_versions" TO "service_role";



GRANT ALL ON TABLE "public"."pages" TO "anon";
GRANT ALL ON TABLE "public"."pages" TO "authenticated";
GRANT ALL ON TABLE "public"."pages" TO "service_role";



GRANT ALL ON TABLE "public"."plan_storage_quotas" TO "anon";
GRANT ALL ON TABLE "public"."plan_storage_quotas" TO "authenticated";
GRANT ALL ON TABLE "public"."plan_storage_quotas" TO "service_role";



GRANT ALL ON TABLE "public"."project_drafts" TO "anon";
GRANT ALL ON TABLE "public"."project_drafts" TO "authenticated";
GRANT ALL ON TABLE "public"."project_drafts" TO "service_role";



GRANT ALL ON TABLE "public"."project_git_links" TO "anon";
GRANT ALL ON TABLE "public"."project_git_links" TO "authenticated";
GRANT ALL ON TABLE "public"."project_git_links" TO "service_role";



GRANT ALL ON TABLE "public"."project_invitations" TO "anon";
GRANT ALL ON TABLE "public"."project_invitations" TO "authenticated";
GRANT ALL ON TABLE "public"."project_invitations" TO "service_role";



GRANT ALL ON TABLE "public"."project_members" TO "anon";
GRANT ALL ON TABLE "public"."project_members" TO "authenticated";
GRANT ALL ON TABLE "public"."project_members" TO "service_role";



GRANT ALL ON TABLE "public"."projects" TO "anon";
GRANT ALL ON TABLE "public"."projects" TO "authenticated";
GRANT ALL ON TABLE "public"."projects" TO "service_role";



GRANT ALL ON TABLE "public"."pull_request_syncs" TO "anon";
GRANT ALL ON TABLE "public"."pull_request_syncs" TO "authenticated";
GRANT ALL ON TABLE "public"."pull_request_syncs" TO "service_role";



GRANT ALL ON TABLE "public"."pull_requests" TO "anon";
GRANT ALL ON TABLE "public"."pull_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."pull_requests" TO "service_role";



GRANT ALL ON TABLE "public"."push_subscriptions" TO "anon";
GRANT ALL ON TABLE "public"."push_subscriptions" TO "authenticated";
GRANT ALL ON TABLE "public"."push_subscriptions" TO "service_role";



GRANT ALL ON TABLE "public"."saved_views" TO "anon";
GRANT ALL ON TABLE "public"."saved_views" TO "authenticated";
GRANT ALL ON TABLE "public"."saved_views" TO "service_role";



GRANT ALL ON TABLE "public"."share_unlock_attempts" TO "anon";
GRANT ALL ON TABLE "public"."share_unlock_attempts" TO "authenticated";
GRANT ALL ON TABLE "public"."share_unlock_attempts" TO "service_role";



GRANT ALL ON TABLE "public"."stat_events" TO "anon";
GRANT ALL ON TABLE "public"."stat_events" TO "authenticated";
GRANT ALL ON TABLE "public"."stat_events" TO "service_role";



GRANT ALL ON TABLE "public"."stripe_webhook_events" TO "anon";
GRANT ALL ON TABLE "public"."stripe_webhook_events" TO "authenticated";
GRANT ALL ON TABLE "public"."stripe_webhook_events" TO "service_role";



GRANT ALL ON TABLE "public"."user_agent_preferences" TO "anon";
GRANT ALL ON TABLE "public"."user_agent_preferences" TO "authenticated";
GRANT ALL ON TABLE "public"."user_agent_preferences" TO "service_role";



GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."user_ai_keys" TO "anon";
GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."user_ai_keys" TO "authenticated";
GRANT ALL ON TABLE "public"."user_ai_keys" TO "service_role";



GRANT SELECT("id") ON TABLE "public"."user_ai_keys" TO "authenticated";



GRANT SELECT("user_id") ON TABLE "public"."user_ai_keys" TO "authenticated";



GRANT SELECT("provider") ON TABLE "public"."user_ai_keys" TO "authenticated";



GRANT SELECT("key_prefix") ON TABLE "public"."user_ai_keys" TO "authenticated";



GRANT SELECT("created_at") ON TABLE "public"."user_ai_keys" TO "authenticated";



GRANT SELECT("updated_at") ON TABLE "public"."user_ai_keys" TO "authenticated";



GRANT SELECT("last_used_at") ON TABLE "public"."user_ai_keys" TO "authenticated";



GRANT SELECT("base_url") ON TABLE "public"."user_ai_keys" TO "authenticated";



GRANT SELECT("validated_at") ON TABLE "public"."user_ai_keys" TO "authenticated";



GRANT ALL ON TABLE "public"."user_avatars" TO "anon";
GRANT ALL ON TABLE "public"."user_avatars" TO "authenticated";
GRANT ALL ON TABLE "public"."user_avatars" TO "service_role";



GRANT ALL ON TABLE "public"."user_scratchpad" TO "anon";
GRANT ALL ON TABLE "public"."user_scratchpad" TO "authenticated";
GRANT ALL ON TABLE "public"."user_scratchpad" TO "service_role";



GRANT ALL ON TABLE "public"."view_shares" TO "anon";
GRANT ALL ON TABLE "public"."view_shares" TO "authenticated";
GRANT ALL ON TABLE "public"."view_shares" TO "service_role";



GRANT ALL ON TABLE "public"."views" TO "anon";
GRANT ALL ON TABLE "public"."views" TO "authenticated";
GRANT ALL ON TABLE "public"."views" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";
































--
-- Dumped schema changes for auth and storage
--

CREATE POLICY "attachments insert" ON "storage"."objects" FOR INSERT TO "authenticated" WITH CHECK ((("bucket_id" = 'attachments'::"text") AND
CASE ("storage"."foldername"("name"))[1]
    WHEN 'projects'::"text" THEN
    CASE
        WHEN ((("storage"."foldername"("name"))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'::"text") AND (COALESCE(("storage"."foldername"("name"))[3], ''::"text") <> 'pages'::"text")) THEN ("public"."can_access_project"((("storage"."foldername"("name"))[2])::"uuid") AND "public"."project_storage_quota_ok"((("storage"."foldername"("name"))[2])::"uuid"))
        ELSE false
    END
    WHEN 'chat'::"text" THEN
    CASE
        WHEN (("storage"."foldername"("name"))[2] = ( SELECT ("auth"."uid"())::"text" AS "uid")) THEN "public"."storage_quota_ok"(( SELECT "auth"."uid"() AS "uid"))
        ELSE false
    END
    ELSE false
END));


-- `supabase migration squash` n'exporte pas les policies du schéma Realtime.
-- Elles font néanmoins partie du schéma applicatif distribué : les recopier ici
-- garde un bootstrap vierge aligné avec les instances ayant appliqué MIN-351.
DROP POLICY IF EXISTS "members_receive_broadcasts" ON "realtime"."messages";
CREATE POLICY "members_receive_broadcasts" ON "realtime"."messages"
FOR SELECT TO "authenticated"
USING (
  "extension" = 'broadcast' AND (
    ("realtime"."topic"() LIKE 'project:%'
      AND "public"."can_access_project"("public"."topic_uuid"("realtime"."topic"())))
    OR ("realtime"."topic"() LIKE 'user:%'
      AND split_part("realtime"."topic"(), ':', 2) = (SELECT "auth"."uid"()::text))
    OR ("realtime"."topic"() LIKE 'agent-run:%'
      AND "public"."can_watch_agent_run"("realtime"."topic"()))
    OR ("realtime"."topic"() LIKE 'numo-comment:%'
      AND "public"."can_watch_numo_comment"("realtime"."topic"()))
    OR ("realtime"."topic"() LIKE 'pull-request:%'
      AND "public"."can_watch_pull_request"("realtime"."topic"()))
  )
);

DROP POLICY IF EXISTS "members_receive_page_presence" ON "realtime"."messages";
CREATE POLICY "members_receive_page_presence" ON "realtime"."messages"
FOR SELECT TO "authenticated"
USING (
  "extension" = 'presence'
  AND "realtime"."topic"() LIKE 'page-presence:%'
  AND "public"."can_access_project"("public"."topic_uuid"("realtime"."topic"()))
);

DROP POLICY IF EXISTS "members_track_page_presence" ON "realtime"."messages";
CREATE POLICY "members_track_page_presence" ON "realtime"."messages"
FOR INSERT TO "authenticated"
WITH CHECK (
  "extension" = 'presence'
  AND "realtime"."topic"() LIKE 'page-presence:%'
  AND "public"."can_access_project"("public"."topic_uuid"("realtime"."topic"()))
);

