BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();

CREATE TEMP TABLE expected_realtime_table_denials (
  role_name text NOT NULL,
  table_name text NOT NULL,
  privilege_name text NOT NULL
);
INSERT INTO expected_realtime_table_denials
SELECT role_name, table_name, privilege_name
FROM unnest(ARRAY['anon', 'authenticated', 'service_role'])
  AS candidate_role(role_name)
CROSS JOIN unnest(ARRAY[
  'public.project_realtime_generations',
  'public.user_realtime_generations'
]) AS registry(table_name)
CROSS JOIN unnest(ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE'])
  AS denied_privilege(privilege_name);

SELECT ok(
  NOT has_table_privilege(role_name, table_name, privilege_name),
  role_name || ' cannot ' || privilege_name || ' ' || table_name
)
FROM expected_realtime_table_denials
ORDER BY table_name, role_name, privilege_name;

SELECT ok(
  relrowsecurity AND relforcerowsecurity,
  relname || ' enables and forces row-level security'
)
FROM pg_catalog.pg_class
WHERE oid IN (
  'public.project_realtime_generations'::regclass,
  'public.user_realtime_generations'::regclass
)
ORDER BY relname;
SELECT ok(
  has_function_privilege(
    'authenticated',
    'public.resolve_realtime_topic(text)',
    'EXECUTE'
  ),
  'authenticated clients can resolve authorized private topics'
);
SELECT ok(
  NOT has_function_privilege(
    'authenticated',
    'public.current_realtime_topic(text)',
    'EXECUTE'
  ),
  'clients cannot bypass topic authorization with the service resolver'
);
SELECT ok(
  NOT has_function_privilege(
    'authenticated',
    'public.broadcast_private_realtime(text,text,jsonb)',
    'EXECUTE'
  ),
  'clients cannot invoke the service Realtime broadcaster'
);

CREATE TEMP TABLE expected_realtime_function_privileges (
  function_signature text PRIMARY KEY,
  anon_execute boolean NOT NULL,
  authenticated_execute boolean NOT NULL,
  service_execute boolean NOT NULL
);
INSERT INTO expected_realtime_function_privileges VALUES
  ('public.initialize_project_realtime_generation()', false, false, false),
  ('public.initialize_user_realtime_generation()', false, false, false),
  ('public.freeze_numo_comment_scope()', false, false, false),
  ('public.can_watch_numo_comment(text)', false, true, true),
  ('public.can_watch_numo_page_comment(text)', false, true, true),
  ('public.current_realtime_topic(text)', false, false, true),
  ('public.realtime_topic_is_current(text)', false, true, true),
  ('public.resolve_realtime_topic(text)', false, true, true),
  ('public.broadcast_private_realtime(text,text,jsonb)', false, false, true),
  ('public.realtime_topic_project_ids(text)', false, false, false),
  ('public.version_realtime_message_topic()', false, false, false),
  ('public.rotate_project_realtime_generation(uuid,uuid[])', false, false, false),
  ('public.rekey_deleted_project()', false, false, false),
  ('public.rekey_project_realtime_membership()', false, false, false),
  ('public.rekey_project_realtime_owner()', false, false, false),
  ('public.rekey_agent_conversation_scope()', false, false, false),
  ('public.rekey_agent_run_scope()', false, false, false),
  ('public.rekey_pull_request_scope()', false, false, false),
  ('public.rotate_user_realtime_generation(uuid)', false, false, false),
  ('public.rekey_deleted_auth_sessions()', false, false, false),
  ('public.rekey_auth_session_authorization_change()', false, false, false),
  ('public.rekey_exhausted_refresh_session()', false, false, false),
  ('public.rekey_mfa_factor_change()', false, false, false),
  ('public.rekey_mfa_amr_change()', false, false, false),
  ('public.rekey_auth_user_access_change()', false, false, false),
  ('public.rekey_deleted_auth_user()', false, false, false),
  ('public.rekey_project_git_link_after()', false, false, false);

SELECT is(
  (SELECT count(*) FROM expected_realtime_function_privileges),
  27::bigint,
  'the ACL matrix covers all 27 functions defined by this migration'
);

SELECT is(
  has_function_privilege('anon', function_signature, 'EXECUTE'),
  anon_execute,
  function_signature || ' has the intended anon EXECUTE privilege'
)
FROM expected_realtime_function_privileges
ORDER BY function_signature;
SELECT is(
  has_function_privilege('authenticated', function_signature, 'EXECUTE'),
  authenticated_execute,
  function_signature || ' has the intended authenticated EXECUTE privilege'
)
FROM expected_realtime_function_privileges
ORDER BY function_signature;
SELECT is(
  has_function_privilege('service_role', function_signature, 'EXECUTE'),
  service_execute,
  function_signature || ' has the intended service-role EXECUTE privilege'
)
FROM expected_realtime_function_privileges
ORDER BY function_signature;

SELECT is(
  (
    SELECT provolatile::text
    FROM pg_proc
    WHERE oid = 'public.current_realtime_topic(text)'::regprocedure
  ),
  'v',
  'topic resolution takes a fresh READ COMMITTED snapshot after lock waits'
);
SELECT is(
  (
    SELECT provolatile::text
    FROM pg_proc
    WHERE oid = 'public.realtime_topic_project_ids(text)'::regprocedure
  ),
  'v',
  'resource scope resolution takes a fresh snapshot after reparenting'
);
SELECT ok(
  (
    SELECT qual
    FROM pg_policies
    WHERE schemaname = 'realtime'
      AND tablename = 'messages'
      AND policyname = 'members_receive_broadcasts'
  ) LIKE '%realtime_topic_is_current%',
  'Broadcast joins require the current authorized topic generation'
);
SELECT ok(
  (
    SELECT qual
    FROM pg_policies
    WHERE schemaname = 'realtime'
      AND tablename = 'messages'
      AND policyname = 'members_receive_page_presence'
  ) LIKE '%realtime_topic_is_current%',
  'Presence reads require the current authorized topic generation'
);
SELECT ok(
  (
    SELECT with_check
    FROM pg_policies
    WHERE schemaname = 'realtime'
      AND tablename = 'messages'
      AND policyname = 'members_track_page_presence'
  ) LIKE '%realtime_topic_is_current%',
  'Presence tracking requires the current authorized topic generation'
);
SELECT is(
  (
    SELECT count(*)
    FROM pg_catalog.pg_publication_tables
    WHERE pubname = 'supabase_realtime'
  ),
  0::bigint,
  'postgres_changes publishes no tables outside private Broadcast RLS'
);
SELECT has_trigger(
  'public',
  'comments',
  'comments_freeze_numo_realtime_scope',
  'Numo comment authorization parents are immutable for every role'
);
SELECT has_trigger(
  'public',
  'feedback_posts',
  'feedback_posts_freeze_project_id',
  'feedback comment parents cannot move between projects'
);
SELECT has_trigger(
  'public',
  'issues',
  'issues_freeze_project_id',
  'issue comment parents cannot move between projects'
);
SELECT has_trigger(
  'public',
  'objectives',
  'objectives_freeze_project_id',
  'objective comment parents cannot move between projects'
);
SELECT has_trigger(
  'public',
  'pages',
  'pages_freeze_project_id',
  'page comment parents cannot move between projects'
);
SELECT has_trigger(
  'public',
  'pull_requests',
  'pull_requests_rekey_realtime_scope',
  'pull request repository moves serialize with Realtime publishers'
);
SELECT is(
  (
    SELECT count(*)
    FROM pg_catalog.pg_trigger
    WHERE tgrelid = 'auth.mfa_factors'::regclass
      AND tgname IN (
        'auth_mfa_factors_rekey_realtime_insert',
        'auth_mfa_factors_rekey_realtime_update',
        'auth_mfa_factors_rekey_realtime_delete'
      )
      AND tgconstraint <> 0
      AND tgdeferrable
      AND tginitdeferred
      AND tgfoid = 'public.rekey_mfa_factor_change()'::regprocedure
      AND tgenabled <> 'D'
  ),
  3::bigint,
  'MFA factor Realtime rotations defer until commit to preserve Auth lock order'
);
SELECT is(
  (
    SELECT count(*)
    FROM pg_catalog.pg_trigger
    WHERE tgrelid = 'auth.users'::regclass
      AND tgname = 'auth_users_rekey_realtime_delete'
      AND tgconstraint <> 0
      AND tgdeferrable
      AND tginitdeferred
      AND tgfoid = 'public.rekey_deleted_auth_user()'::regprocedure
      AND tgenabled <> 'D'
  ),
  1::bigint,
  'Auth user deletion rotates personal Realtime topics after cascades complete'
);

INSERT INTO auth.users (id, email, raw_app_meta_data)
VALUES
  (
    '73000000-0000-4000-8000-000000000001',
    'realtime-owner@example.test',
    '{}'::jsonb
  ),
  (
    '73000000-0000-4000-8000-000000000002',
    'realtime-member@example.test',
    '{}'::jsonb
  ),
  (
    '73000000-0000-4000-8000-000000000003',
    'realtime-outsider@example.test',
    '{}'::jsonb
  ),
  (
    '73000000-0000-4000-8000-000000000004',
    'realtime-mfa@example.test',
    '{}'::jsonb
  );

INSERT INTO auth.sessions (id, user_id, aal, created_at, updated_at)
VALUES
  (
    '73010000-0000-4000-8000-000000000001',
    '73000000-0000-4000-8000-000000000001',
    'aal1',
    now(),
    now()
  ),
  (
    '73010000-0000-4000-8000-000000000002',
    '73000000-0000-4000-8000-000000000002',
    'aal1',
    now(),
    now()
  ),
  (
    '73010000-0000-4000-8000-000000000003',
    '73000000-0000-4000-8000-000000000003',
    'aal1',
    now(),
    now()
  ),
  (
    '73010000-0000-4000-8000-000000000004',
    '73000000-0000-4000-8000-000000000004',
    'aal1',
    now(),
    now()
  );
INSERT INTO auth.refresh_tokens (token, user_id, revoked, session_id)
VALUES
  (
    'realtime-owner-refresh-token',
    '73000000-0000-4000-8000-000000000001',
    false,
    '73010000-0000-4000-8000-000000000001'
  ),
  (
    'realtime-member-refresh-token',
    '73000000-0000-4000-8000-000000000002',
    false,
    '73010000-0000-4000-8000-000000000002'
  ),
  (
    'realtime-outsider-refresh-token',
    '73000000-0000-4000-8000-000000000003',
    false,
    '73010000-0000-4000-8000-000000000003'
  ),
  (
    'realtime-mfa-refresh-token',
    '73000000-0000-4000-8000-000000000004',
    false,
    '73010000-0000-4000-8000-000000000004'
  );

INSERT INTO public.projects (id, owner_id, name, key)
VALUES
  (
    '73100000-0000-4000-8000-000000000001',
    '73000000-0000-4000-8000-000000000001',
    'Realtime generation project',
    'RTG'
  ),
  (
    '73100000-0000-4000-8000-000000000002',
    '73000000-0000-4000-8000-000000000001',
    'Linked Realtime project',
    'RTL'
  ),
  (
    '73100000-0000-4000-8000-000000000003',
    '73000000-0000-4000-8000-000000000001',
    'Moved link Realtime project',
    'RTM'
  ),
  (
    '73100000-0000-4000-8000-000000000004',
    '73000000-0000-4000-8000-000000000004',
    'MFA Realtime project',
    'RTA'
  ),
  (
    '73100000-0000-4000-8000-000000000005',
    '73000000-0000-4000-8000-000000000001',
    'Agent scope Realtime project',
    'RTS'
  ),
  (
    '73100000-0000-4000-8000-000000000006',
    '73000000-0000-4000-8000-000000000001',
    'Agent move Realtime project',
    'RTR'
  );
INSERT INTO public.project_members (project_id, user_id, added_by)
VALUES
  (
    '73100000-0000-4000-8000-000000000001',
    '73000000-0000-4000-8000-000000000002',
    '73000000-0000-4000-8000-000000000001'
  ),
  (
    '73100000-0000-4000-8000-000000000002',
    '73000000-0000-4000-8000-000000000003',
    '73000000-0000-4000-8000-000000000001'
  ),
  (
    '73100000-0000-4000-8000-000000000005',
    '73000000-0000-4000-8000-000000000002',
    '73000000-0000-4000-8000-000000000001'
  ),
  (
    '73100000-0000-4000-8000-000000000006',
    '73000000-0000-4000-8000-000000000003',
    '73000000-0000-4000-8000-000000000001'
  );
INSERT INTO public.issues (id, project_id, number, title, created_by)
VALUES
  (
    '73200000-0000-4000-8000-000000000001',
    '73100000-0000-4000-8000-000000000001',
    1,
    'Realtime generation issue',
    '73000000-0000-4000-8000-000000000001'
  ),
  (
    '73200000-0000-4000-8000-000000000002',
    '73100000-0000-4000-8000-000000000002',
    1,
    'Linked Realtime issue',
    '73000000-0000-4000-8000-000000000001'
  );
INSERT INTO public.comments (id, issue_id, author_id, body)
VALUES (
  '73300000-0000-4000-8000-000000000001',
  '73200000-0000-4000-8000-000000000001',
  '73000000-0000-4000-8000-000000000001',
  'Realtime generation comment'
);
INSERT INTO public.objectives (id, project_id, name)
VALUES (
  '73210000-0000-4000-8000-000000000001',
  '73100000-0000-4000-8000-000000000001',
  'Realtime generation objective'
);
INSERT INTO public.pages (id, project_id, title, position, created_by)
VALUES
  (
    '73220000-0000-4000-8000-000000000001',
    '73100000-0000-4000-8000-000000000001',
    'Realtime generation page',
    'a0',
    '73000000-0000-4000-8000-000000000001'
  ),
  (
    '73220000-0000-4000-8000-000000000002',
    '73100000-0000-4000-8000-000000000002',
    'Colliding page comment project',
    'a0',
    '73000000-0000-4000-8000-000000000001'
  );
INSERT INTO public.page_comments (
  id, page_id, project_id, author_id, body
)
VALUES (
  '73300000-0000-4000-8000-000000000001',
  '73220000-0000-4000-8000-000000000002',
  '73100000-0000-4000-8000-000000000002',
  '73000000-0000-4000-8000-000000000001',
  'Page comment with the same UUID as a regular comment'
);
INSERT INTO public.feedback_posts (
  id, project_id, title, body, submitted_title, submitted_body, source
)
VALUES (
  '73230000-0000-4000-8000-000000000001',
  '73100000-0000-4000-8000-000000000001',
  'Realtime generation feedback',
  'Synthetic feedback body',
  'Realtime generation feedback',
  'Synthetic feedback body',
  'internal'
);
INSERT INTO public.agent_conversations (
  id, project_id, owner_id, visibility
)
VALUES
  (
    '73400000-0000-4000-8000-000000000001',
    '73100000-0000-4000-8000-000000000001',
    '73000000-0000-4000-8000-000000000001',
    'project'
  ),
  (
    '73400000-0000-4000-8000-000000000002',
    '73100000-0000-4000-8000-000000000002',
    '73000000-0000-4000-8000-000000000001',
    'project'
  ),
  (
    '73400000-0000-4000-8000-000000000003',
    '73100000-0000-4000-8000-000000000005',
    '73000000-0000-4000-8000-000000000001',
    'project'
  ),
  (
    '73400000-0000-4000-8000-000000000004',
    '73100000-0000-4000-8000-000000000006',
    '73000000-0000-4000-8000-000000000001',
    'project'
  );
INSERT INTO public.agent_runs (
  id, project_id, created_by, conversation_id
)
VALUES (
  '73500000-0000-4000-8000-000000000001',
  '73100000-0000-4000-8000-000000000001',
  '73000000-0000-4000-8000-000000000001',
  '73400000-0000-4000-8000-000000000001'
), (
  '73500000-0000-4000-8000-000000000002',
  '73100000-0000-4000-8000-000000000005',
  '73000000-0000-4000-8000-000000000001',
  '73400000-0000-4000-8000-000000000003'
);
INSERT INTO public.git_connections (
  id, user_id, provider, account_login
)
VALUES (
  '73600000-0000-4000-8000-000000000001',
  '73000000-0000-4000-8000-000000000001',
  'github',
  'realtime-generation'
);
INSERT INTO public.project_git_links (
  id, project_id, connection_id, provider, external_repo_id,
  repo_owner, repo_name, repo_full_name, created_by
)
VALUES
  (
    '73700000-0000-4000-8000-000000000001',
    '73100000-0000-4000-8000-000000000001',
    '73600000-0000-4000-8000-000000000001',
    'github',
    'realtime-generation-repository-one',
    'synthetic',
    'realtime-generation',
    'synthetic/realtime-generation',
    '73000000-0000-4000-8000-000000000001'
  ),
  (
    '73700000-0000-4000-8000-000000000002',
    '73100000-0000-4000-8000-000000000002',
    '73600000-0000-4000-8000-000000000001',
    'github',
    'realtime-generation-repository-two',
    'synthetic',
    'realtime-generation',
    'synthetic/realtime-generation',
    '73000000-0000-4000-8000-000000000001'
  );
INSERT INTO public.pull_requests (
  id, provider, repo_full_name, number, title
)
VALUES (
  '73800000-0000-4000-8000-000000000001',
  'github',
  'synthetic/realtime-generation',
  1,
  'Realtime generation pull request'
);

SELECT is(
  (
    SELECT generation
    FROM public.project_realtime_generations
    WHERE project_id = '73100000-0000-4000-8000-000000000001'
  ),
  3::bigint,
  'adding a member and repository link rotate the initialized generation'
);
SELECT is(
  (
    SELECT generation
    FROM public.project_realtime_generations
    WHERE project_id = '73100000-0000-4000-8000-000000000002'
  ),
  3::bigint,
  'the linked project has an independently rotated generation'
);

CREATE TEMP TABLE missing_project_generation AS
SELECT *
FROM public.project_realtime_generations
WHERE project_id = '73100000-0000-4000-8000-000000000002';

DELETE FROM public.project_realtime_generations
WHERE project_id = '73100000-0000-4000-8000-000000000002';

SELECT is(
  public.current_realtime_topic(
    'pull-request:73800000-0000-4000-8000-000000000001'
  ),
  NULL::text,
  'a shared pull request fails closed when any linked project generation is missing'
);

SELECT throws_ok(
  $$ SELECT public.rotate_project_realtime_generation(
       '73100000-0000-4000-8000-000000000002'
     ) $$,
  '23514',
  'realtime_project_generation_missing',
  'a missing project generation aborts rather than skipping revocation'
);

INSERT INTO public.project_realtime_generations (project_id, generation)
SELECT project_id, generation FROM missing_project_generation;

SELECT isnt(
  public.current_realtime_topic(
    'agent-run:73500000-0000-4000-8000-000000000002'
  ),
  'agent-run:73500000-0000-4000-8000-000000000002:v:' ||
    pg_catalog.md5('73100000-0000-4000-8000-000000000006:2'),
  'an agent run topic is bound to its project even at equal generations'
);
UPDATE public.agent_runs
SET conversation_id = '73400000-0000-4000-8000-000000000004',
    project_id = '73100000-0000-4000-8000-000000000006'
WHERE id = '73500000-0000-4000-8000-000000000002';
SELECT is(
  public.current_realtime_topic(
    'agent-run:73500000-0000-4000-8000-000000000002'
  ),
  'agent-run:73500000-0000-4000-8000-000000000002:v:' ||
    pg_catalog.md5('73100000-0000-4000-8000-000000000006:3'),
  'moving a service-owned run scope changes its topic across equal generations'
);
SELECT is(
  (
    SELECT generation
    FROM public.project_realtime_generations
    WHERE project_id = '73100000-0000-4000-8000-000000000005'
  ),
  3::bigint,
  'moving a run rotates its old project generation'
);
SELECT is(
  (
    SELECT generation
    FROM public.project_realtime_generations
    WHERE project_id = '73100000-0000-4000-8000-000000000006'
  ),
  3::bigint,
  'moving a run rotates its new project generation'
);
UPDATE public.agent_runs
SET conversation_id = '73400000-0000-4000-8000-000000000003',
    project_id = '73100000-0000-4000-8000-000000000005'
WHERE id = '73500000-0000-4000-8000-000000000002';

SELECT isnt(
  public.current_realtime_topic(
    'numo-comment:73300000-0000-4000-8000-000000000001'
  ),
  'numo-comment:73300000-0000-4000-8000-000000000001:v:' ||
    pg_catalog.md5('73100000-0000-4000-8000-000000000002:3'),
  'a Numo comment topic is bound to its project at equal generations'
);
SELECT throws_ok(
  $$ UPDATE public.comments
     SET issue_id = '73200000-0000-4000-8000-000000000002'
     WHERE id = '73300000-0000-4000-8000-000000000001' $$,
  '42501',
  'Numo comment scope is immutable',
  'a privileged worker cannot move a live Numo comment between projects'
);
SELECT is(
  public.current_realtime_topic(
    'numo-comment:73300000-0000-4000-8000-000000000001'
  ),
  'numo-comment:73300000-0000-4000-8000-000000000001:v:' ||
    pg_catalog.md5('73100000-0000-4000-8000-000000000001:3'),
  'a rejected comment move leaves its original topic unchanged'
);
SELECT is(
  public.current_realtime_topic(
    'numo-page-comment:73300000-0000-4000-8000-000000000001'
  ),
  'numo-page-comment:73300000-0000-4000-8000-000000000001:v:' ||
    pg_catalog.md5('73100000-0000-4000-8000-000000000002:3'),
  'an equal page-comment UUID resolves through its independent project scope'
);
SELECT is(
  (
    SELECT project_id
    FROM public.realtime_topic_project_ids(
      'numo-comment:73300000-0000-4000-8000-000000000001'
    ) AS project(project_id)
  ),
  '73100000-0000-4000-8000-000000000001'::uuid,
  'the regular comment namespace reports only the regular comment project'
);
SELECT is(
  (
    SELECT project_id
    FROM public.realtime_topic_project_ids(
      'numo-page-comment:73300000-0000-4000-8000-000000000001'
    ) AS project(project_id)
  ),
  '73100000-0000-4000-8000-000000000002'::uuid,
  'the page comment namespace reports only the page comment project'
);
SELECT public.broadcast_private_realtime(
  'numo-comment:73300000-0000-4000-8000-000000000001',
  'collision-regular-comment',
  '{"table":"comments"}'::jsonb
);
SELECT public.broadcast_private_realtime(
  'numo-page-comment:73300000-0000-4000-8000-000000000001',
  'collision-page-comment',
  '{"table":"page_comments"}'::jsonb
);
SELECT isnt(
  (
    SELECT topic
    FROM realtime.messages
    WHERE event = 'collision-regular-comment'
  ),
  (
    SELECT topic
    FROM realtime.messages
    WHERE event = 'collision-page-comment'
  ),
  'equal UUIDs from the two tables cannot cross-broadcast on one topic'
);
SELECT throws_ok(
  $$ UPDATE public.issues
     SET project_id = '73100000-0000-4000-8000-000000000002'
     WHERE id = '73200000-0000-4000-8000-000000000001' $$,
  '42501',
  'cross_project_move',
  'an issue parent cannot carry Numo comments into another project'
);
SELECT throws_ok(
  $$ UPDATE public.objectives
     SET project_id = '73100000-0000-4000-8000-000000000002'
     WHERE id = '73210000-0000-4000-8000-000000000001' $$,
  '42501',
  'cross_project_move',
  'an objective parent cannot carry Numo comments into another project'
);
SELECT throws_ok(
  $$ UPDATE public.pages
     SET project_id = '73100000-0000-4000-8000-000000000002'
     WHERE id = '73220000-0000-4000-8000-000000000001' $$,
  '42501',
  'cross_project_move',
  'a page parent cannot carry Numo comments into another project'
);
SELECT throws_ok(
  $$ UPDATE public.feedback_posts
     SET project_id = '73100000-0000-4000-8000-000000000002'
     WHERE id = '73230000-0000-4000-8000-000000000001' $$,
  '42501',
  'cross_project_move',
  'a feedback parent cannot carry Numo comments into another project'
);

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"73000000-0000-4000-8000-000000000003","aal":"aal1","session_id":"73010000-0000-4000-8000-000000000003"}',
  true
);
SELECT is(
  public.resolve_realtime_topic(
    'numo-page-comment:73300000-0000-4000-8000-000000000001'
  ),
  'numo-page-comment:73300000-0000-4000-8000-000000000001:v:' ||
    pg_catalog.md5('73100000-0000-4000-8000-000000000002:3'),
  'a page project member resolves the colliding page comment namespace'
);
SELECT ok(
  public.can_watch_numo_page_comment(
    'numo-page-comment:73300000-0000-4000-8000-000000000001'
  ),
  'a page project member can use the page comment authorization helper'
);
SELECT ok(
  NOT public.can_watch_numo_comment(
    'numo-comment:73300000-0000-4000-8000-000000000001'
  ),
  'the page project member cannot cross the colliding regular comment helper'
);
SELECT throws_ok(
  $$ SELECT public.resolve_realtime_topic(
       'numo-comment:73300000-0000-4000-8000-000000000001'
     ) $$,
  '42501',
  'Realtime topic access denied',
  'a page-only member cannot use the colliding UUID to resolve the regular comment'
);
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"73000000-0000-4000-8000-000000000002","aal":"aal1","session_id":"73010000-0000-4000-8000-000000000002"}',
  true
);
SELECT is(
  public.resolve_realtime_topic(
    'project:73100000-0000-4000-8000-000000000001'
  ),
  'project:73100000-0000-4000-8000-000000000001:v:' ||
    pg_catalog.md5('73100000-0000-4000-8000-000000000001:3'),
  'a member resolves the current project generation'
);
SELECT is(
  public.resolve_realtime_topic(
    'page-presence:73100000-0000-4000-8000-000000000001'
  ),
  'page-presence:73100000-0000-4000-8000-000000000001:v:' ||
    pg_catalog.md5('73100000-0000-4000-8000-000000000001:3'),
  'a member resolves the current Presence generation'
);
SELECT is(
  public.resolve_realtime_topic(
    'agent-run:73500000-0000-4000-8000-000000000001'
  ),
  'agent-run:73500000-0000-4000-8000-000000000001:v:' ||
    pg_catalog.md5('73100000-0000-4000-8000-000000000001:3'),
  'a member resolves a project-visible agent run generation'
);
SELECT is(
  public.resolve_realtime_topic(
    'numo-comment:73300000-0000-4000-8000-000000000001'
  ),
  'numo-comment:73300000-0000-4000-8000-000000000001:v:' ||
    pg_catalog.md5('73100000-0000-4000-8000-000000000001:3'),
  'a member resolves a Numo comment generation'
);
SELECT ok(
  public.can_watch_numo_comment(
    'numo-comment:73300000-0000-4000-8000-000000000001'
  ),
  'a regular comment project member can use its authorization helper'
);
SELECT ok(
  NOT public.can_watch_numo_page_comment(
    'numo-page-comment:73300000-0000-4000-8000-000000000001'
  ),
  'the regular comment member cannot cross the colliding page helper'
);
SELECT throws_ok(
  $$ SELECT public.resolve_realtime_topic(
       'numo-page-comment:73300000-0000-4000-8000-000000000001'
     ) $$,
  '42501',
  'Realtime topic access denied',
  'a regular-comment member cannot use the colliding UUID to resolve the page comment'
);
SELECT ok(
  public.resolve_realtime_topic(
    'pull-request:73800000-0000-4000-8000-000000000001'
  ) LIKE 'pull-request:73800000-0000-4000-8000-000000000001:v:%',
  'a member resolves the linked pull request generation digest'
);
SELECT is(
  public.resolve_realtime_topic(
    'agent-run:73500000-0000-4000-8000-000000000002'
  ),
  'agent-run:73500000-0000-4000-8000-000000000002:v:' ||
    pg_catalog.md5('73100000-0000-4000-8000-000000000005:4'),
  'a project member initially resolves a project-visible run'
);
RESET ROLE;
UPDATE public.agent_conversations
SET visibility = 'private'
WHERE id = '73400000-0000-4000-8000-000000000003';
SELECT is(
  (
    SELECT generation
    FROM public.project_realtime_generations
    WHERE project_id = '73100000-0000-4000-8000-000000000005'
  ),
  5::bigint,
  'making a conversation private rotates its project generation'
);
SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"73000000-0000-4000-8000-000000000002","aal":"aal1","session_id":"73010000-0000-4000-8000-000000000002"}',
  true
);
SELECT throws_ok(
  $$ SELECT public.resolve_realtime_topic(
       'agent-run:73500000-0000-4000-8000-000000000002'
     ) $$,
  '42501',
  'Realtime topic access denied',
  'a former project viewer cannot resolve a run after it becomes private'
);
SELECT set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"73000000-0000-4000-8000-000000000001","aal":"aal1","session_id":"73010000-0000-4000-8000-000000000001"}',
  true
);
SELECT is(
  public.resolve_realtime_topic(
    'agent-run:73500000-0000-4000-8000-000000000002'
  ),
  'agent-run:73500000-0000-4000-8000-000000000002:v:' ||
    pg_catalog.md5('73100000-0000-4000-8000-000000000005:5'),
  'the private conversation owner resolves its replacement run topic'
);
SELECT set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"73000000-0000-4000-8000-000000000002","aal":"aal1","session_id":"73010000-0000-4000-8000-000000000002"}',
  true
);
SELECT is(
  public.realtime_topic_is_current(
    public.resolve_realtime_topic(
      'project:73100000-0000-4000-8000-000000000001'
    )
  ),
  true,
  'the current project generation satisfies the Realtime join guard'
);
SELECT is(
  public.realtime_topic_is_current(
    'project:73100000-0000-4000-8000-000000000001:v:future'
  ),
  false,
  'a prejoined future project topic fails the Realtime join guard'
);
SELECT throws_ok(
  $$ SELECT public.resolve_realtime_topic(
       'project:73100000-0000-4000-8000-000000000001:alias'
     ) $$,
  '42501',
  'Realtime topic access denied',
  'the resolver rejects noncanonical logical topic aliases'
);
SELECT throws_ok(
  $$ SELECT public.resolve_realtime_topic(
       'project:73100000-0000-4000-8000-000000000001:v:future'
     ) $$,
  '42501',
  'Realtime topic access denied',
  'the public resolver accepts logical topics only'
);

