BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(3);

SET LOCAL ROLE service_role;

SELECT lives_ok(
  $$
    SELECT public.upsert_pull_request_monotonic(
      '{
        "provider": "github",
        "repo_full_name": "example/upsert-lock-key",
        "number": 17,
        "state": "open",
        "updated_at": "2026-08-27T08:00:00Z"
      }'::jsonb
    )
  $$,
  'a pull request observation builds its advisory lock key'
);

SELECT is(
  public.upsert_pull_request_monotonic(
    '{
      "provider": "github",
      "repo_full_name": "example/upsert-lock-key",
      "number": 17,
      "state": "merged",
      "updated_at": "2026-08-27T09:00:00Z"
    }'::jsonb
  )->>'applied',
  'true',
  'a newer observation is applied'
);

SELECT is(
  (
    SELECT state
    FROM public.pull_requests
    WHERE provider = 'github'
      AND repo_full_name = 'example/upsert-lock-key'
      AND number = 17
  ),
  'merged',
  'the newer pull request state is stored'
);

SELECT * FROM finish();

ROLLBACK;
