BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();

SELECT is(
  (SELECT split_part(setting, '=', 2)
   FROM pg_roles, unnest(rolconfig) AS setting
   WHERE rolname = 'authenticator'
     AND setting LIKE 'pgrst.db_pre_request=%'),
  'public.enforce_mfa_aal',
  'PostgREST invokes the global MFA pre-request hook'
);

SELECT ok(
  (SELECT permissive = 'RESTRICTIVE'
   FROM pg_policies
   WHERE schemaname = 'storage'
     AND tablename = 'objects'
     AND policyname = 'mfa_aal_required'),
  'Storage applies the MFA policy as a restrictive policy'
);

SELECT ok(
  (SELECT permissive = 'RESTRICTIVE'
   FROM pg_policies
   WHERE schemaname = 'realtime'
     AND tablename = 'messages'
     AND policyname = 'mfa_aal_required'),
  'Realtime applies the MFA policy as a restrictive policy'
);

SELECT ok(
  (SELECT permissive = 'RESTRICTIVE'
   FROM pg_policies
   WHERE schemaname = 'storage'
     AND tablename = 'objects'
     AND policyname = 'auth_session_required'),
  'Storage applies live session revocation as a restrictive policy'
);

SELECT ok(
  (SELECT permissive = 'RESTRICTIVE'
   FROM pg_policies
   WHERE schemaname = 'realtime'
     AND tablename = 'messages'
     AND policyname = 'auth_session_required'),
  'Realtime applies live session revocation as a restrictive policy'
);

SELECT is(
  (SELECT cmd
   FROM pg_policies
   WHERE schemaname = 'storage'
     AND tablename = 'objects'
     AND policyname = 'mfa_aal_required'),
  'ALL',
  'Storage enforces MFA for every command'
);

SELECT is(
  (SELECT cmd
   FROM pg_policies
   WHERE schemaname = 'realtime'
     AND tablename = 'messages'
     AND policyname = 'mfa_aal_required'),
  'ALL',
  'Realtime Broadcast and Presence enforce MFA for every command'
);

SELECT has_trigger(
  'auth',
  'mfa_amr_claims',
  'mfa_amr_claims_advance_epoch',
  'MFA verification epochs advance before GoTrue reloads the signed AMR'
);

SELECT has_trigger(
  'auth',
  'mfa_amr_claims',
  'mfa_amr_claims_lock_epoch_delete',
  'MFA removal serializes against concurrent verification'
);

SELECT ok(
  (SELECT relrowsecurity
   FROM pg_class
   WHERE oid = 'public.auth_mfa_amr_epochs'::regclass),
  'the durable MFA epoch registry has RLS enabled'
);

SELECT is(
  (SELECT pg_catalog.pg_get_constraintdef(con.oid)
   FROM pg_constraint AS con
   WHERE con.conrelid = 'public.auth_mfa_amr_epochs'::regclass
     AND con.contype = 'p'),
  'PRIMARY KEY (session_id, authentication_method)',
  'the durable MFA epoch registry serializes each session and method'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM pg_constraint AS con
    WHERE con.conrelid = 'public.auth_mfa_amr_epochs'::regclass
      AND con.confrelid = 'auth.sessions'::regclass
      AND con.contype = 'f'
      AND con.confdeltype = 'c'
  ),
  'durable MFA epochs cascade only when their Auth session is deleted'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM unnest(ARRAY['anon', 'authenticated', 'service_role'])
      AS caller(role_name)
    CROSS JOIN unnest(ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE'])
      AS action(privilege_name)
    WHERE has_table_privilege(
      caller.role_name::name,
      'public.auth_mfa_amr_epochs',
      action.privilege_name
    )
  ),
  'API roles cannot read or mutate the durable MFA epoch registry'
);

SELECT ok(
  (SELECT pg_catalog.pg_get_triggerdef(trigger.oid) LIKE
      '%BEFORE INSERT OR UPDATE OF session_id, authentication_method, updated_at%'
   FROM pg_trigger AS trigger
   WHERE trigger.tgrelid = 'auth.mfa_amr_claims'::regclass
     AND trigger.tgname = 'mfa_amr_claims_advance_epoch'
     AND NOT trigger.tgisinternal),
  'the monotone epoch trigger covers both AMR insert and update paths'
);

SELECT ok(
  (SELECT pg_catalog.pg_get_functiondef(
      'public.advance_mfa_amr_epoch()'::regprocedure
    ) LIKE '%pg_advisory_xact_lock%')
  AND
  (SELECT pg_catalog.pg_get_functiondef(
      'public.lock_mfa_amr_epoch_delete()'::regprocedure
    ) LIKE '%pg_advisory_xact_lock%'),
  'AMR insert, update, and delete use the same transaction-scoped lock'
);

SELECT ok(
  NOT has_function_privilege(
    'authenticated',
    'public.mfa_aal_ok_for_user(uuid,uuid,text,jsonb)',
    'EXECUTE'
  ),
  'clients cannot query another account MFA state'
);

SELECT ok(
  has_function_privilege(
    'service_role',
    'public.mfa_aal_ok_for_user(uuid,uuid,text,jsonb)',
    'EXECUTE'
  ),
  'the application server can enforce live MFA state'
);

SELECT ok(
  NOT has_function_privilege(
    'authenticated',
    'public.is_auth_session_active(uuid,uuid)',
    'EXECUTE'
  ),
  'clients cannot inspect Auth sessions'
);

SELECT ok(
  has_function_privilege(
    'service_role',
    'public.is_auth_session_active(uuid,uuid)',
    'EXECUTE'
  ),
  'the admin boundary can revalidate its live Auth session'
);

SELECT ok(
  NOT has_function_privilege(
    'authenticated',
    'public.auth_authorization_state(uuid,uuid,text,jsonb)',
    'EXECUTE'
  ),
  'clients cannot query another account combined authorization state'
);

SELECT ok(
  has_function_privilege(
    'service_role',
    'public.auth_authorization_state(uuid,uuid,text,jsonb)',
    'EXECUTE'
  ),
  'the application server can revalidate session and MFA in one call'
);

SELECT ok(
  has_function_privilege(
    'authenticated',
    'public.auth_session_is_current()',
    'EXECUTE'
  ),
  'authenticated data policies can validate the current live session'
);

SELECT ok(
  NOT has_function_privilege(
    'anon',
    'public.auth_session_is_current()',
    'EXECUTE'
  ),
  'anonymous clients cannot invoke the authenticated session helper'
);

SELECT ok(
  (SELECT prosecdef
   FROM pg_proc
   WHERE oid = 'public.mfa_aal_ok_for_user(uuid,uuid,text,jsonb)'::regprocedure),
  'the live MFA helper can read the protected Auth schema'
);

SELECT ok(
  COALESCE((
    SELECT proconfig @> ARRAY['search_path=""']::text[]
    FROM pg_proc
    WHERE oid = 'public.mfa_aal_ok_for_user(uuid,uuid,text,jsonb)'::regprocedure
  ), false),
  'the live MFA helper has an empty fixed search path'
);

SELECT ok(
  (SELECT prosecdef
   FROM pg_proc
   WHERE oid = 'public.is_auth_session_active(uuid,uuid)'::regprocedure),
  'the live session helper can read the protected Auth schema'
);

SELECT ok(
  COALESCE((
    SELECT proconfig @> ARRAY['search_path=""']::text[]
    FROM pg_proc
    WHERE oid = 'public.is_auth_session_active(uuid,uuid)'::regprocedure
  ), false),
  'the live session helper has an empty fixed search path'
);

SELECT ok(
  COALESCE((
    SELECT EXISTS (
      SELECT 1
      FROM unnest(proconfig) AS setting
      WHERE pg_catalog.lower(setting) = 'timezone=utc'
    )
    FROM pg_proc
    WHERE oid = 'public.is_auth_session_active(uuid,uuid)'::regprocedure
  ), false),
  'the live session helper compares Auth timestamps in UTC'
);

SELECT ok(
  (SELECT prosecdef
   FROM pg_proc
   WHERE oid = 'public.auth_authorization_state(uuid,uuid,text,jsonb)'::regprocedure),
  'the combined authorization helper can read protected live state'
);

SELECT ok(
  COALESCE((
    SELECT proconfig @> ARRAY['search_path=""']::text[]
    FROM pg_proc
    WHERE oid = 'public.auth_authorization_state(uuid,uuid,text,jsonb)'::regprocedure
  ), false),
  'the combined authorization helper has an empty fixed search path'
);

SELECT ok(
  NOT has_function_privilege(
    'authenticated',
    'public.project_storage_quota_allows(uuid,bigint)',
    'EXECUTE'
  ),
  'clients cannot invoke the service-role quota decision directly'
);

SELECT ok(
  has_function_privilege(
    'service_role',
    'public.project_storage_quota_allows(uuid,bigint)',
    'EXECUTE'
  ),
  'the service role can check complete pending upload bytes'
);

SELECT ok(
  NOT has_function_privilege(
    'authenticated',
    'public.account_storage_quota_allows(uuid,bigint)',
    'EXECUTE'
  ),
  'clients cannot invoke the account quota decision directly'
);

SELECT ok(
  has_function_privilege(
    'service_role',
    'public.account_storage_quota_allows(uuid,bigint)',
    'EXECUTE'
  ),
  'the service role can check quota across an account'
);

SELECT ok(
  NOT has_function_privilege(
    'anon',
    'public.account_storage_bytes(uuid)',
    'EXECUTE'
  )
  AND NOT has_function_privilege(
    'authenticated',
    'public.account_storage_bytes(uuid)',
    'EXECUTE'
  )
  AND has_function_privilege(
    'service_role',
    'public.account_storage_bytes(uuid)',
    'EXECUTE'
  ),
  'only the service role can inspect account-wide physical Storage usage'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM unnest(ARRAY['anon', 'authenticated', 'service_role'])
      AS caller(role_name)
    WHERE has_function_privilege(
      caller.role_name::name,
      'public.storage_object_size_bytes(jsonb)',
      'EXECUTE'
    )
  ),
  'API roles cannot invoke the physical Storage metadata parser'
);

SELECT ok(
  (SELECT relrowsecurity AND relforcerowsecurity
   FROM pg_class
   WHERE oid = 'public.project_storage_owners'::regclass),
  'the durable project Storage attribution registry forces RLS'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM unnest(ARRAY['anon', 'authenticated', 'service_role'])
      AS caller(role_name)
    CROSS JOIN unnest(ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE'])
      AS action(privilege_name)
    WHERE has_table_privilege(
      caller.role_name::name,
      'public.project_storage_owners',
      action.privilege_name
    )
  ),
  'API roles cannot read or mutate durable project Storage attribution'
);

SELECT has_trigger(
  'storage',
  'objects',
  'objects_track_storage_attribution',
  'Storage object inserts and deletes maintain durable attribution counts'
);

SELECT has_trigger(
  'public',
  'projects',
  'projects_sync_storage_owner',
  'project creation and ownership transfer synchronize Storage attribution'
);

SELECT has_trigger(
  'public',
  'projects',
  'projects_retire_storage_owner',
  'project hard deletion retires Storage attribution only after final cleanup'
);

SELECT has_trigger(
  'public',
  'projects',
  'projects_guard_identity',
  'a project cannot move away from its permanent Storage namespace'
);

SELECT has_trigger(
  'auth',
  'users',
  'auth_users_guard_chat_storage_reuse',
  'an Auth UUID cannot inherit a deleted account chat namespace'
);

SELECT has_trigger(
  'public',
  'comments',
  'comments_guard_client_update',
  'comment updates have an immutable scope and identity guard'
);

SELECT has_trigger(
  'public',
  'page_comments',
  'page_comments_guard_client_update',
  'page comment updates have an immutable scope and identity guard'
);