SELECT set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"73000000-0000-4000-8000-000000000002","aal":"aal1"}',
  true
);
SELECT throws_ok(
  $$ SELECT public.resolve_realtime_topic(
       'project:73100000-0000-4000-8000-000000000001'
     ) $$,
  '42501',
  'Realtime topic access denied',
  'the resolver rejects a token without a session identifier'
);
SELECT set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"73000000-0000-4000-8000-000000000002","aal":"aal1","session_id":"malformed"}',
  true
);
SELECT throws_ok(
  $$ SELECT public.resolve_realtime_topic(
       'project:73100000-0000-4000-8000-000000000001'
     ) $$,
  '42501',
  'Realtime topic access denied',
  'the resolver rejects a malformed session identifier'
);
RESET ROLE;
UPDATE auth.refresh_tokens
SET revoked = true
WHERE session_id = '73010000-0000-4000-8000-000000000002';
SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"73000000-0000-4000-8000-000000000002","aal":"aal1","session_id":"73010000-0000-4000-8000-000000000002"}',
  true
);
SELECT throws_ok(
  $$ SELECT public.resolve_realtime_topic(
       'project:73100000-0000-4000-8000-000000000001'
     ) $$,
  '42501',
  'Realtime topic access denied',
  'the resolver rejects a session with revoked refresh authority'
);
RESET ROLE;
UPDATE auth.refresh_tokens
SET revoked = false
WHERE session_id = '73010000-0000-4000-8000-000000000002';
SET LOCAL ROLE authenticated;

