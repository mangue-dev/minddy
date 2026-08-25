BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(19);

SELECT ok(
  NOT has_function_privilege(
    'anon',
    'public.create_objective_guarded(uuid, uuid, jsonb)',
    'EXECUTE'
  ),
  'anonymous callers cannot execute guarded objective creation'
);

SELECT ok(
  NOT has_function_privilege(
    'authenticated',
    'public.update_objective_guarded(uuid, uuid, jsonb)',
    'EXECUTE'
  ),
  'authenticated clients cannot execute guarded objective updates'
);

SELECT ok(
  NOT has_function_privilege(
    'authenticated',
    'public.soft_delete_objective_guarded(uuid, uuid)',
    'EXECUTE'
  ),
  'authenticated clients cannot execute guarded objective deletion'
);

SELECT ok(
  NOT has_function_privilege(
    'authenticated',
    'public.create_project_invitation_guarded(uuid, uuid, text, uuid, integer)',
    'EXECUTE'
  ),
  'authenticated clients cannot execute guarded invitation creation'
);

SELECT ok(
  has_function_privilege(
    'service_role',
    'public.create_objective_guarded(uuid, uuid, jsonb)',
    'EXECUTE'
  ),
  'the service role can execute guarded objective creation'
);

SELECT ok(
  has_function_privilege(
    'service_role',
    'public.update_objective_guarded(uuid, uuid, jsonb)',
    'EXECUTE'
  ),
  'the service role can execute guarded objective updates'
);

SELECT ok(
  has_function_privilege(
    'service_role',
    'public.soft_delete_objective_guarded(uuid, uuid)',
    'EXECUTE'
  ),
  'the service role can execute guarded objective deletion'
);

SELECT ok(
  has_function_privilege(
    'service_role',
    'public.create_project_invitation_guarded(uuid, uuid, text, uuid, integer)',
    'EXECUTE'
  ),
  'the service role can execute guarded invitation creation'
);

SELECT ok(
  NOT has_table_privilege('authenticated', 'public.project_invitations', 'INSERT'),
  'authenticated clients cannot bypass the invitation RPC with a table insert'
);

SELECT has_trigger(
  'public',
  'project_members',
  'project_members_lock_project_scope',
  'membership changes lock the same project scope as guarded writes'
);

INSERT INTO auth.users (id, email)
VALUES
  ('11111111-1111-4111-8111-111111111111', 'guard-owner@example.test'),
  ('22222222-2222-4222-8222-222222222222', 'guard-member@example.test'),
  ('33333333-3333-4333-8333-333333333333', 'guard-outsider@example.test');

INSERT INTO public.projects (id, owner_id, name, key)
VALUES
  (
    '44444444-4444-4444-8444-444444444444',
    '11111111-1111-4111-8111-111111111111',
    'Guarded project',
    'GRD'
  ),
  (
    '55555555-5555-4555-8555-555555555555',
    '33333333-3333-4333-8333-333333333333',
    'Foreign project',
    'FGD'
  );

INSERT INTO public.project_members (project_id, user_id, role, added_by)
VALUES (
  '44444444-4444-4444-8444-444444444444',
  '22222222-2222-4222-8222-222222222222',
  'member',
  '11111111-1111-4111-8111-111111111111'
);

INSERT INTO public.objectives (id, project_id, name)
VALUES (
  '66666666-6666-4666-8666-666666666666',
  '44444444-4444-4444-8444-444444444444',
  'Guarded objective'
);

SET LOCAL ROLE service_role;

SELECT lives_ok(
  $$
    SELECT public.update_objective_guarded(
      '66666666-6666-4666-8666-666666666666',
      '22222222-2222-4222-8222-222222222222',
      '{"name":"Member update"}'::jsonb
    )
  $$,
  'a current member can update an objective'
);

SELECT throws_ok(
  $$
    SELECT public.update_objective_guarded(
      '66666666-6666-4666-8666-666666666666',
      '33333333-3333-4333-8333-333333333333',
      '{"name":"Cross-tenant update"}'::jsonb
    )
  $$,
  '42501',
  'tenant_guard_forbidden',
  'a cross-tenant objective update fails closed'
);

SELECT throws_ok(
  $$
    SELECT public.soft_delete_objective_guarded(
      '66666666-6666-4666-8666-666666666666',
      '33333333-3333-4333-8333-333333333333'
    )
  $$,
  '42501',
  'tenant_guard_forbidden',
  'a cross-tenant objective deletion fails closed'
);

DELETE FROM public.project_members
WHERE project_id = '44444444-4444-4444-8444-444444444444'
  AND user_id = '22222222-2222-4222-8222-222222222222';

SELECT throws_ok(
  $$
    SELECT public.update_objective_guarded(
      '66666666-6666-4666-8666-666666666666',
      '22222222-2222-4222-8222-222222222222',
      '{"name":"Revoked update"}'::jsonb
    )
  $$,
  '42501',
  'tenant_guard_forbidden',
  'a revoked member cannot update an objective'
);

SELECT is(
  (SELECT name FROM public.objectives WHERE id = '66666666-6666-4666-8666-666666666666'),
  'Member update',
  'a rejected objective mutation leaves the row unchanged'
);

SELECT throws_ok(
  $$
    SELECT public.create_objective_guarded(
      '44444444-4444-4444-8444-444444444444',
      '11111111-1111-4111-8111-111111111111',
      '{"name":"Foreign lead","lead_user_id":"33333333-3333-4333-8333-333333333333"}'::jsonb
    )
  $$,
  '23503',
  'objective_lead_forbidden',
  'an objective lead must belong to the same tenant'
);

SELECT lives_ok(
  $$
    SELECT public.create_project_invitation_guarded(
      '44444444-4444-4444-8444-444444444444',
      '11111111-1111-4111-8111-111111111111',
      'first@example.test',
      NULL,
      1
    )
  $$,
  'the first invitation consumes the available guest slot'
);

SELECT throws_ok(
  $$
    SELECT public.create_project_invitation_guarded(
      '44444444-4444-4444-8444-444444444444',
      '11111111-1111-4111-8111-111111111111',
      'second@example.test',
      NULL,
      1
    )
  $$,
  'P0001',
  'member_limit_reached',
  'the atomic invitation guard refuses the next request at the cap'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.project_invitations
    WHERE project_id = '44444444-4444-4444-8444-444444444444'
      AND status = 'pending'
      AND expires_at > now()
  ),
  1,
  'only one live invitation occupies the final guest slot'
);

RESET ROLE;

SELECT * FROM finish();

ROLLBACK;