SELECT has_trigger(
  'public',
  'comments',
  'comments_validate_parent_scope',
  'comment inserts validate their parent scope'
);

SELECT has_trigger(
  'public',
  'page_comments',
  'page_comments_validate_scope',
  'page comment inserts validate page, project, and parent scope'
);

SELECT ok(
  (SELECT qual LIKE '%via_assistant%false%'
   FROM pg_policies
   WHERE schemaname = 'public'
     AND tablename = 'page_comments'
     AND policyname = 'page_comments_update'),
  'assistant-authored page comments are hidden from client updates'
);

SELECT ok(
  NOT has_function_privilege(
    'authenticated',
    'public.guard_comment_client_update()',
    'EXECUTE'
  ),
  'clients cannot invoke the comment trigger function directly'
);

SELECT ok(
  NOT has_function_privilege(
    'authenticated',
    'public.validate_comment_parent_scope()',
    'EXECUTE'
  ),
  'clients cannot invoke the comment parent validator directly'
);

SELECT ok(
  NOT has_function_privilege(
    'authenticated',
    'public.validate_page_comment_scope()',
    'EXECUTE'
  ),
  'clients cannot invoke the page comment scope validator directly'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM unnest(ARRAY[
      'public.guard_comment_client_update()',
      'public.validate_comment_parent_scope()',
      'public.validate_page_comment_scope()',
      'public.advance_mfa_amr_epoch()',
      'public.lock_mfa_amr_epoch_delete()',
      'public.enforce_storage_object_quota()',
      'public.enforce_storage_insert_quota()',
      'public.track_storage_object_attribution()',
      'public.sync_project_storage_owner()',
      'public.retire_project_storage_owner()',
      'public.guard_project_identity()',
      'public.lock_project_member_auth_insert()',
      'public.lock_project_git_link_parent_insert()',
      'public.guard_auth_user_chat_storage_reuse()',
      'public.guard_notification_client_update()'
    ]) AS helper(signature)
    CROSS JOIN unnest(ARRAY['anon', 'authenticated', 'service_role'])
      AS caller(role_name)
    WHERE has_function_privilege(
      caller.role_name::name,
      helper.signature,
      'EXECUTE'
    )
  ),
  'trigger functions are not directly executable by API roles'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM unnest(ARRAY[
      'public.validate_comment_parent_scope()'::regprocedure,
      'public.validate_page_comment_scope()'::regprocedure,
      'public.advance_mfa_amr_epoch()'::regprocedure,
      'public.lock_mfa_amr_epoch_delete()'::regprocedure,
      'public.enforce_storage_object_quota()'::regprocedure,
      'public.enforce_storage_insert_quota()'::regprocedure,
      'public.track_storage_object_attribution()'::regprocedure,
      'public.sync_project_storage_owner()'::regprocedure,
      'public.retire_project_storage_owner()'::regprocedure,
      'public.guard_project_identity()'::regprocedure,
      'public.lock_project_member_auth_insert()'::regprocedure,
      'public.lock_project_git_link_parent_insert()'::regprocedure,
      'public.guard_auth_user_chat_storage_reuse()'::regprocedure
    ]) AS helper(oid)
    JOIN pg_proc AS procedure ON procedure.oid = helper.oid
    WHERE NOT procedure.prosecdef
       OR NOT COALESCE(
         procedure.proconfig @> ARRAY['search_path=""']::text[],
         false
       )
  ),
  'privileged trigger functions use an empty fixed search path'
);

INSERT INTO auth.users (id, email, raw_app_meta_data)
VALUES
  (
    '71000000-0000-4000-8000-000000000001',
    'release-owner@example.test',
    '{"mfa_enabled":true}'::jsonb
  ),
  (
    '71000000-0000-4000-8000-000000000002',
    'release-foreign@example.test',
    '{}'::jsonb
  ),
  (
    '71000000-0000-4000-8000-000000000003',
    'release-outsider@example.test',
    '{}'::jsonb
  ),
  (
    '71000000-0000-4000-8000-000000000004',
    'release-orphan-mfa@example.test',
    '{"mfa_enabled":true}'::jsonb
  ),
  (
    '71000000-0000-4000-8000-000000000005',
    'release-phone-mfa@example.test',
    '{}'::jsonb
  ),
  (
    '71000000-0000-4000-8000-000000000006',
    'release-webauthn-mfa@example.test',
    '{}'::jsonb
  );

SELECT set_config(
  'minddy_test.old_amr_epoch',
  pg_catalog.floor(EXTRACT(epoch FROM now() - interval '10 minutes'))::bigint::text,
  true
);
SELECT set_config(
  'minddy_test.new_amr_epoch',
  (
    current_setting('minddy_test.old_amr_epoch')::bigint + 1
  )::text,
  true
);
SELECT set_config(
  'minddy_test.old_amr',
  pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
    'method', 'totp',
    'timestamp', current_setting('minddy_test.old_amr_epoch')::bigint
  ))::text,
  true
);
SELECT set_config(
  'minddy_test.new_amr',
  pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
    'method', 'totp',
    'timestamp', current_setting('minddy_test.new_amr_epoch')::bigint
  ))::text,
  true
);

INSERT INTO auth.mfa_factors (
  id, user_id, factor_type, status, created_at, updated_at,
  last_challenged_at
)
VALUES
  (
    '71200000-0000-4000-8000-000000000001',
    '71000000-0000-4000-8000-000000000001',
    'totp',
    'verified',
    pg_catalog.to_timestamp(
      current_setting('minddy_test.old_amr_epoch')::double precision
    ),
    pg_catalog.to_timestamp(
      current_setting('minddy_test.old_amr_epoch')::double precision
    ),
    pg_catalog.to_timestamp(
      current_setting('minddy_test.old_amr_epoch')::double precision
    )
  ),
  (
    '71200000-0000-4000-8000-000000000002',
    '71000000-0000-4000-8000-000000000001',
    'totp',
    'unverified',
    pg_catalog.to_timestamp(
      current_setting('minddy_test.old_amr_epoch')::double precision - 600
    ),
    pg_catalog.to_timestamp(
      current_setting('minddy_test.old_amr_epoch')::double precision - 600
    ),
    NULL
  ),
  (
    '71200000-0000-4000-8000-000000000003',
    '71000000-0000-4000-8000-000000000005',
    'phone',
    'verified',
    pg_catalog.to_timestamp(
      current_setting('minddy_test.old_amr_epoch')::double precision
    ),
    pg_catalog.to_timestamp(
      current_setting('minddy_test.old_amr_epoch')::double precision
    ),
    pg_catalog.to_timestamp(
      current_setting('minddy_test.old_amr_epoch')::double precision - 1
    )
  ),
  (
    '71200000-0000-4000-8000-000000000004',
    '71000000-0000-4000-8000-000000000006',
    'webauthn',
    'verified',
    pg_catalog.to_timestamp(
      current_setting('minddy_test.old_amr_epoch')::double precision
    ),
    pg_catalog.to_timestamp(
      current_setting('minddy_test.old_amr_epoch')::double precision
    ),
    pg_catalog.to_timestamp(
      current_setting('minddy_test.old_amr_epoch')::double precision - 2
    )
  );

INSERT INTO auth.sessions (
  id, user_id, aal, factor_id, created_at, updated_at, refreshed_at
)
VALUES
  (
    '71100000-0000-4000-8000-000000000001',
    '71000000-0000-4000-8000-000000000001',
    'aal2',
    '71200000-0000-4000-8000-000000000001',
    now(),
    now(),
    now()
  ),
  (
    '71100000-0000-4000-8000-000000000002',
    '71000000-0000-4000-8000-000000000002',
    'aal1',
    NULL,
    now(),
    now(),
    now()
  ),
  (
    '71100000-0000-4000-8000-000000000003',
    '71000000-0000-4000-8000-000000000005',
    'aal2',
    '71200000-0000-4000-8000-000000000003',
    now(),
    now(),
    now()
  ),
  (
    '71100000-0000-4000-8000-000000000004',
    '71000000-0000-4000-8000-000000000006',
    'aal2',
    '71200000-0000-4000-8000-000000000004',
    now(),
    now(),
    now()
  );

INSERT INTO auth.mfa_amr_claims (
  id, session_id, authentication_method, created_at, updated_at
)
VALUES
  (
    '71300000-0000-4000-8000-000000000001',
    '71100000-0000-4000-8000-000000000001',
    'totp',
    pg_catalog.to_timestamp(
      current_setting('minddy_test.old_amr_epoch')::double precision
    ),
    pg_catalog.to_timestamp(
      current_setting('minddy_test.old_amr_epoch')::double precision
    )
  ),
  (
    '71300000-0000-4000-8000-000000000003',
    '71100000-0000-4000-8000-000000000003',
    'mfa/phone',
    pg_catalog.to_timestamp(
      current_setting('minddy_test.old_amr_epoch')::double precision
    ),
    pg_catalog.to_timestamp(
      current_setting('minddy_test.old_amr_epoch')::double precision
    )
  ),
  (
    '71300000-0000-4000-8000-000000000004',
    '71100000-0000-4000-8000-000000000004',
    'mfa/webauthn',
    pg_catalog.to_timestamp(
      current_setting('minddy_test.old_amr_epoch')::double precision
    ),
    pg_catalog.to_timestamp(
      current_setting('minddy_test.old_amr_epoch')::double precision
    )
  );

SELECT ok(
  (SELECT factor.status = 'unverified'
          AND factor.created_at < pg_catalog.to_timestamp(
            current_setting('minddy_test.old_amr_epoch')::double precision
          )
   FROM auth.mfa_factors AS factor
   WHERE factor.id = '71200000-0000-4000-8000-000000000002'),
  'the adversarial replacement factor was pre-created before the old AAL2 JWT'
);

INSERT INTO auth.refresh_tokens (
  token, user_id, revoked, session_id, created_at, updated_at
)
VALUES
  (
    'release-review-refresh-token',
    '71000000-0000-4000-8000-000000000001',
    false,
    '71100000-0000-4000-8000-000000000001',
    now(),
    now()
  ),
  (
    'release-foreign-refresh-token',
    '71000000-0000-4000-8000-000000000002',
    false,
    '71100000-0000-4000-8000-000000000002',
    now(),
    now()
  );

INSERT INTO public.projects (id, owner_id, name, key)
VALUES
  (
    '72000000-0000-4000-8000-000000000001',
    '71000000-0000-4000-8000-000000000001',
    'Release owner project',
    'RSO'
  ),
  (
    '72000000-0000-4000-8000-000000000002',
    '71000000-0000-4000-8000-000000000002',
    'Release foreign project',
    'RSF'
  );

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"71000000-0000-4000-8000-000000000001","aal":"aal1","session_id":"71100000-0000-4000-8000-000000000001","app_metadata":{}}',
  true
);

SELECT is(public.mfa_aal_ok(), false,
  'current MFA enrollment rejects an old pre-enrollment AAL1 token');
SELECT throws_ok(
  $$ SELECT public.enforce_mfa_aal() $$,
  '42501',
  'MFA challenge required',
  'the PostgREST hook fails closed for that old token'
);

SELECT set_config(
  'request.jwt.claims',
  pg_catalog.jsonb_build_object(
    'role', 'authenticated',
    'sub', '71000000-0000-4000-8000-000000000001',
    'aal', 'aal2',
    'session_id', '71100000-0000-4000-8000-000000000001',
    'amr', pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'method', 'totp',
      'timestamp', current_setting('minddy_test.old_amr_epoch')::bigint
    )),
    'app_metadata', '{}'::jsonb
  )::text,
  true
);
SELECT is(public.mfa_aal_ok(), true,
  'a verified AAL2 token passes for an enrolled account');
SELECT is(public.auth_session_is_current(), true,
  'the AAL2 token matches its current live session');
SELECT lives_ok(
  $$ SELECT public.enforce_mfa_aal() $$,
  'the global PostgREST hook accepts a live AAL2 session'
);