SELECT set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"73000000-0000-4000-8000-000000000003","aal":"aal1","session_id":"73010000-0000-4000-8000-000000000003"}',
  true
);
SELECT throws_ok(
  $$ SELECT public.resolve_realtime_topic(
       'project:73100000-0000-4000-8000-000000000001'
     ) $$,
  '42501',
  'Realtime topic access denied',
  'an outsider cannot resolve a project topic'
);
SELECT throws_ok(
  $$ SELECT public.resolve_realtime_topic(
       'agent-run:73500000-0000-4000-8000-000000000001'
     ) $$,
  '42501',
  'Realtime topic access denied',
  'an outsider cannot resolve a project-visible agent run topic'
);
SELECT ok(
  public.resolve_realtime_topic(
    'pull-request:73800000-0000-4000-8000-000000000001'
  ) LIKE 'pull-request:73800000-0000-4000-8000-000000000001:v:%',
  'a user linked only through another project can resolve the shared PR topic'
);

SELECT set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"73000000-0000-4000-8000-000000000001","aal":"aal1","session_id":"73010000-0000-4000-8000-000000000001"}',
  true
);
SELECT throws_ok(
  $$ UPDATE public.project_members
     SET project_id = '73100000-0000-4000-8000-000000000002'
     WHERE project_id = '73100000-0000-4000-8000-000000000001'
       AND user_id = '73000000-0000-4000-8000-000000000002' $$,
  '42501',
  'cross_project_move',
  'membership rows cannot move between projects at the database boundary'
);

