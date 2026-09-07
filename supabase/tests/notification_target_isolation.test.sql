BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();

SELECT has_trigger(
  'public',
  'notifications',
  'notifications_guard_client_update',
  'notification updates have a client-owned read-state guard'
);

SELECT has_trigger(
  'public',
  'notifications',
  'notifications_validate_target_scope',
  'notification targets have an all-role project-scope guard'
);

SELECT ok(
  NOT has_function_privilege(
    'authenticated',
    'public.guard_notification_client_update()',
    'EXECUTE'
  ),
  'clients cannot invoke the notification trigger function directly'
);

SELECT ok(
  NOT has_function_privilege(
    'authenticated',
    'public.notification_targets_match_project(public.notifications)',
    'EXECUTE'
  ),
  'clients cannot invoke the notification target validator directly'
);

INSERT INTO auth.users (id, email, raw_app_meta_data)
VALUES
  (
    '76000000-0000-4000-8000-000000000001',
    'notification-owner@example.test',
    '{}'::jsonb
  ),
  (
    '76000000-0000-4000-8000-000000000002',
    'notification-foreign@example.test',
    '{}'::jsonb
  ),
  (
    '76000000-0000-4000-8000-000000000003',
    'notification-outsider@example.test',
    '{}'::jsonb
  );

INSERT INTO public.projects (id, owner_id, name, key)
VALUES
  (
    '76100000-0000-4000-8000-000000000001',
    '76000000-0000-4000-8000-000000000001',
    'Notification source project',
    'NSA'
  ),
  (
    '76100000-0000-4000-8000-000000000002',
    '76000000-0000-4000-8000-000000000002',
    'Notification foreign project',
    'NSB'
  );

INSERT INTO public.issues (id, project_id, number, title, created_by)
VALUES
  (
    '76200000-0000-4000-8000-000000000001',
    '76100000-0000-4000-8000-000000000001',
    1,
    'Source issue',
    '76000000-0000-4000-8000-000000000001'
  ),
  (
    '76200000-0000-4000-8000-000000000002',
    '76100000-0000-4000-8000-000000000002',
    2,
    'Foreign issue',
    '76000000-0000-4000-8000-000000000002'
  );

INSERT INTO public.comments (id, issue_id, author_id, body)
VALUES
  (
    '76300000-0000-4000-8000-000000000001',
    '76200000-0000-4000-8000-000000000001',
    '76000000-0000-4000-8000-000000000001',
    'Source comment body'
  ),
  (
    '76300000-0000-4000-8000-000000000002',
    '76200000-0000-4000-8000-000000000002',
    '76000000-0000-4000-8000-000000000002',
    'Foreign comment body'
  );

INSERT INTO public.objectives (id, project_id, name)
VALUES
  (
    '76500000-0000-4000-8000-000000000001',
    '76100000-0000-4000-8000-000000000001',
    'Source objective'
  ),
  (
    '76500000-0000-4000-8000-000000000002',
    '76100000-0000-4000-8000-000000000002',
    'Foreign objective'
  );

INSERT INTO public.feedback_posts (
  id, project_id, title, submitted_title, source
)
VALUES
  (
    '76600000-0000-4000-8000-000000000001',
    '76100000-0000-4000-8000-000000000001',
    'Source feedback',
    'Source feedback',
    'internal'
  ),
  (
    '76600000-0000-4000-8000-000000000002',
    '76100000-0000-4000-8000-000000000002',
    'Foreign feedback',
    'Foreign feedback',
    'internal'
  );

INSERT INTO public.agent_routines (
  id, project_id, owner_id, title, prompt, frequency
)
VALUES
  (
    '76700000-0000-4000-8000-000000000001',
    '76100000-0000-4000-8000-000000000001',
    '76000000-0000-4000-8000-000000000001',
    'Source routine',
    'Synthetic prompt',
    'daily'
  ),
  (
    '76700000-0000-4000-8000-000000000002',
    '76100000-0000-4000-8000-000000000002',
    '76000000-0000-4000-8000-000000000002',
    'Foreign routine',
    'Synthetic prompt',
    'daily'
  );

INSERT INTO public.pages (id, project_id, title, position)
VALUES
  (
    '76800000-0000-4000-8000-000000000001',
    '76100000-0000-4000-8000-000000000001',
    'Source page',
    'a0'
  ),
  (
    '76800000-0000-4000-8000-000000000002',
    '76100000-0000-4000-8000-000000000002',
    'Foreign page',
    'a0'
  );