SELECT set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"71000000-0000-4000-8000-000000000002","aal":"aal1","session_id":"71100000-0000-4000-8000-000000000002","app_metadata":{}}',
  true
);
SELECT is(public.mfa_aal_ok(), true,
  'an account without MFA can use its AAL1 session');
SELECT is(public.auth_session_is_current(), true,
  'an AAL1 token matches its current live session');

SELECT set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"71000000-0000-4000-8000-000000000002","aal":"aal1"}',
  true
);
SELECT is(public.auth_session_is_current(), false,
  'a missing session claim fails closed');
SELECT throws_ok(
  $$ SELECT public.enforce_mfa_aal() $$,
  '42501',
  'Auth session is no longer active',
  'the global hook rejects a token without a session claim'
);

SELECT set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"71000000-0000-4000-8000-000000000002","aal":"aal1","session_id":"not-a-uuid"}',
  true
);
SELECT is(public.auth_session_is_current(), false,
  'a malformed session claim fails closed');
SELECT throws_ok(
  $$ SELECT public.enforce_mfa_aal() $$,
  '42501',
  'Auth session is no longer active',
  'the global hook rejects a malformed session claim'
);

RESET ROLE;
UPDATE auth.refresh_tokens
SET revoked = true
WHERE session_id = '71100000-0000-4000-8000-000000000002';
SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"71000000-0000-4000-8000-000000000002","aal":"aal1","session_id":"71100000-0000-4000-8000-000000000002"}',
  true
);
SELECT is(public.auth_session_is_current(), false,
  'a revoked refresh-backed session fails closed');
SELECT throws_ok(
  $$ SELECT public.enforce_mfa_aal() $$,
  '42501',
  'Auth session is no longer active',
  'the global hook rejects a revoked refresh-backed session'
);
RESET ROLE;
UPDATE auth.sessions
SET refresh_token_hmac_key = 'synthetic-v2-authority',
    refresh_token_counter = 1
WHERE id = '71100000-0000-4000-8000-000000000002';
SELECT is(
  public.is_auth_session_active(
    '71000000-0000-4000-8000-000000000002',
    '71100000-0000-4000-8000-000000000002'
  ),
  true,
  'a live GoTrue v2 refresh authority does not require a v1 token row'
);
UPDATE auth.sessions
SET refresh_token_hmac_key = NULL,
    refresh_token_counter = NULL
WHERE id = '71100000-0000-4000-8000-000000000002';
UPDATE auth.refresh_tokens
SET revoked = false
WHERE session_id = '71100000-0000-4000-8000-000000000002';

SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);
SELECT is(public.mfa_aal_ok(), true, 'anonymous public access remains available');
SELECT lives_ok(
  $$ SELECT public.enforce_mfa_aal() $$,
  'the PostgREST pre-request hook keeps anonymous public access available'
);

RESET ROLE;
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
SELECT is(public.mfa_aal_ok(), true, 'the service role retains server access');
SELECT is(
  public.mfa_aal_ok_for_user(
    '71000000-0000-4000-8000-000000000001',
    '71100000-0000-4000-8000-000000000001',
    'aal1',
    '[]'::jsonb
  ),
  false,
  'the server rejects a pre-enrollment AAL1 token from current account state'
);
SELECT is(
  public.mfa_aal_ok_for_user(
    '71000000-0000-4000-8000-000000000001',
    '71100000-0000-4000-8000-000000000001',
    'aal2',
    current_setting('minddy_test.old_amr')::jsonb
  ),
  true,
  'the server accepts AAL2 for an enrolled account'
);
SELECT is(
  public.mfa_aal_ok_for_user(
    '71000000-0000-4000-8000-000000000005',
    '71100000-0000-4000-8000-000000000003',
    'aal2',
    pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'method', 'mfa/phone',
      'timestamp', current_setting('minddy_test.old_amr_epoch')::bigint
    ))
  ),
  true,
  'the live MFA helper maps a phone factor to the official mfa/phone AMR'
);
SELECT is(
  public.mfa_aal_ok_for_user(
    '71000000-0000-4000-8000-000000000005',
    '71100000-0000-4000-8000-000000000003',
    'aal2',
    pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'method', 'phone',
      'timestamp', current_setting('minddy_test.old_amr_epoch')::bigint
    ))
  ),
  false,
  'the live MFA helper rejects a noncanonical phone AMR name'
);
SELECT is(
  public.mfa_aal_ok_for_user(
    '71000000-0000-4000-8000-000000000006',
    '71100000-0000-4000-8000-000000000004',
    'aal2',
    pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'method', 'mfa/webauthn',
      'timestamp', current_setting('minddy_test.old_amr_epoch')::bigint
    ))
  ),
  true,
  'the live MFA helper maps WebAuthn to the official mfa/webauthn AMR'
);
RESET ROLE;
INSERT INTO auth.mfa_amr_claims (
  id, session_id, authentication_method, created_at, updated_at
)
VALUES (
  '71300000-0000-4000-8000-000000000005',
  '71100000-0000-4000-8000-000000000003',
  'mfa/phone',
  pg_catalog.to_timestamp(
    current_setting('minddy_test.old_amr_epoch')::double precision
  ) + interval '500 milliseconds',
  pg_catalog.to_timestamp(
    current_setting('minddy_test.old_amr_epoch')::double precision
  ) + interval '500 milliseconds'
)
ON CONFLICT ON CONSTRAINT
  mfa_amr_claims_session_id_authentication_method_pkey
DO UPDATE SET updated_at = pg_catalog.to_timestamp(
  current_setting('minddy_test.old_amr_epoch')::double precision
) + interval '500 milliseconds';
SELECT is(
  (SELECT epoch
   FROM public.auth_mfa_amr_epochs
   WHERE session_id = '71100000-0000-4000-8000-000000000003'
     AND authentication_method = 'mfa/phone'),
  current_setting('minddy_test.new_amr_epoch')::bigint,
  'the GoTrue AMR upsert advances the durable epoch exactly once'
);
SET LOCAL ROLE service_role;
SELECT is(
  public.mfa_aal_ok_for_user(
    '71000000-0000-4000-8000-000000000005',
    '71100000-0000-4000-8000-000000000003',
    'aal2',
    pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'method', 'mfa/phone',
      'timestamp', current_setting('minddy_test.old_amr_epoch')::bigint
    ))
  ),
  false,
  'a superseded phone AMR epoch is rejected'
);
SELECT is(
  public.mfa_aal_ok_for_user(
    '71000000-0000-4000-8000-000000000005',
    '71100000-0000-4000-8000-000000000003',
    'aal2',
    pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'method', 'mfa/phone',
      'timestamp', current_setting('minddy_test.new_amr_epoch')::bigint
    ))
  ),
  true,
  'the current canonical phone AMR epoch is accepted'
);
SELECT is(
  public.mfa_aal_ok_for_user(
    '71000000-0000-4000-8000-000000000002',
    '71100000-0000-4000-8000-000000000002',
    'aal1',
    '[]'::jsonb
  ),
  true,
  'the server accepts AAL1 for a current account without MFA'
);
SELECT is(
  public.mfa_aal_ok_for_user(
    '71000000-0000-4000-8000-000000000002',
    '71100000-0000-4000-8000-000000000002',
    'aal2',
    '[]'::jsonb
  ),
  false,
  'the server rejects stale AAL2 after the last MFA factor is removed'
);
SELECT is(
  public.mfa_aal_ok_for_user(
    '71000000-0000-4000-8000-000000000004',
    NULL,
    'aal1',
    '[]'::jsonb
  ),
  false,
  'an orphaned MFA flag fails closed for AAL1'
);
SELECT is(
  public.mfa_aal_ok_for_user(
    '71000000-0000-4000-8000-000000000004',
    NULL,
    'aal2',
    current_setting('minddy_test.old_amr')::jsonb
  ),
  false,
  'an orphaned MFA flag fails closed for AAL2'
);
SELECT is(
  public.mfa_aal_ok_for_user(
    '71000000-0000-4000-8000-000000000099',
    NULL,
    'aal2',
    current_setting('minddy_test.old_amr')::jsonb
  ),
  false,
  'the live MFA helper fails closed for a missing account'
);
SELECT is(
  public.auth_authorization_state(
    '71000000-0000-4000-8000-000000000001',
    '71100000-0000-4000-8000-000000000001',
    'aal2',
    current_setting('minddy_test.old_amr')::jsonb
  ) ->> 'sessionActive',
  'true',
  'the combined authorization helper reports the active session'
);
SELECT is(
  public.auth_authorization_state(
    '71000000-0000-4000-8000-000000000001',
    '71100000-0000-4000-8000-000000000001',
    'aal2',
    current_setting('minddy_test.old_amr')::jsonb
  ) ->> 'mfaAllowed',
  'true',
  'the combined authorization helper reports the current MFA decision'
);
RESET ROLE;
SELECT ok(
  EXISTS (
    SELECT 1
    FROM public.auth_mfa_amr_epochs
    WHERE session_id = '71100000-0000-4000-8000-000000000004'
      AND authentication_method = 'mfa/webauthn'
  ),
  'the WebAuthn fixture has a durable session epoch'
);
DELETE FROM auth.sessions
WHERE id = '71100000-0000-4000-8000-000000000004';
SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM public.auth_mfa_amr_epochs
    WHERE session_id = '71100000-0000-4000-8000-000000000004'
      AND authentication_method = 'mfa/webauthn'
  ),
  'deleting an Auth session cascades its durable MFA epochs'
);
UPDATE auth.users
SET raw_app_meta_data = '{}'::jsonb
WHERE id = '71000000-0000-4000-8000-000000000001';
DELETE FROM auth.mfa_factors
WHERE id = '71200000-0000-4000-8000-000000000001';
DELETE FROM auth.mfa_amr_claims
WHERE session_id = '71100000-0000-4000-8000-000000000001'
  AND authentication_method = 'totp';
SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM auth.mfa_amr_claims
    WHERE session_id = '71100000-0000-4000-8000-000000000001'
      AND authentication_method = 'totp'
  ),
  'GoTrue factor removal deletes the session AMR claim'
);
SELECT is(
  (SELECT epoch
   FROM public.auth_mfa_amr_epochs
   WHERE session_id = '71100000-0000-4000-8000-000000000001'
     AND authentication_method = 'totp'),
  current_setting('minddy_test.old_amr_epoch')::bigint,
  'the monotone epoch survives deletion of the Auth AMR claim'
);
SELECT is(
  public.mfa_aal_ok_for_user(
    '71000000-0000-4000-8000-000000000001',
    '71100000-0000-4000-8000-000000000001',
    'aal2',
    current_setting('minddy_test.old_amr')::jsonb
  ),
  false,
  'removing the last verified factor invalidates a stale AAL2 token'
);
UPDATE auth.mfa_factors
SET status = 'verified',
    updated_at = pg_catalog.to_timestamp(
      current_setting('minddy_test.new_amr_epoch')::double precision
    ),
    last_challenged_at = pg_catalog.to_timestamp(
      current_setting('minddy_test.new_amr_epoch')::double precision
    )
WHERE id = '71200000-0000-4000-8000-000000000002';
UPDATE auth.sessions
SET factor_id = '71200000-0000-4000-8000-000000000002',
    aal = 'aal2'