RESET ROLE;
SELECT is(
  (
    SELECT generation
    FROM public.project_realtime_generations
    WHERE project_id = '73100000-0000-4000-8000-000000000001'
  ),
  3::bigint,
  'the rejected membership move leaves the source generation unchanged'
);
SELECT is(
  (
    SELECT generation
    FROM public.project_realtime_generations
    WHERE project_id = '73100000-0000-4000-8000-000000000002'
  ),
  3::bigint,
  'the rejected membership move leaves the destination generation unchanged'
);

SELECT lives_ok(
  $$ SELECT realtime.send(
       '{"marker":"generation-before"}'::jsonb,
       'generation-test',
       'project:73100000-0000-4000-8000-000000000001',
       true
     ) $$,
  'a database broadcaster can send through the canonicalizing trigger'
);
SELECT is(
  (
    SELECT topic
    FROM realtime.messages
    WHERE event = 'generation-test'
      AND payload->>'marker' = 'generation-before'
    ORDER BY inserted_at DESC
    LIMIT 1
  ),
  'project:73100000-0000-4000-8000-000000000001:v:' ||
    pg_catalog.md5('73100000-0000-4000-8000-000000000001:3'),
  'database broadcasts are written only to the current generation'
);

DELETE FROM public.project_members
WHERE project_id = '73100000-0000-4000-8000-000000000001'
  AND user_id = '73000000-0000-4000-8000-000000000002';