INSERT INTO public.agent_conversations (id, project_id, owner_id, title)
VALUES
  (
    '76900000-0000-4000-8000-000000000001',
    '76100000-0000-4000-8000-000000000001',
    '76000000-0000-4000-8000-000000000001',
    'Source conversation'
  ),
  (
    '76900000-0000-4000-8000-000000000002',
    '76100000-0000-4000-8000-000000000002',
    '76000000-0000-4000-8000-000000000002',
    'Foreign conversation'
  );

INSERT INTO public.git_connections (id, user_id, provider)
VALUES
  (
    '76a00000-0000-4000-8000-000000000001',
    '76000000-0000-4000-8000-000000000001',
    'github'
  ),
  (
    '76a00000-0000-4000-8000-000000000002',
    '76000000-0000-4000-8000-000000000002',
    'github'
  );

INSERT INTO public.project_git_links (
  id, project_id, connection_id, provider, external_repo_id, repo_full_name
)
VALUES
  (
    '76b00000-0000-4000-8000-000000000001',
    '76100000-0000-4000-8000-000000000001',
    '76a00000-0000-4000-8000-000000000001',
    'github',
    'repo-a',
    'example/source'
  ),
  (
    '76b00000-0000-4000-8000-000000000002',
    '76100000-0000-4000-8000-000000000002',
    '76a00000-0000-4000-8000-000000000002',
    'github',
    'repo-b',
    'example/foreign'
  );

INSERT INTO public.pull_requests (
  id, provider, repo_full_name, number, title
)
VALUES
  (
    '76c00000-0000-4000-8000-000000000001',
    'github',
    'example/source',
    1,
    'Source pull request'
  ),
  (
    '76c00000-0000-4000-8000-000000000002',
    'github',
    'example/foreign',
    2,
    'Foreign pull request'
  );

INSERT INTO public.notifications (
  id,
  user_id,
  project_id,
  type,
  issue_id,
  comment_id,
  objective_id,
  feedback_post_id,
  routine_id,
  page_id,
  agent_conversation_id,
  pull_request_id
)
VALUES (
  '76400000-0000-4000-8000-000000000001',
  '76000000-0000-4000-8000-000000000001',
  '76100000-0000-4000-8000-000000000001',
  'comment',
  '76200000-0000-4000-8000-000000000001',
  '76300000-0000-4000-8000-000000000001',
  '76500000-0000-4000-8000-000000000001',
  '76600000-0000-4000-8000-000000000001',
  '76700000-0000-4000-8000-000000000001',
  '76800000-0000-4000-8000-000000000001',
  '76900000-0000-4000-8000-000000000001',
  '76c00000-0000-4000-8000-000000000001'
);

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"76000000-0000-4000-8000-000000000001","aal":"aal1"}',
  true
);

SELECT lives_ok(
  $$ UPDATE public.notifications
     SET read_at = now()
     WHERE id = '76400000-0000-4000-8000-000000000001' $$,
  'a client can update the read state of its own notification'
);

SELECT throws_ok(
  $$ UPDATE public.notifications
     SET issue_id = '76200000-0000-4000-8000-000000000002',
         comment_id = '76300000-0000-4000-8000-000000000002'
     WHERE id = '76400000-0000-4000-8000-000000000001' $$,
  '42501',
  'Notification target and identity fields are immutable',
  'a client cannot retarget a notification into another project'
);

SELECT throws_ok(
  $$ UPDATE public.notifications
     SET type = 'assigned', via_assistant = true
     WHERE id = '76400000-0000-4000-8000-000000000001' $$,
  '42501',
  'Notification target and identity fields are immutable',
  'a client cannot forge notification routing or attribution fields'
);

RESET ROLE;
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);

SELECT is(
  pg_catalog.regexp_count(
    pg_catalog.pg_get_functiondef(
      'public.validate_notification_target_scope()'::regprocedure
    ),
    'FOR SHARE'
  ),
  2,
  'notification insertion locks both owner and membership access anchors'
);

SELECT throws_ok(
  $$ INSERT INTO public.notifications (
       user_id, project_id, type, issue_id
     ) VALUES (
       '76000000-0000-4000-8000-000000000003',
       '76100000-0000-4000-8000-000000000001',
       'comment',
       '76200000-0000-4000-8000-000000000001'
     ) $$,
  '23514',
  'notification_recipient_scope_mismatch',
  'the service role cannot notify an outsider about a private project target'
);