WHERE id = '71100000-0000-4000-8000-000000000001';
INSERT INTO auth.mfa_amr_claims (
  id, session_id, authentication_method, created_at, updated_at
)
VALUES (
  '71300000-0000-4000-8000-000000000002',
  '71100000-0000-4000-8000-000000000001',
  'totp',
  pg_catalog.to_timestamp(
    current_setting('minddy_test.old_amr_epoch')::double precision
  ) + interval '500 milliseconds',
  pg_catalog.to_timestamp(
    current_setting('minddy_test.old_amr_epoch')::double precision
  ) + interval '500 milliseconds'
);
SELECT is(
  (SELECT pg_catalog.floor(EXTRACT(epoch FROM updated_at))::bigint
   FROM auth.mfa_amr_claims
   WHERE session_id = '71100000-0000-4000-8000-000000000001'
     AND authentication_method = 'totp'),
  current_setting('minddy_test.new_amr_epoch')::bigint,
  'a same-second DELETE then INSERT gets a distinct signed AMR epoch'
);
UPDATE auth.users
SET raw_app_meta_data = '{"mfa_enabled":true}'::jsonb
WHERE id = '71000000-0000-4000-8000-000000000001';
SELECT is(
  public.mfa_aal_ok_for_user(
    '71000000-0000-4000-8000-000000000001',
    '71100000-0000-4000-8000-000000000001',
    'aal2',
    current_setting('minddy_test.old_amr')::jsonb
  ),
  false,
  'a replacement factor cannot reactivate an old AAL2 AMR epoch'
);
SELECT is(
  public.mfa_aal_ok_for_user(
    '71000000-0000-4000-8000-000000000001',
    '71100000-0000-4000-8000-000000000001',
    'aal2',
    current_setting('minddy_test.new_amr')::jsonb
  ),
  true,
  'the access token minted for the replacement factor is accepted'
);
SELECT is(
  public.auth_authorization_state(
    '71000000-0000-4000-8000-000000000001',
    '71100000-0000-4000-8000-000000000001',
    'aal2',
    current_setting('minddy_test.old_amr')::jsonb
  ) ->> 'mfaAllowed',
  'false',
  'the combined application boundary rejects the replaced factor epoch'
);
SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  pg_catalog.jsonb_build_object(
    'role', 'authenticated',
    'sub', '71000000-0000-4000-8000-000000000001',
    'aal', 'aal2',
    'session_id', '71100000-0000-4000-8000-000000000001',
    'amr', current_setting('minddy_test.old_amr')::jsonb
  )::text,
  true
);
SELECT is(public.auth_session_is_current(), true,
  'the churn fixture keeps the same live AAL2 session identifier');
SELECT is(public.mfa_aal_ok(), false,
  'the signed old AAL2 AMR epoch is rejected after factor replacement');
SELECT throws_ok(
  $$ SELECT public.enforce_mfa_aal() $$,
  '42501',
  'MFA challenge required',
  'the global PostgREST hook rejects the replaced factor epoch'
);
SELECT set_config(
  'request.jwt.claims',
  pg_catalog.jsonb_build_object(
    'role', 'authenticated',
    'sub', '71000000-0000-4000-8000-000000000001',
    'aal', 'aal2',
    'session_id', '71100000-0000-4000-8000-000000000001',
    'amr', current_setting('minddy_test.new_amr')::jsonb
  )::text,
  true
);
SELECT is(public.mfa_aal_ok(), true,
  'the signed replacement-factor AAL2 epoch passes the global boundary');
RESET ROLE;
SELECT is(
  public.is_auth_session_active(
    '71000000-0000-4000-8000-000000000001',
    '71100000-0000-4000-8000-000000000001'
  ),
  true,
  'the server recognizes a current session belonging to the user'
);
UPDATE auth.sessions
SET created_at = now() - interval '721 hours',
    refreshed_at = now()
WHERE id = '71100000-0000-4000-8000-000000000001';
SELECT is(
  public.is_auth_session_active(
    '71000000-0000-4000-8000-000000000001',
    '71100000-0000-4000-8000-000000000001'
  ),
  false,
  'the live session helper enforces the configured 720-hour timebox'
);
UPDATE auth.sessions
SET created_at = now() - interval '200 hours',
    refreshed_at = now() - interval '169 hours'
WHERE id = '71100000-0000-4000-8000-000000000001';
SELECT is(
  public.is_auth_session_active(
    '71000000-0000-4000-8000-000000000001',
    '71100000-0000-4000-8000-000000000001'
  ),
  false,
  'the live session helper enforces the configured 168-hour inactivity limit'
);
UPDATE auth.sessions
SET refreshed_at = NULL
WHERE id = '71100000-0000-4000-8000-000000000001';
UPDATE auth.refresh_tokens
SET updated_at = now() - interval '169 hours'
WHERE session_id = '71100000-0000-4000-8000-000000000001';
SELECT is(
  public.is_auth_session_active(
    '71000000-0000-4000-8000-000000000001',
    '71100000-0000-4000-8000-000000000001'
  ),
  false,
  'legacy sessions use the latest active refresh timestamp for inactivity'
);
UPDATE auth.refresh_tokens
SET updated_at = now() - interval '1 hour'
WHERE session_id = '71100000-0000-4000-8000-000000000001';
SELECT is(
  public.is_auth_session_active(
    '71000000-0000-4000-8000-000000000001',
    '71100000-0000-4000-8000-000000000001'
  ),
  true,
  'recent active refresh authority keeps a legacy session current'
);
UPDATE auth.sessions
SET created_at = now(),
    refreshed_at = now()
WHERE id = '71100000-0000-4000-8000-000000000001';
SELECT is(
  public.is_auth_session_active(
    '71000000-0000-4000-8000-000000000002',
    '71100000-0000-4000-8000-000000000001'
  ),
  false,
  'a session identifier cannot authorize a different user'
);
UPDATE auth.refresh_tokens
SET revoked = true
WHERE session_id = '71100000-0000-4000-8000-000000000001';
SELECT is(
  public.is_auth_session_active(
    '71000000-0000-4000-8000-000000000001',
    '71100000-0000-4000-8000-000000000001'
  ),
  false,
  'a session with no current refresh authority is inactive immediately'
);
UPDATE auth.refresh_tokens
SET revoked = false
WHERE session_id = '71100000-0000-4000-8000-000000000001';
SELECT is(
  public.project_storage_quota_allows(
    '72000000-0000-4000-8000-000000000001',
    1024
  ),
  true,
  'a small pending service upload fits the owner quota'
);
SELECT is(
  public.project_storage_quota_allows(
    '72000000-0000-4000-8000-000000000001',
    1073741825
  ),
  false,
  'the complete pending service upload cannot exceed the owner quota'
);
SELECT is(
  public.project_storage_quota_allows(
    '72000000-0000-4000-8000-000000000001',
    -1
  ),
  false,
  'negative pending byte counts fail closed'
);

SELECT has_trigger(
  'public',
  'page_files',
  'page_files_enforce_storage_quota',
  'page file metadata serializes exact quota enforcement'
);

SELECT ok(
  (SELECT pg_catalog.pg_get_triggerdef(trigger.oid) LIKE
      '%BEFORE INSERT OR UPDATE OF page_id, project_id, storage_path, size_bytes%'
   FROM pg_trigger AS trigger
   WHERE trigger.tgrelid = 'public.page_files'::regclass
     AND trigger.tgname = 'page_files_enforce_storage_quota'
     AND NOT trigger.tgisinternal),
  'page file scope and physical metadata remain guarded after insertion'
);

SELECT ok(
  (SELECT pg_catalog.pg_get_triggerdef(trigger.oid) LIKE
      '%BEFORE INSERT OR UPDATE OF project_id, storage_path, size_bytes%'
   FROM pg_trigger AS trigger
   WHERE trigger.tgrelid = 'public.attachments'::regclass
     AND trigger.tgname = 'attachments_enforce_storage_quota'
     AND NOT trigger.tgisinternal),
  'attachment scope and physical metadata remain guarded after insertion'
);

SELECT has_trigger(
  'storage',
  'objects',
  'objects_enforce_storage_quota',
  'physical Storage objects enforce the account quota'
);

RESET ROLE;
UPDATE public.plan_storage_quotas SET bytes = 10 WHERE plan_id = 'free';
INSERT INTO public.pages (id, project_id, position, created_by)
VALUES
  (
    '72100000-0000-4000-8000-000000000001',
    '72000000-0000-4000-8000-000000000001',
    '0000000000V',
    '71000000-0000-4000-8000-000000000001'
  ),
  (
    '72100000-0000-4000-8000-000000000002',
    '72000000-0000-4000-8000-000000000002',
    '0000000000V',
    '71000000-0000-4000-8000-000000000002'
  ),
  (
    '72100000-0000-4000-8000-000000000003',
    '72000000-0000-4000-8000-000000000001',
    '0000000000W',
    '71000000-0000-4000-8000-000000000001'
  );
INSERT INTO storage.buckets (id, name, public)
VALUES ('attachments', 'attachments', false)
ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.objects (bucket_id, name, metadata, owner_id)
VALUES (
  'attachments',
  'projects/72000000-0000-4000-8000-000000000001/pages/quota/first.bin',
  '{"size":6}'::jsonb,
  '71000000-0000-4000-8000-000000000001'
);

SELECT throws_ok(
  $$ INSERT INTO storage.objects (bucket_id, name, metadata, owner_id)
     VALUES (
       'attachments',
       'projects/72000000-0000-4000-8000-000000000001/pages/quota/second.bin',
       '{"size":5}'::jsonb,
       '71000000-0000-4000-8000-000000000001'
     ) $$,
  'P0001',
  'storage_quota_exceeded',
  'the physical Storage guard rejects bytes beyond the exact account quota'
);

SELECT throws_ok(
  $$ UPDATE storage.objects
     SET name = 'projects/72000000-0000-4000-8000-000000000001/pages/quota/moved.bin'
     WHERE bucket_id = 'attachments'
       AND name = 'projects/72000000-0000-4000-8000-000000000001/pages/quota/first.bin' $$,
  '22023',
  'storage_object_scope_immutable',
  'an existing object cannot move between quota scopes'
);

SELECT throws_ok(
  $$ UPDATE storage.objects
     SET metadata = '{}'::jsonb
     WHERE bucket_id = 'attachments'
       AND name = 'projects/72000000-0000-4000-8000-000000000001/pages/quota/first.bin' $$,
  '22023',
  'storage_object_size_invalid',
  'an existing object cannot remove its authoritative physical size'
);

SELECT throws_ok(
  $$ UPDATE storage.objects
     SET metadata = '{"size":11}'::jsonb
     WHERE bucket_id = 'attachments'
       AND name = 'projects/72000000-0000-4000-8000-000000000001/pages/quota/first.bin' $$,
  'P0001',
  'storage_quota_exceeded',
  'a metadata size increase cannot move an existing object beyond quota'
);

SELECT throws_ok(
  $$ INSERT INTO storage.objects (bucket_id, name, metadata, owner_id)
     VALUES (
       'attachments',
       'projects/72000000-0000-4000-8000-000000000001/pages/quota/invalid.bin',
       '{"size":"invalid"}'::jsonb,
       '71000000-0000-4000-8000-000000000001'
     ) $$,
  '22023',
  'storage_object_size_invalid',
  'a non-numeric physical Storage size fails closed'
);

SELECT throws_ok(
  $$ INSERT INTO storage.objects (bucket_id, name, metadata, owner_id)
     VALUES (
       'attachments',
       'projects/72000000-0000-4000-8000-000000000001/pages/quota/overflow.bin',
       '{"size":"999999999999999999999999999999"}'::jsonb,
       '71000000-0000-4000-8000-000000000001'
     ) $$,
  '22023',
  'storage_object_size_invalid',
  'an overflowing physical Storage size fails closed'
);

SELECT throws_ok(
  $$ INSERT INTO storage.objects (bucket_id, name, metadata, owner_id)
     VALUES (
       'attachments',
       'unscoped/72000000-0000-4000-8000-000000000001/invalid.bin',
       '{"size":1}'::jsonb,
       '71000000-0000-4000-8000-000000000001'
     ) $$,
  '22023',
  'storage_object_scope_mismatch',
  'an unrecognized physical Storage namespace fails closed'
);