SELECT is(
  (
    SELECT generation
    FROM public.project_realtime_generations
    WHERE project_id = '73100000-0000-4000-8000-000000000001'
  ),
  4::bigint,
  'removing a member rotates the project to a new generation'
);
SELECT ok(
  EXISTS (
    SELECT 1
    FROM realtime.messages
    WHERE event = 'rekey'
      AND topic = 'project:73100000-0000-4000-8000-000000000001:v:' ||
        pg_catalog.md5('73100000-0000-4000-8000-000000000001:3')
      AND payload->>'projectId' =
        '73100000-0000-4000-8000-000000000001'
  ),
  'the old project topic receives a rekey signal before rotation'
);
SELECT ok(
  EXISTS (
    SELECT 1
    FROM realtime.messages
    WHERE event = 'rekey'
      AND topic = 'user:73000000-0000-4000-8000-000000000002:v:' ||
        pg_catalog.md5('73000000-0000-4000-8000-000000000002:1')
      AND payload->>'projectId' =
        '73100000-0000-4000-8000-000000000001'
  ),
  'the removed member personal topic receives a rekey signal'
);
SELECT ok(
  EXISTS (
    SELECT 1
    FROM realtime.messages
    WHERE event = 'rekey'
      AND topic = 'user:73000000-0000-4000-8000-000000000003:v:' ||
        pg_catalog.md5('73000000-0000-4000-8000-000000000003:1')
      AND payload->>'projectId' =
        '73100000-0000-4000-8000-000000000001'
  ),
  'a user linked only through another project receives the PR rekey signal'
);

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"73000000-0000-4000-8000-000000000002","aal":"aal1","session_id":"73010000-0000-4000-8000-000000000002"}',
  true
);
SELECT throws_ok(
  $$ SELECT public.resolve_realtime_topic(
       'project:73100000-0000-4000-8000-000000000001'
     ) $$,
  '42501',
  'Realtime topic access denied',
  'a removed member cannot resolve the replacement project topic'
);
SELECT throws_ok(
  $$ SELECT public.resolve_realtime_topic(
       'page-presence:73100000-0000-4000-8000-000000000001'
     ) $$,
  '42501',
  'Realtime topic access denied',
  'a removed member cannot resolve replacement Presence'
);
SELECT throws_ok(
  $$ SELECT public.resolve_realtime_topic(
       'agent-run:73500000-0000-4000-8000-000000000001'
     ) $$,
  '42501',
  'Realtime topic access denied',
  'a removed member cannot resolve a replacement agent run topic'
);
SELECT throws_ok(
  $$ SELECT public.resolve_realtime_topic(
       'numo-comment:73300000-0000-4000-8000-000000000001'
     ) $$,
  '42501',
  'Realtime topic access denied',
  'a removed member cannot resolve a replacement Numo comment topic'
);
SELECT throws_ok(
  $$ SELECT public.resolve_realtime_topic(
       'pull-request:73800000-0000-4000-8000-000000000001'
     ) $$,
  '42501',
  'Realtime topic access denied',
  'a removed member cannot resolve a replacement pull request topic'
);

RESET ROLE;
SELECT is(
  public.current_realtime_topic(
    'project:73100000-0000-4000-8000-000000000001'
  ),
  'project:73100000-0000-4000-8000-000000000001:v:' ||
    pg_catalog.md5('73100000-0000-4000-8000-000000000001:4'),
  'service publishers target the replacement generation after revocation'
);

CREATE TEMP TABLE ownership_rekey_counts_before (
  topic text PRIMARY KEY,
  total bigint NOT NULL
);
INSERT INTO ownership_rekey_counts_before (topic, total)
SELECT expected.topic, count(message.id)
FROM (
  VALUES
    (
      'user:73000000-0000-4000-8000-000000000001:v:' ||
        pg_catalog.md5('73000000-0000-4000-8000-000000000001:1')
    ),
    (
      'user:73000000-0000-4000-8000-000000000003:v:' ||
        pg_catalog.md5('73000000-0000-4000-8000-000000000003:1')
    )
) AS expected(topic)
LEFT JOIN realtime.messages AS message
  ON message.topic = expected.topic
 AND message.event = 'rekey'
 AND message.payload->>'projectId' =
   '73100000-0000-4000-8000-000000000001'
GROUP BY expected.topic;

UPDATE public.projects
SET owner_id = '73000000-0000-4000-8000-000000000003'
WHERE id = '73100000-0000-4000-8000-000000000001';
SELECT is(
  (
    SELECT generation
    FROM public.project_realtime_generations
    WHERE project_id = '73100000-0000-4000-8000-000000000001'
  ),
  5::bigint,
  'changing project ownership rotates the Realtime generation'
);
SELECT ok(
  EXISTS (
    SELECT 1
    FROM realtime.messages
    WHERE event = 'rekey'
      AND topic = 'project:73100000-0000-4000-8000-000000000001:v:' ||
        pg_catalog.md5('73100000-0000-4000-8000-000000000001:4')
      AND payload->>'projectId' =
        '73100000-0000-4000-8000-000000000001'
  ),
  'the pre-transfer project topic receives the ownership rekey signal'
);
SELECT cmp_ok(
  (
    SELECT count(*)
    FROM realtime.messages
    WHERE event = 'rekey'
      AND topic = 'user:73000000-0000-4000-8000-000000000001:v:' ||
        pg_catalog.md5('73000000-0000-4000-8000-000000000001:1')
      AND payload->>'projectId' =
        '73100000-0000-4000-8000-000000000001'
  ),
  '>',
  (
    SELECT total
    FROM ownership_rekey_counts_before
    WHERE topic = 'user:73000000-0000-4000-8000-000000000001:v:' ||
      pg_catalog.md5('73000000-0000-4000-8000-000000000001:1')
  ),
  'the former owner receives a new ownership rekey signal'
);
SELECT cmp_ok(
  (
    SELECT count(*)
    FROM realtime.messages
    WHERE event = 'rekey'
      AND topic = 'user:73000000-0000-4000-8000-000000000003:v:' ||
        pg_catalog.md5('73000000-0000-4000-8000-000000000003:1')
      AND payload->>'projectId' =
        '73100000-0000-4000-8000-000000000001'
  ),
  '>',
  (
    SELECT total
    FROM ownership_rekey_counts_before
    WHERE topic = 'user:73000000-0000-4000-8000-000000000003:v:' ||
      pg_catalog.md5('73000000-0000-4000-8000-000000000003:1')
  ),
  'the new owner receives the ownership rekey signal'
);

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"73000000-0000-4000-8000-000000000001","aal":"aal1","session_id":"73010000-0000-4000-8000-000000000001"}',
  true
);
SELECT throws_ok(
  $$ SELECT public.resolve_realtime_topic(
       'project:73100000-0000-4000-8000-000000000001'
     ) $$,
  '42501',
  'Realtime topic access denied',
  'the former owner cannot resolve the replacement project topic'
);
SELECT set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"73000000-0000-4000-8000-000000000003","aal":"aal1","session_id":"73010000-0000-4000-8000-000000000003"}',
  true
);
SELECT is(
  public.resolve_realtime_topic(
    'project:73100000-0000-4000-8000-000000000001'
  ),
  'project:73100000-0000-4000-8000-000000000001:v:' ||
    pg_catalog.md5('73100000-0000-4000-8000-000000000001:5'),
  'the new owner resolves the ownership replacement topic'
);