INSERT INTO public.project_members (project_id, user_id, role, added_by)
VALUES (
  '76100000-0000-4000-8000-000000000001',
  '76000000-0000-4000-8000-000000000003',
  'member',
  '76000000-0000-4000-8000-000000000001'
);
INSERT INTO public.notifications (
  id, user_id, project_id, type, issue_id
) VALUES (
  '76400000-0000-4000-8000-000000000002',
  '76000000-0000-4000-8000-000000000003',
  '76100000-0000-4000-8000-000000000001',
  'comment',
  '76200000-0000-4000-8000-000000000001'
);
DELETE FROM public.project_members
WHERE project_id = '76100000-0000-4000-8000-000000000001'
  AND user_id = '76000000-0000-4000-8000-000000000003';

SELECT lives_ok(
  $$ UPDATE public.notifications
     SET read_at = now()
     WHERE id = '76400000-0000-4000-8000-000000000002' $$,
  'a later access revocation does not invalidate a historical notification row'
);
SELECT throws_ok(
  $$ INSERT INTO public.notifications (
       user_id, project_id, type, issue_id
     ) VALUES (
       '76000000-0000-4000-8000-000000000003',
       '76100000-0000-4000-8000-000000000001',
       'comment',
       '76200000-0000-4000-8000-000000000001'
     ) $$,
  '23514',
  'notification_recipient_scope_mismatch',
  'a removed member cannot receive a new project notification'
);
SELECT throws_ok(
  $$ UPDATE public.notifications
     SET user_id = '76000000-0000-4000-8000-000000000003'
     WHERE id = '76400000-0000-4000-8000-000000000001' $$,
  '23514',
  'notification_recipient_scope_mismatch',
  'the service role cannot retarget an existing notification to an outsider'
);

SELECT lives_ok(
  $$ UPDATE public.notifications
     SET type = 'mention'
     WHERE id = '76400000-0000-4000-8000-000000000001' $$,
  'the service role retains authority over non-target notification fields'
);

SELECT throws_ok(
  $$ UPDATE public.notifications
     SET issue_id = '76200000-0000-4000-8000-000000000002'
     WHERE id = '76400000-0000-4000-8000-000000000001' $$,
  '23514',
  'notification_target_scope_mismatch',
  'the service role cannot attach an issue from another project'
);

SELECT throws_ok(
  $$ UPDATE public.notifications
     SET comment_id = '76300000-0000-4000-8000-000000000002'
     WHERE id = '76400000-0000-4000-8000-000000000001' $$,
  '23514',
  'notification_target_scope_mismatch',
  'the service role cannot attach a comment from another project'
);

SELECT throws_ok(
  $$ UPDATE public.notifications
     SET objective_id = '76500000-0000-4000-8000-000000000002'
     WHERE id = '76400000-0000-4000-8000-000000000001' $$,
  '23514',
  'notification_target_scope_mismatch',
  'the service role cannot attach an objective from another project'
);

SELECT throws_ok(
  $$ UPDATE public.notifications
     SET feedback_post_id = '76600000-0000-4000-8000-000000000002'
     WHERE id = '76400000-0000-4000-8000-000000000001' $$,
  '23514',
  'notification_target_scope_mismatch',
  'the service role cannot attach feedback from another project'
);

SELECT throws_ok(
  $$ UPDATE public.notifications
     SET routine_id = '76700000-0000-4000-8000-000000000002'
     WHERE id = '76400000-0000-4000-8000-000000000001' $$,
  '23514',
  'notification_target_scope_mismatch',
  'the service role cannot attach a routine from another project'
);

SELECT throws_ok(
  $$ UPDATE public.notifications
     SET page_id = '76800000-0000-4000-8000-000000000002'
     WHERE id = '76400000-0000-4000-8000-000000000001' $$,
  '23514',
  'notification_target_scope_mismatch',
  'the service role cannot attach a page from another project'
);

SELECT throws_ok(
  $$ UPDATE public.notifications
     SET agent_conversation_id = '76900000-0000-4000-8000-000000000002'
     WHERE id = '76400000-0000-4000-8000-000000000001' $$,
  '23514',
  'notification_target_scope_mismatch',
  'the service role cannot attach a conversation from another project'
);

SELECT throws_ok(
  $$ UPDATE public.notifications
     SET pull_request_id = '76c00000-0000-4000-8000-000000000002'
     WHERE id = '76400000-0000-4000-8000-000000000001' $$,
  '23514',
  'notification_target_scope_mismatch',
  'the service role cannot attach a pull request from an unlinked repository'
);

SELECT throws_ok(
  $$ INSERT INTO public.notifications (
       user_id, project_id, type, issue_id
     ) VALUES (
       '76000000-0000-4000-8000-000000000001',
       NULL,
       'comment',
       '76200000-0000-4000-8000-000000000001'
     ) $$,
  '23514',
  'notification_target_scope_mismatch',
  'a target cannot be hidden behind a null notification project'
);

SELECT * FROM finish();
ROLLBACK;