INSERT INTO auth.users (id, email, raw_app_meta_data)
VALUES (
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'release-chat-canonical@example.test',
  '{}'::jsonb
);
SELECT throws_ok(
  $$ INSERT INTO storage.objects (bucket_id, name, metadata, owner_id)
     VALUES (
       'attachments',
       'chat/AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA/uppercase.bin',
       '{"size":1}'::jsonb,
       'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
     ) $$,
  '22023',
  'storage_object_scope_mismatch',
  'chat object UUID segments must use their canonical lowercase form'
);

INSERT INTO auth.users (id, email, raw_app_meta_data)
VALUES (
  '71000000-0000-4000-8000-000000000009',
  'release-chat-reuse@example.test',
  '{}'::jsonb
);
INSERT INTO storage.objects (bucket_id, name, metadata, owner_id)
VALUES (
  'attachments',
  'chat/71000000-0000-4000-8000-000000000009/residual.bin',
  '{"size":1}'::jsonb,
  '71000000-0000-4000-8000-000000000009'
);
DELETE FROM auth.users
WHERE id = '71000000-0000-4000-8000-000000000009';
SELECT throws_ok(
  $$ INSERT INTO auth.users (id, email, raw_app_meta_data)
     VALUES (
       '71000000-0000-4000-8000-000000000009',
       'release-chat-reuse-replacement@example.test',
       '{}'::jsonb
     ) $$,
  '23505',
  'storage_chat_user_id_reuse',
  'an Auth UUID cannot be reused while former chat objects remain'
);

INSERT INTO public.page_files (
  id, page_id, project_id, storage_path, file_name, size_bytes, created_by
)
VALUES (
  '72200000-0000-4000-8000-000000000001',
  '72100000-0000-4000-8000-000000000001',
  '72000000-0000-4000-8000-000000000001',
  'projects/72000000-0000-4000-8000-000000000001/pages/quota/first.bin',
  'first.bin',
  6,
  '71000000-0000-4000-8000-000000000001'
);

SELECT is(
  public.account_storage_bytes('71000000-0000-4000-8000-000000000001'),
  6::bigint,
  'metadata registration does not count a physical object twice'
);

SELECT throws_ok(
  $$ UPDATE public.page_files
     SET size_bytes = 1
     WHERE id = '72200000-0000-4000-8000-000000000001' $$,
  '22023',
  'storage_object_size_mismatch',
  'page file updates cannot understate the physical object size'
);

SELECT throws_ok(
  $$ UPDATE public.page_files
     SET page_id = '72100000-0000-4000-8000-000000000002'
     WHERE id = '72200000-0000-4000-8000-000000000001' $$,
  '22023',
  'storage_object_scope_mismatch',
  'page file updates cannot attach metadata to a page in another project'
);

SELECT throws_ok(
  $$ INSERT INTO public.page_files (
       id, page_id, project_id, storage_path, file_name, size_bytes, created_by
     ) VALUES (
       '72200000-0000-4000-8000-000000000003',
       '72100000-0000-4000-8000-000000000001',
       '72000000-0000-4000-8000-000000000001',
       'projects/72000000-0000-4000-8000-000000000001/pages/quota/first.bin',
       'first-understated.bin',
       1,
       '71000000-0000-4000-8000-000000000001'
     ) $$,
  '22023',
  'storage_object_size_mismatch',
  'metadata cannot understate the size recorded by Storage'
);
SELECT throws_ok(
  $$ INSERT INTO public.page_files (
       id, page_id, project_id, storage_path, file_name, size_bytes, created_by
     ) VALUES (
       '72200000-0000-4000-8000-000000000004',
       '72100000-0000-4000-8000-000000000001',
       '72000000-0000-4000-8000-000000000001',
       'projects/72000000-0000-4000-8000-000000000001/pages/quota/missing.bin',
       'missing.bin',
       1,
       '71000000-0000-4000-8000-000000000001'
     ) $$,
  '22023',
  'storage_object_size_mismatch',
  'metadata cannot reserve a missing object for a later quota bypass'
);

INSERT INTO auth.users (id, email, raw_app_meta_data)
VALUES
  (
    '71000000-0000-4000-8000-000000000007',
    'release-storage-owner@example.test',
    '{}'::jsonb
  ),
  (
    '71000000-0000-4000-8000-000000000008',
    'release-storage-transferee@example.test',
    '{}'::jsonb
  );

INSERT INTO public.projects (id, owner_id, name, key)
VALUES
  (
    '72000000-0000-4000-8000-000000000003',
    '71000000-0000-4000-8000-000000000007',
    'Storage orphan source',
    'SOS'
  ),
  (
    '72000000-0000-4000-8000-000000000004',
    '71000000-0000-4000-8000-000000000007',
    'Storage quota continuation',
    'SQC'
  ),
  (
    '72000000-0000-4000-8000-000000000005',
    '71000000-0000-4000-8000-000000000007',
    'Storage empty deletion',
    'SED'
  ),
  (
    '72000000-0000-4000-8000-000000000006',
    '71000000-0000-4000-8000-000000000007',
    'Storage ownership transfer',
    'SOT'
  );

INSERT INTO storage.objects (bucket_id, name, metadata, owner_id)
VALUES (
  'attachments',
  'projects/72000000-0000-4000-8000-000000000003/direct/first.bin',
  '{"size":6}'::jsonb,
  '71000000-0000-4000-8000-000000000007'
);
DELETE FROM public.projects
WHERE id = '72000000-0000-4000-8000-000000000003';

SELECT is(
  public.account_storage_bytes('71000000-0000-4000-8000-000000000007'),
  6::bigint,
  'a direct object remains charged after its project is hard deleted'
);
SELECT is(
  (SELECT object_count
   FROM public.project_storage_owners
   WHERE project_id = '72000000-0000-4000-8000-000000000003'),
  1::bigint,
  'hard deletion preserves attribution while a project object remains'
);

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"71000000-0000-4000-8000-000000000002","aal":"aal1","session_id":"71100000-0000-4000-8000-000000000002"}',
  true
);
SELECT throws_ok(
  $$ UPDATE public.projects
     SET id = '72000000-0000-4000-8000-000000000003'
     WHERE id = '72000000-0000-4000-8000-000000000002' $$,
  '22023',
  'project_id_immutable',
  'an authenticated owner cannot reuse a deleted project Storage namespace'
);
RESET ROLE;

SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
SELECT throws_ok(
  $$ UPDATE public.projects
     SET id = '72000000-0000-4000-8000-000000000003'
     WHERE id = '72000000-0000-4000-8000-000000000002' $$,
  '22023',
  'project_id_immutable',
  'the service role cannot move a project into an existing Storage namespace'
);
RESET ROLE;

SELECT is(
  (SELECT id
   FROM public.projects
   WHERE id = '72000000-0000-4000-8000-000000000002'),
  '72000000-0000-4000-8000-000000000002'::uuid,
  'rejected identifier changes leave the attacker project unchanged'
);
SELECT is(
  (SELECT owner_id
   FROM public.project_storage_owners
   WHERE project_id = '72000000-0000-4000-8000-000000000002'),
  '71000000-0000-4000-8000-000000000002'::uuid,
  'rejected identifier changes leave attacker attribution unchanged'
);
SELECT is(
  (SELECT owner_id
   FROM public.project_storage_owners
   WHERE project_id = '72000000-0000-4000-8000-000000000003'),
  '71000000-0000-4000-8000-000000000007'::uuid,
  'rejected identifier changes leave victim attribution unchanged'
);

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"71000000-0000-4000-8000-000000000002","aal":"aal1","session_id":"71100000-0000-4000-8000-000000000002"}',
  true
);
SELECT throws_ok(
  $$ INSERT INTO storage.objects (bucket_id, name, metadata, owner_id)
     VALUES (
       'attachments',
       'projects/72000000-0000-4000-8000-000000000003/direct/collision.bin',
       '{"size":1}'::jsonb,
       '71000000-0000-4000-8000-000000000002'
     ) $$,
  '42501',
  NULL,
  'the attacker cannot upload through the rejected namespace collision'
);
RESET ROLE;
SELECT is(
  public.account_storage_bytes('71000000-0000-4000-8000-000000000007'),
  6::bigint,
  'the rejected namespace collision cannot charge Storage to the victim'
);
SELECT is(
  (SELECT count(*)::integer
   FROM storage.objects
   WHERE bucket_id = 'attachments'
     AND name =
       'projects/72000000-0000-4000-8000-000000000003/direct/collision.bin'),
  0,
  'the rejected namespace collision leaves no physical metadata row'
);

INSERT INTO storage.objects (bucket_id, name, metadata, owner_id)
VALUES (
  'attachments',
  'projects/72000000-0000-4000-8000-000000000003/direct/after-delete.bin',
  '{"size":3}'::jsonb,
  NULL
);
SELECT is(
  public.account_storage_bytes('71000000-0000-4000-8000-000000000007'),
  9::bigint,
  'a service-owned write below a deleted prefix remains attributed'
);

SELECT throws_ok(
  $$ INSERT INTO storage.objects (bucket_id, name, metadata, owner_id)
     VALUES (
       'attachments',
       'projects/72000000-0000-4000-8000-000000000004/direct/new.bin',
       '{"size":2}'::jsonb,
       '71000000-0000-4000-8000-000000000007'
     ) $$,
  'P0001',
  'storage_quota_exceeded',
  'an orphaned prefix still consumes quota for uploads to a new project'
);

SELECT set_config('storage.allow_delete_query', 'true', true);
DELETE FROM storage.objects
WHERE bucket_id = 'attachments'
  AND split_part(name, '/', 2) = '72000000-0000-4000-8000-000000000003';
SELECT is(
  (SELECT count(*)::integer
   FROM public.project_storage_owners
   WHERE project_id = '72000000-0000-4000-8000-000000000003'),
  0,
  'the final orphan object deletion removes its durable attribution'
);
SELECT is(
  public.account_storage_bytes('71000000-0000-4000-8000-000000000007'),
  0::bigint,
  'orphan cleanup releases the account quota'
);

DELETE FROM public.projects
WHERE id = '72000000-0000-4000-8000-000000000005';
SELECT is(
  (SELECT count(*)::integer
   FROM public.project_storage_owners
   WHERE project_id = '72000000-0000-4000-8000-000000000005'),
  0,
  'hard deletion immediately removes a zero-object attribution'
);

INSERT INTO storage.objects (bucket_id, name, metadata, owner_id)
VALUES (
  'attachments',
  'projects/72000000-0000-4000-8000-000000000006/direct/transferred.bin',
  '{"size":4}'::jsonb,
  '71000000-0000-4000-8000-000000000007'
);
UPDATE public.projects
SET owner_id = '71000000-0000-4000-8000-000000000008'
WHERE id = '72000000-0000-4000-8000-000000000006';
SELECT is(
  public.account_storage_bytes('71000000-0000-4000-8000-000000000007'),
  0::bigint,
  'ownership transfer stops charging project objects to the former owner'
);
SELECT is(
  public.account_storage_bytes('71000000-0000-4000-8000-000000000008'),
  4::bigint,
  'ownership transfer charges every existing object to the new owner'
);
SELECT is(
  (SELECT owner_id
   FROM public.project_storage_owners
   WHERE project_id = '72000000-0000-4000-8000-000000000006'),
  '71000000-0000-4000-8000-000000000008'::uuid,
  'the durable attribution records the transferred owner'
);