RESET ROLE;

CREATE TEMP TABLE pr_topic_before_change AS
SELECT public.current_realtime_topic(
  'pull-request:73800000-0000-4000-8000-000000000001'
) AS topic;
UPDATE public.project_git_links
SET project_id = '73100000-0000-4000-8000-000000000003'
WHERE id = '73700000-0000-4000-8000-000000000002';
SELECT is(
  (
    SELECT generation
    FROM public.project_realtime_generations
    WHERE project_id = '73100000-0000-4000-8000-000000000002'
  ),
  4::bigint,
  'moving a repository link rotates its old project'
);
SELECT is(
  (
    SELECT generation
    FROM public.project_realtime_generations
    WHERE project_id = '73100000-0000-4000-8000-000000000003'
  ),
  2::bigint,
  'moving a repository link rotates its new project'
);
SELECT isnt(
  public.current_realtime_topic(
    'pull-request:73800000-0000-4000-8000-000000000001'
  ),
  (SELECT topic FROM pr_topic_before_change),
  'moving a repository link replaces the shared pull request topic'
);
UPDATE pr_topic_before_change
SET topic = public.current_realtime_topic(
  'pull-request:73800000-0000-4000-8000-000000000001'
);

DELETE FROM public.project_git_links
WHERE id = '73700000-0000-4000-8000-000000000002';
SELECT is(
  (
    SELECT generation
    FROM public.project_realtime_generations
    WHERE project_id = '73100000-0000-4000-8000-000000000003'
  ),
  3::bigint,
  'removing a repository link rotates its former project'
);
SELECT isnt(
  public.current_realtime_topic(
    'pull-request:73800000-0000-4000-8000-000000000001'
  ),
  (SELECT topic FROM pr_topic_before_change),
  'removing a repository link replaces the pull request topic'
);
UPDATE pr_topic_before_change
SET topic = public.current_realtime_topic(
  'pull-request:73800000-0000-4000-8000-000000000001'
);

INSERT INTO public.project_git_links (
  id, project_id, connection_id, provider, external_repo_id,
  repo_owner, repo_name, repo_full_name, created_by
)
VALUES (
  '73700000-0000-4000-8000-000000000003',
  '73100000-0000-4000-8000-000000000002',
  '73600000-0000-4000-8000-000000000001',
  'github',
  'realtime-generation-repository-three',
  'synthetic',
  'realtime-generation',
  'synthetic/realtime-generation',
  '73000000-0000-4000-8000-000000000001'
);
SELECT is(
  (
    SELECT generation
    FROM public.project_realtime_generations
    WHERE project_id = '73100000-0000-4000-8000-000000000002'
  ),
  5::bigint,
  'adding a repository link rotates its project'
);
SELECT isnt(
  public.current_realtime_topic(
    'pull-request:73800000-0000-4000-8000-000000000001'
  ),
  (SELECT topic FROM pr_topic_before_change),
  'adding a repository link replaces the pull request topic'
);

INSERT INTO public.project_git_links (
  id, project_id, connection_id, provider, external_repo_id,
  repo_owner, repo_name, repo_full_name, created_by
)
VALUES (
  '73700000-0000-4000-8000-000000000004',
  '73100000-0000-4000-8000-000000000003',
  '73600000-0000-4000-8000-000000000001',
  'github',
  'realtime-generation-repository-four',
  'synthetic',
  'realtime-generation-moved',
  'synthetic/realtime-generation-moved',
  '73000000-0000-4000-8000-000000000001'
);
CREATE TEMP TABLE pr_row_scope_before AS
SELECT public.current_realtime_topic(
  'pull-request:73800000-0000-4000-8000-000000000001'
) AS topic;
UPDATE public.pull_requests
SET repo_full_name = 'synthetic/realtime-generation-moved'
WHERE id = '73800000-0000-4000-8000-000000000001';
SELECT isnt(
  public.current_realtime_topic(
    'pull-request:73800000-0000-4000-8000-000000000001'
  ),
  (SELECT topic FROM pr_row_scope_before),
  'moving a pull request repository replaces its authorization topic'
);
SELECT ok(
  EXISTS (
    SELECT 1
    FROM realtime.messages
    WHERE topic = (SELECT topic FROM pr_row_scope_before)
      AND event = 'rekey'
      AND payload->>'pullRequestId' =
        '73800000-0000-4000-8000-000000000001'
  ),
  'the old pull request topic receives a rekey signal before its scope moves'
);
UPDATE public.pull_requests
SET repo_full_name = 'synthetic/realtime-generation'
WHERE id = '73800000-0000-4000-8000-000000000001';

SELECT set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"73000000-0000-4000-8000-000000000004","aal":"aal1","session_id":"73010000-0000-4000-8000-000000000004"}',
  true
);
SELECT set_config(
  'minddy_test.realtime_amr_epoch',
  pg_catalog.floor(EXTRACT(epoch FROM now()))::bigint::text,
  true
);
INSERT INTO auth.mfa_factors (
  id, user_id, factor_type, status, created_at, updated_at,
  last_challenged_at
)
VALUES (
  '73020000-0000-4000-8000-000000000004',
  '73000000-0000-4000-8000-000000000004',
  'totp',
  'verified',
  pg_catalog.to_timestamp(
    current_setting('minddy_test.realtime_amr_epoch')::double precision
  ),
  pg_catalog.to_timestamp(
    current_setting('minddy_test.realtime_amr_epoch')::double precision
  ),
  pg_catalog.to_timestamp(
    current_setting('minddy_test.realtime_amr_epoch')::double precision
  )
);
SELECT is(
  (
    SELECT generation
    FROM public.user_realtime_generations
    WHERE user_id = '73000000-0000-4000-8000-000000000004'
  ),
  1::bigint,
  'MFA factor rotation remains deferred before the constraint fires'
);
SET CONSTRAINTS auth.auth_mfa_factors_rekey_realtime_insert IMMEDIATE;
SELECT is(
  (
    SELECT generation
    FROM public.user_realtime_generations
    WHERE user_id = '73000000-0000-4000-8000-000000000004'
  ),
  2::bigint,
  'verifying an MFA factor rotates the personal Realtime generation'
);
SELECT is(
  (
    SELECT generation
    FROM public.project_realtime_generations
    WHERE project_id = '73100000-0000-4000-8000-000000000004'
  ),
  2::bigint,
  'verifying an MFA factor rotates every accessible project generation'
);
SELECT ok(
  EXISTS (
    SELECT 1
    FROM realtime.messages
    WHERE event = 'rekey'
      AND topic = 'user:73000000-0000-4000-8000-000000000004:v:' ||
        pg_catalog.md5('73000000-0000-4000-8000-000000000004:1')
  ),
  'MFA verification signals the old personal topic before rotation'
);
SET CONSTRAINTS auth.auth_mfa_factors_rekey_realtime_insert DEFERRED;
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$ SELECT public.resolve_realtime_topic(
       'user:73000000-0000-4000-8000-000000000004'
     ) $$,
  '42501',
  'Realtime topic access denied',
  'an AAL1 token cannot resolve a replacement topic after MFA verification'
);
RESET ROLE;
UPDATE auth.sessions
SET aal = 'aal2',
    factor_id = '73020000-0000-4000-8000-000000000004'
