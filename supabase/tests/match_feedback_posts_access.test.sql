BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(7);

SELECT ok(
  NOT has_function_privilege(
    'anon',
    'public.match_feedback_posts(uuid, extensions.vector, uuid, integer, boolean)',
    'EXECUTE'
  ),
  'anonymous callers cannot execute the private-feedback embedding RPC'
);

SELECT ok(
  NOT has_function_privilege(
    'authenticated',
    'public.match_feedback_posts(uuid, extensions.vector, uuid, integer, boolean)',
    'EXECUTE'
  ),
  'authenticated clients do not receive a broad execution grant'
);

SELECT ok(
  has_function_privilege(
    'service_role',
    'public.match_feedback_posts(uuid, extensions.vector, uuid, integer, boolean)',
    'EXECUTE'
  ),
  'the server service role can execute the embedding RPC'
);

INSERT INTO auth.users (id, email)
VALUES
  ('11111111-1111-4111-8111-111111111111', 'embedding-owner@example.test'),
  ('22222222-2222-4222-8222-222222222222', 'embedding-outsider@example.test');

INSERT INTO public.projects (id, owner_id, name, key)
VALUES
  (
    '33333333-3333-4333-8333-333333333333',
    '11111111-1111-4111-8111-111111111111',
    'Embedding access fixture',
    'EAF'
  ),
  (
    '44444444-4444-4444-8444-444444444444',
    '22222222-2222-4222-8222-222222222222',
    'Foreign embedding fixture',
    'FEF'
  );

INSERT INTO public.feedback_posts (
  id,
  project_id,
  title,
  submitted_title,
  source,
  is_public,
  review_state,
  embedding
)
VALUES
  (
    '55555555-5555-4555-8555-555555555555',
    '33333333-3333-4333-8333-333333333333',
    'Private source feedback',
    'Private source feedback',
    'internal',
    false,
    'pending',
    ('[' || array_to_string(array_fill(0, ARRAY[1536]), ',') || ']')::extensions.vector
  ),
  (
    '66666666-6666-4666-8666-666666666666',
    '44444444-4444-4444-8444-444444444444',
    'Private foreign feedback',
    'Private foreign feedback',
    'internal',
    false,
    'pending',
    ('[' || array_to_string(array_fill(1, ARRAY[1536]), ',') || ']')::extensions.vector
  );

SET LOCAL ROLE anon;

SELECT throws_ok(
  $$
    SELECT *
    FROM public.match_feedback_posts(
      '33333333-3333-4333-8333-333333333333',
      ('[' || array_to_string(array_fill(0, ARRAY[1536]), ',') || ']')::extensions.vector
    )
  $$,
  '42501',
  'permission denied for function match_feedback_posts',
  'anonymous execution is denied'
);

RESET ROLE;

-- Temporarily expose the RPC inside this transaction to exercise its internal
-- tenant check independently from the production execution grant.
GRANT EXECUTE ON FUNCTION public.match_feedback_posts(uuid, extensions.vector, uuid, integer, boolean)
  TO authenticated;

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"22222222-2222-4222-8222-222222222222"}',
  true
);

SELECT throws_ok(
  $$
    SELECT *
    FROM public.match_feedback_posts(
      '33333333-3333-4333-8333-333333333333',
      ('[' || array_to_string(array_fill(0, ARRAY[1536]), ',') || ']')::extensions.vector
    )
  $$,
  '42501',
  'feedback_embedding_forbidden',
  'an authenticated caller cannot search another tenant'
);

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"11111111-1111-4111-8111-111111111111"}',
  true
);

SELECT results_eq(
  $$
    SELECT id
    FROM public.match_feedback_posts(
      '33333333-3333-4333-8333-333333333333',
      ('[' || array_to_string(array_fill(0, ARRAY[1536]), ',') || ']')::extensions.vector
    )
  $$,
  $$ VALUES ('55555555-5555-4555-8555-555555555555'::uuid) $$,
  'an authorized project owner can search private feedback in that project'
);

RESET ROLE;
SET LOCAL ROLE service_role;
SELECT set_config(
  'request.jwt.claims',
  '{"role":"service_role"}',
  true
);

SELECT results_eq(
  $$
    SELECT id
    FROM public.match_feedback_posts(
      '44444444-4444-4444-8444-444444444444',
      ('[' || array_to_string(array_fill(1, ARRAY[1536]), ',') || ']')::extensions.vector
    )
  $$,
  $$ VALUES ('66666666-6666-4666-8666-666666666666'::uuid) $$,
  'the service role retains the server-side embedding workflow'
);

RESET ROLE;

SELECT * FROM finish();

ROLLBACK;