INSERT INTO public.projects (id, owner_id, name, key)
VALUES (
  '72000000-0000-4000-8000-000000000007',
  '71000000-0000-4000-8000-000000000007',
  'Storage rejected transfer',
  'SRT'
);
INSERT INTO storage.objects (bucket_id, name, metadata, owner_id)
VALUES (
  'attachments',
  'projects/72000000-0000-4000-8000-000000000007/direct/rejected-transfer.bin',
  '{"size":7}'::jsonb,
  '71000000-0000-4000-8000-000000000007'
);
SELECT throws_ok(
  $$ UPDATE public.projects
     SET owner_id = '71000000-0000-4000-8000-000000000008'
     WHERE id = '72000000-0000-4000-8000-000000000007' $$,
  'P0001',
  'storage_quota_exceeded',
  'ownership transfer fails when existing objects exceed the new owner quota'
);
SELECT is(
  (SELECT owner_id
   FROM public.projects
   WHERE id = '72000000-0000-4000-8000-000000000007'),
  '71000000-0000-4000-8000-000000000007'::uuid,
  'a rejected transfer rolls back the authoritative project owner'
);
SELECT is(
  (SELECT owner_id
   FROM public.project_storage_owners
   WHERE project_id = '72000000-0000-4000-8000-000000000007'),
  '71000000-0000-4000-8000-000000000007'::uuid,
  'a rejected transfer rolls back durable Storage attribution'
);

RESET ROLE;
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);

INSERT INTO public.project_members (project_id, user_id, role, added_by)
VALUES (
  '72000000-0000-4000-8000-000000000002',
  '71000000-0000-4000-8000-000000000001',
  'member',
  '71000000-0000-4000-8000-000000000002'
);

INSERT INTO public.issues (id, project_id, number, title, created_by)
VALUES
  (
    '72700000-0000-4000-8000-000000000001',
    '72000000-0000-4000-8000-000000000001',
    101,
    'Comment source issue',
    '71000000-0000-4000-8000-000000000001'
  ),
  (
    '72700000-0000-4000-8000-000000000002',
    '72000000-0000-4000-8000-000000000002',
    102,
    'Foreign cascade target issue',
    '71000000-0000-4000-8000-000000000002'
  );

INSERT INTO public.comments (id, issue_id, author_id, body, parent_id)
VALUES
  (
    '72800000-0000-4000-8000-000000000001',
    '72700000-0000-4000-8000-000000000001',
    '71000000-0000-4000-8000-000000000001',
    'Owned thread root',
    NULL
  ),
  (
    '72800000-0000-4000-8000-000000000003',
    '72700000-0000-4000-8000-000000000002',
    '71000000-0000-4000-8000-000000000002',
    'Foreign cascade target',
    NULL
  ),
  (
    '72800000-0000-4000-8000-000000000004',
    '72700000-0000-4000-8000-000000000001',
    '71000000-0000-4000-8000-000000000001',
    'Assistant-authored body',
    NULL
  );
INSERT INTO public.comments (id, issue_id, author_id, body, parent_id)
VALUES (
  '72800000-0000-4000-8000-000000000002',
  '72700000-0000-4000-8000-000000000001',
  '71000000-0000-4000-8000-000000000002',
  'Thread reply that must survive',
  '72800000-0000-4000-8000-000000000001'
);
UPDATE public.comments
SET via_assistant = true, assistant_status = 'working'
WHERE id = '72800000-0000-4000-8000-000000000004';

INSERT INTO public.page_comments (
  id, page_id, project_id, author_id, body, parent_id, via_assistant,
  assistant_status
)
VALUES
  (
    '72900000-0000-4000-8000-000000000001',
    '72100000-0000-4000-8000-000000000001',
    '72000000-0000-4000-8000-000000000001',
    '71000000-0000-4000-8000-000000000001',
    'Owned page thread root',
    NULL,
    false,
    NULL
  ),
  (
    '72900000-0000-4000-8000-000000000003',
    '72100000-0000-4000-8000-000000000002',
    '72000000-0000-4000-8000-000000000002',
    '71000000-0000-4000-8000-000000000002',
    'Foreign page cascade target',
    NULL,
    false,
    NULL
  ),
  (
    '72900000-0000-4000-8000-000000000004',
    '72100000-0000-4000-8000-000000000001',
    '72000000-0000-4000-8000-000000000001',
    '71000000-0000-4000-8000-000000000001',
    'Assistant-authored page body',
    NULL,
    true,
    'working'
  );
INSERT INTO public.page_comments (
  id, page_id, project_id, author_id, body, parent_id, via_assistant,
  assistant_status
)
VALUES (
  '72900000-0000-4000-8000-000000000002',
  '72100000-0000-4000-8000-000000000001',
  '72000000-0000-4000-8000-000000000001',
  '71000000-0000-4000-8000-000000000002',
  'Page reply that must survive',
  '72900000-0000-4000-8000-000000000001',
  false,
  NULL
);

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"71000000-0000-4000-8000-000000000001","aal":"aal2"}',
  true
);
SELECT lives_ok(
  $$ UPDATE public.comments
     SET body = 'Legitimate edited body'
     WHERE id = '72800000-0000-4000-8000-000000000001' $$,
  'an author can still edit the comment body'
);
SELECT lives_ok(
  $$ UPDATE public.page_comments
     SET body = 'Legitimate edited page body'
     WHERE id = '72900000-0000-4000-8000-000000000001' $$,
  'an author can still edit the page comment body'
);
SELECT throws_ok(
  $$ UPDATE public.comments
     SET parent_id = '72800000-0000-4000-8000-000000000003'
     WHERE id = '72800000-0000-4000-8000-000000000001' $$,
  '42501',
  'Comment scope and identity fields are immutable',
  'an author cannot reparent a thread into a foreign project cascade'
);
SELECT throws_ok(
  $$ UPDATE public.page_comments
     SET parent_id = '72900000-0000-4000-8000-000000000003'
     WHERE id = '72900000-0000-4000-8000-000000000001' $$,
  '42501',
  'Comment scope and identity fields are immutable',
  'an author cannot reparent a page thread into a foreign project cascade'
);
SELECT throws_ok(
  $$ INSERT INTO public.comments (
       id, issue_id, author_id, body, parent_id
     ) VALUES (
       '72800000-0000-4000-8000-000000000005',
       '72700000-0000-4000-8000-000000000002',
       '71000000-0000-4000-8000-000000000001',
       'Cross-project hybrid branch',
       '72800000-0000-4000-8000-000000000001'
     ) $$,
  '23514',
  'comment_parent_scope_mismatch',
  'a member of both projects cannot insert a hybrid comment branch'
);
SELECT throws_ok(
  $$ INSERT INTO public.page_comments (
       id, page_id, project_id, author_id, body
     ) VALUES (
       '72900000-0000-4000-8000-000000000005',
       '72100000-0000-4000-8000-000000000002',
       '72000000-0000-4000-8000-000000000001',
       '71000000-0000-4000-8000-000000000001',
       'Mismatched page and project'
     ) $$,
  '23514',
  'page_comment_scope_mismatch',
  'a member of both projects cannot mix page and project identity'
);
SELECT throws_ok(
  $$ INSERT INTO public.page_comments (
       id, page_id, project_id, author_id, body, parent_id
     ) VALUES (
       '72900000-0000-4000-8000-000000000006',
       '72100000-0000-4000-8000-000000000002',
       '72000000-0000-4000-8000-000000000002',
       '71000000-0000-4000-8000-000000000001',
       'Cross-page hybrid branch',
       '72900000-0000-4000-8000-000000000001'
     ) $$,
  '23514',
  'page_comment_parent_scope_mismatch',
  'a member of both projects cannot insert a cross-page parent link'
);
SELECT throws_ok(
  $$ INSERT INTO public.comments (
       id, issue_id, author_id, body, parent_id
     ) VALUES (
       '72800000-0000-4000-8000-000000000006',
       '72700000-0000-4000-8000-000000000001',
       '71000000-0000-4000-8000-000000000001',
       'Self-parenting comment',
       '72800000-0000-4000-8000-000000000006'
     ) $$,
  '23514',
  'comment_parent_cycle',
  'a comment cannot parent itself'
);
SELECT throws_ok(
  $$ INSERT INTO public.page_comments (
       id, page_id, project_id, author_id, body, parent_id
     ) VALUES (
       '72900000-0000-4000-8000-000000000007',
       '72100000-0000-4000-8000-000000000001',
       '72000000-0000-4000-8000-000000000001',
       '71000000-0000-4000-8000-000000000001',
       'Self-parenting page comment',
       '72900000-0000-4000-8000-000000000007'
     ) $$,
  '23514',
  'page_comment_parent_cycle',
  'a page comment cannot parent itself'
);
SELECT lives_ok(
  $$ UPDATE public.comments
     SET body = 'Client-forged assistant body'
     WHERE id = '72800000-0000-4000-8000-000000000004' $$,
  'RLS silently hides assistant-authored comments from client updates'
);
SELECT lives_ok(
  $$ UPDATE public.page_comments
     SET body = 'Client-forged assistant page body'
     WHERE id = '72900000-0000-4000-8000-000000000004' $$,
  'RLS silently hides assistant-authored page comments from client updates'
);

RESET ROLE;
SELECT is(
  (SELECT body FROM public.comments
   WHERE id = '72800000-0000-4000-8000-000000000004'),
  'Assistant-authored body',
  'the client cannot rewrite an assistant-authored comment body'
);
SELECT is(
  (SELECT body FROM public.page_comments
   WHERE id = '72900000-0000-4000-8000-000000000004'),
  'Assistant-authored page body',
  'the client cannot rewrite an assistant-authored page comment body'
);

SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
SELECT throws_ok(
  $$ UPDATE public.comments
     SET parent_id = '72800000-0000-4000-8000-000000000002'
     WHERE id = '72800000-0000-4000-8000-000000000001' $$,
  '23514',
  'comment_parent_cycle',
  'a privileged update cannot create a comment parent cycle'
);
SELECT throws_ok(
  $$ UPDATE public.page_comments
     SET parent_id = '72900000-0000-4000-8000-000000000002'
     WHERE id = '72900000-0000-4000-8000-000000000001' $$,
  '23514',
  'page_comment_parent_cycle',
  'a privileged update cannot create a page comment parent cycle'
);
SELECT throws_ok(
  $$ UPDATE public.comments
     SET issue_id = '72700000-0000-4000-8000-000000000002'
     WHERE id = '72800000-0000-4000-8000-000000000001' $$,
  '42501',
  'Numo comment scope is immutable',
  'a privileged worker cannot move a live comment scope'
);
SELECT throws_ok(
  $$ UPDATE public.page_comments
     SET page_id = '72100000-0000-4000-8000-000000000003'
     WHERE id = '72900000-0000-4000-8000-000000000001' $$,
  '23514',
  'page_comment_child_scope_mismatch',
  'a privileged page move cannot strand direct page comment children'
);
SELECT lives_ok(
  $$ UPDATE public.comments
     SET assistant_status = 'done', assistant_tool = NULL
     WHERE id = '72800000-0000-4000-8000-000000000004' $$,
  'the service role can finish an assistant-authored comment'
);
SELECT lives_ok(
  $$ UPDATE public.page_comments
     SET assistant_status = 'done', assistant_tool = NULL
     WHERE id = '72900000-0000-4000-8000-000000000004' $$,
  'the service role can finish an assistant-authored page comment'
);

RESET ROLE;
DELETE FROM public.project_members
WHERE project_id = '72000000-0000-4000-8000-000000000002'
  AND user_id = '71000000-0000-4000-8000-000000000001';
DELETE FROM public.pages
WHERE id = '72100000-0000-4000-8000-000000000002';
DELETE FROM public.comments
WHERE id = '72800000-0000-4000-8000-000000000003';
SELECT is(
  (SELECT count(*)::integer
   FROM public.comments
   WHERE id IN (
     '72800000-0000-4000-8000-000000000001',
     '72800000-0000-4000-8000-000000000002'
   )),
  2,
  'deleting the foreign target cannot cascade into the protected thread'
);
SELECT is(
  (SELECT count(*)::integer
   FROM public.page_comments
   WHERE id IN (
     '72900000-0000-4000-8000-000000000001',
     '72900000-0000-4000-8000-000000000002'
   )),
  2,
  'deleting the foreign page target cannot cascade into the protected thread'
);