WHERE id = '73010000-0000-4000-8000-000000000004';
INSERT INTO auth.mfa_amr_claims (
  id, session_id, authentication_method, created_at, updated_at
)
VALUES (
  '73030000-0000-4000-8000-000000000004',
  '73010000-0000-4000-8000-000000000004',
  'totp',
  pg_catalog.to_timestamp(
    current_setting('minddy_test.realtime_amr_epoch')::double precision
  ),
  pg_catalog.to_timestamp(
    current_setting('minddy_test.realtime_amr_epoch')::double precision
  )
);
SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  pg_catalog.jsonb_build_object(
    'role', 'authenticated',
    'sub', '73000000-0000-4000-8000-000000000004',
    'aal', 'aal2',
    'session_id', '73010000-0000-4000-8000-000000000004',
    'amr', pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'method', 'totp',
      'timestamp', current_setting('minddy_test.realtime_amr_epoch')::bigint
    ))
  )::text,
  true
);
SELECT is(
  public.resolve_realtime_topic(
    'user:73000000-0000-4000-8000-000000000004'
  ),
  'user:73000000-0000-4000-8000-000000000004:v:' ||
    pg_catalog.md5('73000000-0000-4000-8000-000000000004:2'),
  'the challenged AAL2 session resolves the replacement personal topic'
);
RESET ROLE;
SELECT set_config(
  'minddy.rt_user_' ||
    pg_catalog.md5('73000000-0000-4000-8000-000000000004'),
  '',
  true
);
UPDATE auth.mfa_amr_claims
SET updated_at = pg_catalog.to_timestamp(
  current_setting('minddy_test.realtime_amr_epoch')::double precision + 60
)
WHERE id = '73030000-0000-4000-8000-000000000004';
SELECT is(
  (
    SELECT generation
    FROM public.user_realtime_generations
    WHERE user_id = '73000000-0000-4000-8000-000000000004'
  ),
  3::bigint,
  'a new MFA challenge epoch rotates the personal Realtime generation'
);
SELECT is(
  (
    SELECT generation
    FROM public.project_realtime_generations
    WHERE project_id = '73100000-0000-4000-8000-000000000004'
  ),
  3::bigint,
  'a new MFA challenge epoch rotates every accessible project generation'
);
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$ SELECT public.resolve_realtime_topic(
       'user:73000000-0000-4000-8000-000000000004'
     ) $$,
  '42501',
  'Realtime topic access denied',
  'a superseded AAL2 AMR epoch cannot resolve the replacement topic'
);
SELECT set_config(
  'request.jwt.claims',
  pg_catalog.jsonb_build_object(
    'role', 'authenticated',
    'sub', '73000000-0000-4000-8000-000000000004',
    'aal', 'aal2',
    'session_id', '73010000-0000-4000-8000-000000000004',
    'amr', pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'method', 'totp',
      'timestamp',
        current_setting('minddy_test.realtime_amr_epoch')::bigint + 60
    ))
  )::text,
  true
);
SELECT is(
  public.resolve_realtime_topic(
    'user:73000000-0000-4000-8000-000000000004'
  ),
  'user:73000000-0000-4000-8000-000000000004:v:' ||
    pg_catalog.md5('73000000-0000-4000-8000-000000000004:3'),
  'the fresh AAL2 AMR epoch resolves its replacement personal topic'
);
RESET ROLE;
SELECT set_config(
  'minddy.rt_user_' ||
    pg_catalog.md5('73000000-0000-4000-8000-000000000004'),
  '',
  true
);
DELETE FROM auth.mfa_factors
WHERE id = '73020000-0000-4000-8000-000000000004';
SET CONSTRAINTS auth.auth_mfa_factors_rekey_realtime_delete IMMEDIATE;
SELECT is(
  (
    SELECT generation
    FROM public.user_realtime_generations
    WHERE user_id = '73000000-0000-4000-8000-000000000004'
  ),
  4::bigint,
  'removing the verified factor rotates the personal generation again'
);
SELECT is(
  (
    SELECT generation
    FROM public.project_realtime_generations
    WHERE project_id = '73100000-0000-4000-8000-000000000004'
  ),
  4::bigint,
  'removing the verified factor rotates accessible project topics again'
);
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$ SELECT public.resolve_realtime_topic(
       'user:73000000-0000-4000-8000-000000000004'
     ) $$,
  '42501',
  'Realtime topic access denied',
  'a stale AAL2 token fails closed after the last factor is removed'
);
RESET ROLE;

INSERT INTO auth.mfa_factors (
  id, user_id, factor_type, status, created_at, updated_at,
  last_challenged_at
)
VALUES (
  '73020000-0000-4000-8000-000000000005',
  '73000000-0000-4000-8000-000000000004',
  'totp',
  'unverified',
  now(),
  now(),
  now()
);
SET CONSTRAINTS auth.auth_mfa_factors_rekey_realtime_insert IMMEDIATE;
SELECT is(
  (
    SELECT generation
    FROM public.user_realtime_generations
    WHERE user_id = '73000000-0000-4000-8000-000000000004'
  ),
  4::bigint,
  'adding an unverified factor does not rotate Realtime topics'
);
SET CONSTRAINTS auth.auth_mfa_factors_rekey_realtime_insert DEFERRED;
SELECT set_config(
  'minddy.rt_user_' ||
    pg_catalog.md5('73000000-0000-4000-8000-000000000004'),
  '',
  true
);
UPDATE auth.mfa_factors
SET status = 'verified'
WHERE id = '73020000-0000-4000-8000-000000000005';
SELECT is(
  (
    SELECT generation
    FROM public.user_realtime_generations
    WHERE user_id = '73000000-0000-4000-8000-000000000004'
  ),
  4::bigint,
  'MFA status updates remain deferred before the constraint fires'
);
SET CONSTRAINTS auth.auth_mfa_factors_rekey_realtime_update IMMEDIATE;
SELECT is(
  (
    SELECT generation
    FROM public.user_realtime_generations
    WHERE user_id = '73000000-0000-4000-8000-000000000004'
  ),
  5::bigint,
  'updating a factor to verified rotates the personal Realtime generation'
);
SELECT is(
  (
    SELECT generation
    FROM public.project_realtime_generations
    WHERE project_id = '73100000-0000-4000-8000-000000000004'
  ),
  5::bigint,
  'the deferred MFA update rotates every accessible project generation'
);
SET CONSTRAINTS auth.auth_mfa_factors_rekey_realtime_update DEFERRED;

CREATE TEMP TABLE refresh_generation_before AS
SELECT generation
FROM public.user_realtime_generations
WHERE user_id = '73000000-0000-4000-8000-000000000002';
UPDATE auth.refresh_tokens
SET revoked = true
WHERE token = 'realtime-member-refresh-token';
INSERT INTO auth.refresh_tokens (token, user_id, revoked, session_id)
VALUES (
  'realtime-member-refresh-token-next',
  '73000000-0000-4000-8000-000000000002',
  false,
  '73010000-0000-4000-8000-000000000002'
);
SET CONSTRAINTS auth.auth_refresh_tokens_rekey_realtime IMMEDIATE;
SELECT is(
  (
    SELECT generation
    FROM public.user_realtime_generations
    WHERE user_id = '73000000-0000-4000-8000-000000000002'
  ),
  (SELECT generation FROM refresh_generation_before),
  'a normal refresh replacement does not rotate personal topics'
);
SET CONSTRAINTS auth.auth_refresh_tokens_rekey_realtime DEFERRED;

CREATE TEMP TABLE expiry_generations_before AS
SELECT
  (SELECT generation FROM public.user_realtime_generations
    WHERE user_id = '73000000-0000-4000-8000-000000000001') AS user_generation,
  (SELECT generation FROM public.project_realtime_generations
    WHERE project_id = '73100000-0000-4000-8000-000000000002') AS project_two,
  (SELECT generation FROM public.project_realtime_generations
    WHERE project_id = '73100000-0000-4000-8000-000000000003') AS project_three;
UPDATE auth.sessions
SET not_after = now() - interval '1 minute'
WHERE id = '73010000-0000-4000-8000-000000000001';
SELECT is(
  (
    SELECT generation
    FROM public.user_realtime_generations
    WHERE user_id = '73000000-0000-4000-8000-000000000001'
  ),
  (SELECT user_generation + 1 FROM expiry_generations_before),
  'expiring an Auth session rotates the personal topic'
);
SELECT is(
  (
    SELECT generation
    FROM public.project_realtime_generations
    WHERE project_id = '73100000-0000-4000-8000-000000000002'
  ),
  (SELECT project_two + 1 FROM expiry_generations_before),
  'expiring an Auth session rotates its first accessible project'
);
SELECT is(
  (
    SELECT generation
    FROM public.project_realtime_generations
    WHERE project_id = '73100000-0000-4000-8000-000000000003'
  ),
  (SELECT project_three + 1 FROM expiry_generations_before),
  'expiring an Auth session rotates its other accessible project'
);
SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"73000000-0000-4000-8000-000000000001","aal":"aal1","session_id":"73010000-0000-4000-8000-000000000001"}',
  true
);
SELECT throws_ok(
  $$ SELECT public.resolve_realtime_topic(
       'user:73000000-0000-4000-8000-000000000001'
     ) $$,
  '42501',
  'Realtime topic access denied',
  'a token for an expired Auth session cannot resolve a replacement topic'
);
RESET ROLE;