INSERT INTO public.agent_conversations (id, project_id, owner_id, visibility)
VALUES
  (
    '73000000-0000-4000-8000-000000000001',
    '72000000-0000-4000-8000-000000000001',
    '71000000-0000-4000-8000-000000000001',
    'private'
  ),
  (
    '73000000-0000-4000-8000-000000000002',
    '72000000-0000-4000-8000-000000000002',
    '71000000-0000-4000-8000-000000000002',
    'private'
  );

-- The first row intentionally satisfies the baseline's former r.id = r.run_id
-- typo. Its existence must never make the foreign row globally readable.
INSERT INTO public.agent_runs (
  id, run_id, project_id, conversation_id, created_by
)
VALUES
  (
    '74000000-0000-4000-8000-000000000001',
    '74000000-0000-4000-8000-000000000001',
    '72000000-0000-4000-8000-000000000001',
    '73000000-0000-4000-8000-000000000001',
    '71000000-0000-4000-8000-000000000001'
  ),
  (
    '74000000-0000-4000-8000-000000000002',
    '74000000-0000-4000-8000-000000000099',
    '72000000-0000-4000-8000-000000000002',
    '73000000-0000-4000-8000-000000000002',
    '71000000-0000-4000-8000-000000000002'
  );

INSERT INTO public.agent_run_events (id, run_id, seq, type)
VALUES
  (
    '75000000-0000-4000-8000-000000000001',
    '74000000-0000-4000-8000-000000000001',
    1,
    'status'
  ),
  (
    '75000000-0000-4000-8000-000000000002',
    '74000000-0000-4000-8000-000000000002',
    1,
    'status'
  );

INSERT INTO public.agent_run_messages (id, run_id, content, created_by)
VALUES
  (
    '76000000-0000-4000-8000-000000000001',
    '74000000-0000-4000-8000-000000000001',
    'Owner message',
    '71000000-0000-4000-8000-000000000001'
  ),
  (
    '76000000-0000-4000-8000-000000000002',
    '74000000-0000-4000-8000-000000000002',
    'Foreign message',
    '71000000-0000-4000-8000-000000000002'
  );

INSERT INTO public.agent_conversations (id, project_id, owner_id, visibility)
VALUES
  (
    '73000000-0000-4000-8000-000000000003',
    '72000000-0000-4000-8000-000000000001',
    '71000000-0000-4000-8000-000000000001',
    'private'
  ),
  (
    '73000000-0000-4000-8000-000000000004',
    '72000000-0000-4000-8000-000000000001',
    '71000000-0000-4000-8000-000000000001',
    'private'
  );
INSERT INTO public.agent_runs (
  id, run_id, project_id, conversation_id, created_by, status,
  key_mode, checkpoint, created_at
)
VALUES
  (
    '74000000-0000-4000-8000-000000000003',
    '74000000-0000-4000-8000-000000000103',
    '72000000-0000-4000-8000-000000000001',
    '73000000-0000-4000-8000-000000000003',
    '71000000-0000-4000-8000-000000000001',
    'completed',
    'platform',
    '{}'::jsonb,
    now() - interval '2 minutes'
  ),
  (
    '74000000-0000-4000-8000-000000000004',
    '74000000-0000-4000-8000-000000000104',
    '72000000-0000-4000-8000-000000000001',
    '73000000-0000-4000-8000-000000000003',
    '71000000-0000-4000-8000-000000000001',
    'completed',
    'platform',
    '{}'::jsonb,
    now() - interval '1 minute'
  ),
  (
    '74000000-0000-4000-8000-000000000005',
    '74000000-0000-4000-8000-000000000105',
    '72000000-0000-4000-8000-000000000001',
    '73000000-0000-4000-8000-000000000004',
    '71000000-0000-4000-8000-000000000001',
    'completed',
    'byok',
    '{}'::jsonb,
    now()
  );

SELECT is(
  public.resume_latest_agent_run_with_message(
    '74000000-0000-4000-8000-000000000003',
    '71000000-0000-4000-8000-000000000001',
    '71000000-0000-4000-8000-000000000001',
    '76000000-0000-4000-8000-000000000003',
    'Must remain rejected', NULL, now(), now() - interval '30 days', 100, 1
  ),
  'superseded',
  'a historical platform run cannot resume after a newer anchored run exists'
);
SELECT ok(
  (SELECT status = 'completed'
     FROM public.agent_runs
    WHERE id = '74000000-0000-4000-8000-000000000003')
  AND NOT EXISTS (
    SELECT 1 FROM public.agent_run_messages
    WHERE id = '76000000-0000-4000-8000-000000000003'
  ),
  'a superseded resume leaves no queued run, budget, or message'
);

INSERT INTO public.project_members (project_id, user_id, added_by)
VALUES (
  '72000000-0000-4000-8000-000000000001',
  '71000000-0000-4000-8000-000000000003',
  '71000000-0000-4000-8000-000000000001'
);
SELECT is(
  public.resume_latest_agent_run_with_message(
    '74000000-0000-4000-8000-000000000004',
    '71000000-0000-4000-8000-000000000001',
    '71000000-0000-4000-8000-000000000003',
    '76000000-0000-4000-8000-000000000006',
    'Must remain private', NULL, now(), now() - interval '30 days', 100, 1
  ),
  'forbidden',
  'a project member cannot resume another account private conversation'
);
SELECT ok(
  (SELECT status = 'completed'
     FROM public.agent_runs
    WHERE id = '74000000-0000-4000-8000-000000000004')
  AND NOT EXISTS (
    SELECT 1 FROM public.agent_run_messages
    WHERE id = '76000000-0000-4000-8000-000000000006'
  ),
  'a rejected caller leaves the run, budget, and message unchanged'
);

SELECT is(
  public.resume_latest_agent_run_with_message(
    '74000000-0000-4000-8000-000000000004',
    '71000000-0000-4000-8000-000000000001',
    '71000000-0000-4000-8000-000000000001',
    '76000000-0000-4000-8000-000000000004',
    'Resume platform atomically', NULL, now(),
    now() - interval '30 days', 100, 1
  ),
  'queued',
  'the latest platform run persists its message and budget with the resume'
);
SELECT ok(
  (SELECT status = 'queued' AND managed_budget_usd = 1
     FROM public.agent_runs
    WHERE id = '74000000-0000-4000-8000-000000000004')
  AND EXISTS (
    SELECT 1 FROM public.agent_run_messages
    WHERE id = '76000000-0000-4000-8000-000000000004'
      AND run_id = '74000000-0000-4000-8000-000000000004'
  ),
  'a managed resume commits queue state, reservation, and message together'
);

SELECT is(
  public.resume_latest_agent_run_with_message(
    '74000000-0000-4000-8000-000000000005',
    '71000000-0000-4000-8000-000000000001',
    '71000000-0000-4000-8000-000000000001',
    '76000000-0000-4000-8000-000000000005',
    'Resume BYOK atomically', NULL, now(), NULL, NULL, NULL
  ),
  'queued',
  'the latest BYOK run persists its message with the resume'
);
SELECT ok(
  (SELECT status = 'queued'
     FROM public.agent_runs
    WHERE id = '74000000-0000-4000-8000-000000000005')
  AND EXISTS (
    SELECT 1 FROM public.agent_run_messages
    WHERE id = '76000000-0000-4000-8000-000000000005'
  ),
  'a BYOK resume commits queue state and message together'
);

SELECT ok(
  has_function_privilege(
    'service_role',
    'public.resume_latest_agent_run_with_message(uuid,uuid,uuid,uuid,text,jsonb,timestamptz,timestamptz,numeric,numeric)',
    'EXECUTE'
  )
  AND NOT has_function_privilege(
    'authenticated',
    'public.resume_latest_agent_run_with_message(uuid,uuid,uuid,uuid,text,jsonb,timestamptz,timestamptz,numeric,numeric)',
    'EXECUTE'
  ),
  'only the service role can perform the atomic latest-run resume'
);
SELECT ok(
  NOT has_function_privilege(
    'service_role',
    'public.resume_agent_run_with_budget(uuid,uuid,timestamptz,numeric,numeric,timestamptz)',
    'EXECUTE'
  ),
  'the non-atomic budget-only resume RPC is retired'
);

INSERT INTO public.agent_conversations (
  id, project_id, owner_id, visibility
) VALUES (
  '73000000-0000-4000-8000-000000000006',
  '72000000-0000-4000-8000-000000000001',
  '71000000-0000-4000-8000-000000000001',
  'project'
);
INSERT INTO public.agent_runs (
  id, run_id, project_id, conversation_id, created_by, status,
  key_mode, checkpoint, created_at
) VALUES (
  '74000000-0000-4000-8000-000000000006',
  '74000000-0000-4000-8000-000000000106',
  '72000000-0000-4000-8000-000000000001',
  '73000000-0000-4000-8000-000000000006',
  '71000000-0000-4000-8000-000000000001',
  'running',
  'byok',
  '{}'::jsonb,
  now()
);
SELECT is(
  public.insert_latest_agent_run_message(
    '74000000-0000-4000-8000-000000000006',
    '76000000-0000-4000-8000-000000000007',
    '71000000-0000-4000-8000-000000000003',
    'Authorized active steering',
    NULL
  ),
  'inserted',
  'a current project member can steer a project-visible active run'
);
DELETE FROM public.project_members
WHERE project_id = '72000000-0000-4000-8000-000000000001'
  AND user_id = '71000000-0000-4000-8000-000000000003';
SELECT is(
  public.insert_latest_agent_run_message(
    '74000000-0000-4000-8000-000000000006',
    '76000000-0000-4000-8000-000000000008',
    '71000000-0000-4000-8000-000000000003',
    'Revoked active steering',
    NULL
  ),
  'forbidden',
  'a revoked member cannot steer an active run'
);
SELECT is(
  (SELECT count(*)::integer
   FROM public.agent_run_messages
   WHERE id = '76000000-0000-4000-8000-000000000008'),
  0,
  'a rejected active steer persists no message'
);

INSERT INTO public.project_members (project_id, user_id, added_by)
VALUES (
  '72000000-0000-4000-8000-000000000001',
  '71000000-0000-4000-8000-000000000004',
  '71000000-0000-4000-8000-000000000001'
);
INSERT INTO public.agent_conversations (
  id, project_id, owner_id, visibility
) VALUES (
  '73000000-0000-4000-8000-000000000007',
  '72000000-0000-4000-8000-000000000001',
  '71000000-0000-4000-8000-000000000004',
  'project'
);
INSERT INTO public.agent_runs (
  id, run_id, project_id, conversation_id, created_by, status,
  key_mode, checkpoint, created_at
) VALUES (
  '74000000-0000-4000-8000-000000000007',
  '74000000-0000-4000-8000-000000000107',
  '72000000-0000-4000-8000-000000000001',
  '73000000-0000-4000-8000-000000000007',
  '71000000-0000-4000-8000-000000000004',
  'completed',
  'byok',
  '{}'::jsonb,
  now()
);
DELETE FROM public.project_members
WHERE project_id = '72000000-0000-4000-8000-000000000001'
  AND user_id = '71000000-0000-4000-8000-000000000004';
SELECT is(
  public.resume_latest_agent_run_with_message(
    '74000000-0000-4000-8000-000000000007',
    '71000000-0000-4000-8000-000000000004',
    '71000000-0000-4000-8000-000000000001',
    '76000000-0000-4000-8000-000000000009',
    'Former owner resume', NULL, now(), NULL, NULL, NULL
  ),
  'conflict',
  'a run creator must retain current project authority before resume'
);
SELECT ok(
  (SELECT status = 'completed'
   FROM public.agent_runs
   WHERE id = '74000000-0000-4000-8000-000000000007')
  AND NOT EXISTS (
    SELECT 1 FROM public.agent_run_messages
    WHERE id = '76000000-0000-4000-8000-000000000009'
  ),
  'revoked creator authority leaves the terminal run unchanged'
);

INSERT INTO auth.users (id, email)
VALUES (
  '71000000-0000-4000-8000-000000000010',
  'release-deleted-run-owner@example.test'
);
INSERT INTO public.agent_conversations (
  id, project_id, owner_id, visibility
) VALUES (
  '73000000-0000-4000-8000-000000000008',
  '72000000-0000-4000-8000-000000000001',
  '71000000-0000-4000-8000-000000000010',
  'project'
);
INSERT INTO public.agent_runs (
  id, run_id, project_id, conversation_id, created_by, status,
  key_mode, checkpoint, created_at
) VALUES (
  '74000000-0000-4000-8000-000000000008',
  '74000000-0000-4000-8000-000000000108',
  '72000000-0000-4000-8000-000000000001',
  '73000000-0000-4000-8000-000000000008',
  '71000000-0000-4000-8000-000000000010',
  'completed',
  'byok',
  '{}'::jsonb,
  now()
);
DELETE FROM auth.users
WHERE id = '71000000-0000-4000-8000-000000000010';
SELECT is(
  public.resume_latest_agent_run_with_message(
    '74000000-0000-4000-8000-000000000008',
    '71000000-0000-4000-8000-000000000001',
    '71000000-0000-4000-8000-000000000001',
    '76000000-0000-4000-8000-000000000010',
    'Deleted creator resume', NULL, now(), NULL, NULL, NULL
  ),
  'conflict',
  'a run whose creator was deleted cannot be resumed under another identity'
);

INSERT INTO auth.users (id, email, raw_app_meta_data)
VALUES (
  '71000000-0000-4000-8000-000000000011',
  'release-revoked-run-owner@example.test',
  '{}'::jsonb
);
INSERT INTO public.projects (id, owner_id, name, key)
VALUES (
  '72000000-0000-4000-8000-000000000011',
  '71000000-0000-4000-8000-000000000011',
  'Revoked run owner project',
  'RRO'
);
INSERT INTO public.project_members (project_id, user_id, added_by)
VALUES (
  '72000000-0000-4000-8000-000000000011',
  '71000000-0000-4000-8000-000000000001',
  '71000000-0000-4000-8000-000000000011'
);
INSERT INTO public.agent_conversations (
  id, project_id, owner_id, visibility
)
VALUES
  (
    '73000000-0000-4000-8000-000000000011',
    '72000000-0000-4000-8000-000000000011',
    '71000000-0000-4000-8000-000000000011',
    'project'
  ),
  (
    '73000000-0000-4000-8000-000000000012',
    '72000000-0000-4000-8000-000000000011',
    '71000000-0000-4000-8000-000000000011',
    'project'
  ),
  (
    '73000000-0000-4000-8000-000000000013',
    '72000000-0000-4000-8000-000000000011',
    '71000000-0000-4000-8000-000000000011',
    'project'
  ),
  (
    '73000000-0000-4000-8000-000000000014',
    '72000000-0000-4000-8000-000000000011',
    '71000000-0000-4000-8000-000000000011',
    'project'
  );
INSERT INTO public.agent_runs (
  id, run_id, project_id, conversation_id, created_by, status,
  key_mode, checkpoint, local_exec, created_at
)
VALUES
  (
    '74000000-0000-4000-8000-000000000011',
    '74000000-0000-4000-8000-000000000111',
    '72000000-0000-4000-8000-000000000011',
    '73000000-0000-4000-8000-000000000011',
    '71000000-0000-4000-8000-000000000011',
    'running', 'byok', '{}'::jsonb, false, now()
  ),
  (
    '74000000-0000-4000-8000-000000000012',
    '74000000-0000-4000-8000-000000000112',
    '72000000-0000-4000-8000-000000000011',
    '73000000-0000-4000-8000-000000000012',
    '71000000-0000-4000-8000-000000000011',
    'completed', 'byok', '{}'::jsonb, false, now()
  ),
  (
    '74000000-0000-4000-8000-000000000013',
    '74000000-0000-4000-8000-000000000113',
    '72000000-0000-4000-8000-000000000011',
    '73000000-0000-4000-8000-000000000013',
    '71000000-0000-4000-8000-000000000011',
    'queued', 'byok', NULL, false, now()
  ),
  (
    '74000000-0000-4000-8000-000000000014',
    '74000000-0000-4000-8000-000000000114',
    '72000000-0000-4000-8000-000000000011',
    '73000000-0000-4000-8000-000000000014',
    '71000000-0000-4000-8000-000000000011',
    'queued', 'byok', NULL, true, now()
  );

UPDATE auth.users
SET banned_until = now() + interval '1 day'
WHERE id = '71000000-0000-4000-8000-000000000011';
SELECT is(
  public.insert_latest_agent_run_message(
    '74000000-0000-4000-8000-000000000011',
    '76000000-0000-4000-8000-000000000011',
    '71000000-0000-4000-8000-000000000001',
    'Banned owner steer', NULL
  ),
  'conflict',
  'a member cannot steer a run whose owner is administratively banned'
);
SELECT is(
  public.resume_latest_agent_run_with_message(
    '74000000-0000-4000-8000-000000000012',
    '71000000-0000-4000-8000-000000000011',
    '71000000-0000-4000-8000-000000000001',
    '76000000-0000-4000-8000-000000000012',
    'Banned owner resume', NULL, now(), NULL, NULL, NULL
  ),
  'conflict',
  'a member cannot resume a run whose owner is administratively banned'
);
SELECT is(
  (SELECT count(*)::integer FROM public.claim_agent_run(
    '74000000-0000-4000-8000-000000000013'
  )),
  0,
  'a queued cloud run cannot start for a banned owner'
);
SELECT is(
  (SELECT count(*)::integer FROM public.claim_local_agent_run(
    '74000000-0000-4000-8000-000000000014',
    '71000000-0000-4000-8000-000000000011',
    '0123456789abcdef0123456789abcdef'
  )),
  0,
  'a queued local run cannot start for a banned owner'
);
UPDATE auth.users
SET banned_until = NULL, deleted_at = now()
WHERE id = '71000000-0000-4000-8000-000000000011';
SELECT is(
  public.insert_latest_agent_run_message(
    '74000000-0000-4000-8000-000000000011',
    '76000000-0000-4000-8000-000000000013',
    '71000000-0000-4000-8000-000000000001',
    'Soft-deleted owner steer', NULL
  ),
  'conflict',
  'a member cannot steer a run whose owner is soft-deleted'
);
SELECT is(
  public.resume_latest_agent_run_with_message(
    '74000000-0000-4000-8000-000000000012',
    '71000000-0000-4000-8000-000000000011',
    '71000000-0000-4000-8000-000000000001',
    '76000000-0000-4000-8000-000000000014',
    'Soft-deleted owner resume', NULL, now(), NULL, NULL, NULL
  ),
  'conflict',
  'a member cannot resume a run whose owner is soft-deleted'
);
SELECT is(
  (SELECT count(*)::integer FROM public.claim_agent_run(
    '74000000-0000-4000-8000-000000000013'
  )),
  0,
  'a queued cloud run cannot start for a soft-deleted owner'
);
SELECT is(
  (SELECT count(*)::integer FROM public.claim_local_agent_run(
    '74000000-0000-4000-8000-000000000014',
    '71000000-0000-4000-8000-000000000011',
    '0123456789abcdef0123456789abcdef'
  )),
  0,
  'a queued local run cannot start for a soft-deleted owner'
);
SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM public.agent_run_messages
    WHERE id IN (
      '76000000-0000-4000-8000-000000000011',
      '76000000-0000-4000-8000-000000000012',
      '76000000-0000-4000-8000-000000000013',
      '76000000-0000-4000-8000-000000000014'
    )
  )
  AND (
    SELECT count(*) = 2
    FROM public.agent_runs
    WHERE id IN (
      '74000000-0000-4000-8000-000000000013',
      '74000000-0000-4000-8000-000000000014'
    )
      AND status = 'queued'
  ),
  'administrative revocation leaves messages and queued claims unchanged'
);

UPDATE auth.users
SET deleted_at = NULL
WHERE id = '71000000-0000-4000-8000-000000000011';
SELECT is(
  (SELECT count(*)::integer FROM public.claim_local_agent_run(
    '74000000-0000-4000-8000-000000000014',
    '71000000-0000-4000-8000-000000000011',
    NULL
  )),
  0,
  'a live local run cannot start without a bound device identifier'
);
SELECT is(
  (SELECT count(*)::integer FROM public.claim_agent_run(
    '74000000-0000-4000-8000-000000000013'
  )),
  1,
  'a live authorized cloud run still claims exactly once'
);
SELECT is(
  (SELECT count(*)::integer FROM public.claim_local_agent_run(
    '74000000-0000-4000-8000-000000000014',
    '71000000-0000-4000-8000-000000000011',
    '0123456789abcdef0123456789abcdef'
  )),
  1,
  'a live authorized local run still claims exactly once'
);
SELECT ok(
  (SELECT status = 'running'
     FROM public.agent_runs
    WHERE id = '74000000-0000-4000-8000-000000000013')
  AND (
    SELECT status = 'running'
       AND local_exec_device_id = '0123456789abcdef0123456789abcdef'
    FROM public.agent_runs
    WHERE id = '74000000-0000-4000-8000-000000000014'
  ),
  'successful claims preserve cloud state and bind the local device'
);

SELECT ok(
  has_function_privilege(
    'service_role',
    'public.insert_latest_agent_run_message(uuid,uuid,uuid,text,jsonb)',
    'EXECUTE'
  )
  AND NOT has_function_privilege(
    'authenticated',
    'public.insert_latest_agent_run_message(uuid,uuid,uuid,text,jsonb)',
    'EXECUTE'
  ),
  'only the service role can use the current-authority steering RPC'
);
SELECT ok(
  NOT has_function_privilege(
    'service_role',
    'public.lock_live_agent_run_project_access(uuid,uuid,uuid)',
    'EXECUTE'
  )
  AND NOT has_function_privilege(
    'service_role',
    'public.agent_run_repository_binding_is_current(uuid,uuid,uuid,text,text)',
    'EXECUTE'
  ),
  'agent authority helpers are not directly callable by API roles'
);

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"71000000-0000-4000-8000-000000000001","aal":"aal2"}',
  true
);

SELECT results_eq(
  $$ SELECT id FROM public.agent_run_events ORDER BY id $$,
  $$ VALUES ('75000000-0000-4000-8000-000000000001'::uuid) $$,
  'agent event RLS correlates each row with its own accessible run'
);
SELECT results_eq(
  $$ SELECT id FROM public.agent_run_messages ORDER BY id $$,
  $$ VALUES
       ('76000000-0000-4000-8000-000000000001'::uuid),
       ('76000000-0000-4000-8000-000000000004'::uuid),
       ('76000000-0000-4000-8000-000000000005'::uuid),
       ('76000000-0000-4000-8000-000000000007'::uuid) $$,
  'agent message RLS correlates each row with its own accessible run'
);
SELECT throws_ok(
  $$ INSERT INTO public.agent_run_events (run_id, seq, type)
     VALUES ('74000000-0000-4000-8000-000000000001', 2, 'status') $$,
  '42501',
  NULL,
  'authenticated clients cannot forge agent run events'
);

SELECT set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"71000000-0000-4000-8000-000000000003","aal":"aal1"}',
  true
);
SELECT is((SELECT count(*)::integer FROM public.agent_run_events), 0,
  'an outsider reads no agent run events');
SELECT is((SELECT count(*)::integer FROM public.agent_run_messages), 0,
  'an outsider reads no agent run messages');

RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