CREATE TEMP TABLE deleted_session_generations_before AS
SELECT
  (SELECT generation FROM public.user_realtime_generations
    WHERE user_id = '73000000-0000-4000-8000-000000000003') AS user_generation,
  (SELECT generation FROM public.project_realtime_generations
    WHERE project_id = '73100000-0000-4000-8000-000000000001') AS project_one,
  (SELECT generation FROM public.project_realtime_generations
    WHERE project_id = '73100000-0000-4000-8000-000000000002') AS project_two;
DELETE FROM auth.sessions
WHERE id = '73010000-0000-4000-8000-000000000003';
SELECT is(
  (
    SELECT generation
    FROM public.user_realtime_generations
    WHERE user_id = '73000000-0000-4000-8000-000000000003'
  ),
  (SELECT user_generation + 1 FROM deleted_session_generations_before),
  'deleting an Auth session rotates its personal topic'
);
SELECT is(
  (
    SELECT generation
    FROM public.project_realtime_generations
    WHERE project_id = '73100000-0000-4000-8000-000000000001'
  ),
  (SELECT project_one + 1 FROM deleted_session_generations_before),
  'deleting an Auth session rotates its owned project topic'
);
SELECT is(
  (
    SELECT generation
    FROM public.project_realtime_generations
    WHERE project_id = '73100000-0000-4000-8000-000000000002'
  ),
  (SELECT project_two + 1 FROM deleted_session_generations_before),
  'deleting an Auth session rotates its member project topic'
);
SELECT ok(
  EXISTS (
    SELECT 1
    FROM realtime.messages
    WHERE event = 'rekey'
      AND topic = 'user:73000000-0000-4000-8000-000000000003:v:' ||
        pg_catalog.md5('73000000-0000-4000-8000-000000000003:1')
      AND payload->>'userId' =
        '73000000-0000-4000-8000-000000000003'
  ),
  'session deletion signals the old personal topic before rotation'
);
SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"73000000-0000-4000-8000-000000000003","aal":"aal1","session_id":"73010000-0000-4000-8000-000000000003"}',
  true
);
SELECT throws_ok(
  $$ SELECT public.resolve_realtime_topic(
       'user:73000000-0000-4000-8000-000000000003'
     ) $$,
  '42501',
  'Realtime topic access denied',
  'a token for a deleted Auth session cannot resolve the next personal topic'
);
RESET ROLE;

SELECT lives_ok(
  $$ SELECT realtime.send(
       '{"marker":"missing-project"}'::jsonb,
       'generation-test',
       'project:73900000-0000-4000-8000-000000000099',
       true
     ) $$,
  'an invalid private resource fails closed without breaking its caller'
);
SELECT is(
  (
    SELECT count(*)
    FROM realtime.messages
    WHERE event = 'generation-test'
      AND payload->>'marker' = 'missing-project'
  ),
  0::bigint,
  'an invalid project broadcast never falls back to an unversioned topic'
);

CREATE TEMP TABLE synthetic_membership_move (
  project_id uuid NOT NULL,
  user_id uuid NOT NULL
);
INSERT INTO synthetic_membership_move (project_id, user_id)
VALUES (
  '73100000-0000-4000-8000-000000000001',
  '73000000-0000-4000-8000-000000000002'
);
CREATE TRIGGER synthetic_membership_move_rekey
BEFORE UPDATE ON synthetic_membership_move
FOR EACH ROW EXECUTE FUNCTION public.rekey_project_realtime_membership();
CREATE TEMP TABLE membership_move_generations_before AS
SELECT
  (SELECT generation FROM public.project_realtime_generations
    WHERE project_id = '73100000-0000-4000-8000-000000000001') AS source,
  (SELECT generation FROM public.project_realtime_generations
    WHERE project_id = '73100000-0000-4000-8000-000000000002') AS destination;
UPDATE synthetic_membership_move
SET project_id = '73100000-0000-4000-8000-000000000002';
SELECT is(
  (
    SELECT generation
    FROM public.project_realtime_generations
    WHERE project_id = '73100000-0000-4000-8000-000000000001'
  ),
  (SELECT source + 1 FROM membership_move_generations_before),
  'the membership trigger rotates the old project in a scope move'
);
SELECT is(
  (
    SELECT generation
    FROM public.project_realtime_generations
    WHERE project_id = '73100000-0000-4000-8000-000000000002'
  ),
  (SELECT destination + 1 FROM membership_move_generations_before),
  'the membership trigger rotates the new project in a scope move'
);

INSERT INTO auth.users (id, email, raw_app_meta_data)
VALUES (
  '73000000-0000-4000-8000-000000000099',
  'realtime-tombstone@example.test',
  '{}'::jsonb
);
INSERT INTO public.projects (id, owner_id, name, key)
VALUES (
  '73100000-0000-4000-8000-000000000099',
  '73000000-0000-4000-8000-000000000099',
  'Realtime tombstone project',
  'RTS'
);
CREATE TEMP TABLE reused_realtime_topics AS
SELECT
  public.current_realtime_topic(
    'project:73100000-0000-4000-8000-000000000099'
  ) AS project_topic,
  public.current_realtime_topic(
    'user:73000000-0000-4000-8000-000000000099'
  ) AS user_topic;

DELETE FROM public.projects
WHERE id = '73100000-0000-4000-8000-000000000099';
SELECT is(
  (
    SELECT generation
    FROM public.project_realtime_generations
    WHERE project_id = '73100000-0000-4000-8000-000000000099'
  ),
  2::bigint,
  'hard deletion rotates and retains the project generation tombstone'
);
SELECT is(
  public.current_realtime_topic(
    'project:73100000-0000-4000-8000-000000000099'
  ),
  NULL::text,
  'a project tombstone cannot resolve as a live topic'
);
INSERT INTO public.projects (id, owner_id, name, key)
VALUES (
  '73100000-0000-4000-8000-000000000099',
  '73000000-0000-4000-8000-000000000099',
  'Recreated Realtime tombstone project',
  'RTR'
);
SELECT is(
  (
    SELECT generation
    FROM public.project_realtime_generations
    WHERE project_id = '73100000-0000-4000-8000-000000000099'
  ),
  3::bigint,
  'recreating a project advances its durable generation again'
);
SELECT isnt(
  public.current_realtime_topic(
    'project:73100000-0000-4000-8000-000000000099'
  ),
  (SELECT project_topic FROM reused_realtime_topics),
  'recreating a project UUID cannot revive its formerly joined topic'
);

DELETE FROM public.projects
WHERE id = '73100000-0000-4000-8000-000000000099';
DELETE FROM auth.users
WHERE id = '73000000-0000-4000-8000-000000000099';
SET CONSTRAINTS auth.auth_users_rekey_realtime_delete IMMEDIATE;
SELECT is(
  (
    SELECT generation
    FROM public.user_realtime_generations
    WHERE user_id = '73000000-0000-4000-8000-000000000099'
  ),
  2::bigint,
  'Auth user deletion rotates and retains the personal generation tombstone'
);
SELECT is(
  public.current_realtime_topic(
    'user:73000000-0000-4000-8000-000000000099'
  ),
  NULL::text,
  'a user tombstone cannot resolve as a live topic'
);
SET CONSTRAINTS auth.auth_users_rekey_realtime_delete DEFERRED;
INSERT INTO auth.users (id, email, raw_app_meta_data)
VALUES (
  '73000000-0000-4000-8000-000000000099',
  'realtime-tombstone-recreated@example.test',
  '{}'::jsonb
);
SELECT is(
  (
    SELECT generation
    FROM public.user_realtime_generations
    WHERE user_id = '73000000-0000-4000-8000-000000000099'
  ),
  3::bigint,
  'recreating an Auth UUID advances its durable generation again'
);
SELECT isnt(
  public.current_realtime_topic(
    'user:73000000-0000-4000-8000-000000000099'
  ),
  (SELECT user_topic FROM reused_realtime_topics),
  'recreating an Auth UUID cannot revive its formerly joined personal topic'
);

SELECT * FROM finish();
ROLLBACK;
