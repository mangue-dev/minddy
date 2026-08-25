BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(39);

SELECT ok(
  NOT has_function_privilege('anon', 'public.issue_feedback_otp_code(uuid, uuid, text, text, text, timestamptz, timestamptz, integer, integer, integer, integer)', 'EXECUTE'),
  'anonymous callers cannot issue feedback OTP codes'
);
SELECT ok(
  NOT has_function_privilege('anon', 'public.claim_feedback_otp_attempt(uuid, text, timestamptz, integer)', 'EXECUTE'),
  'anonymous callers cannot claim feedback OTP attempts'
);
SELECT ok(
  NOT has_function_privilege('anon', 'public.consume_feedback_otp_code(uuid, timestamptz)', 'EXECUTE'),
  'anonymous callers cannot consume feedback OTP codes'
);
SELECT ok(
  NOT has_function_privilege('anon', 'public.consume_share_unlock_attempt(uuid, text, timestamptz, integer, integer, integer)', 'EXECUTE'),
  'anonymous callers cannot consume share unlock attempts'
);
SELECT ok(
  NOT has_function_privilege('anon', 'public.consume_feedback_voice_attempt(uuid, uuid, text, text, timestamptz, integer, integer, integer)', 'EXECUTE'),
  'anonymous callers cannot consume feedback voice quotas'
);
SELECT ok(
  NOT has_function_privilege('anon', 'public.write_feedback_sso_secret(uuid, text, boolean)', 'EXECUTE'),
  'anonymous callers cannot write feedback SSO secrets'
);
SELECT ok(
  NOT has_function_privilege('anon', 'public.delete_public_feedback_comment(uuid, uuid, uuid)', 'EXECUTE'),
  'anonymous callers cannot delete public feedback comments'
);

SELECT ok(
  has_function_privilege('service_role', 'public.issue_feedback_otp_code(uuid, uuid, text, text, text, timestamptz, timestamptz, integer, integer, integer, integer)', 'EXECUTE'),
  'the service role can issue feedback OTP codes'
);
SELECT ok(
  has_function_privilege('service_role', 'public.claim_feedback_otp_attempt(uuid, text, timestamptz, integer)', 'EXECUTE'),
  'the service role can claim feedback OTP attempts'
);
SELECT ok(
  has_function_privilege('service_role', 'public.consume_feedback_otp_code(uuid, timestamptz)', 'EXECUTE'),
  'the service role can consume feedback OTP codes'
);
SELECT ok(
  has_function_privilege('service_role', 'public.consume_share_unlock_attempt(uuid, text, timestamptz, integer, integer, integer)', 'EXECUTE'),
  'the service role can consume share unlock attempts'
);
SELECT ok(
  has_function_privilege('service_role', 'public.consume_feedback_voice_attempt(uuid, uuid, text, text, timestamptz, integer, integer, integer)', 'EXECUTE'),
  'the service role can consume feedback voice quotas'
);
SELECT ok(
  has_function_privilege('service_role', 'public.write_feedback_sso_secret(uuid, text, boolean)', 'EXECUTE'),
  'the service role can write feedback SSO secrets'
);
SELECT ok(
  has_function_privilege('service_role', 'public.delete_public_feedback_comment(uuid, uuid, uuid)', 'EXECUTE'),
  'the service role can delete public feedback comments'
);

INSERT INTO auth.users (id, email)
VALUES ('46100000-0000-4000-8000-000000000001', 'atomic-owner@example.test');

INSERT INTO public.projects (id, owner_id, name, key)
VALUES (
  '46100000-0000-4000-8000-000000000002',
  '46100000-0000-4000-8000-000000000001',
  'Atomic public guards',
  'APG'
);

INSERT INTO public.feedback_boards (id, project_id, token)
VALUES (
  '46100000-0000-4000-8000-000000000003',
  '46100000-0000-4000-8000-000000000002',
  'atomic-public-board'
);

INSERT INTO public.feedback_users (
  id, project_id, email, pseudonym, verified_via
)
VALUES (
  '46100000-0000-4000-8000-000000000004',
  '46100000-0000-4000-8000-000000000002',
  'visitor@example.test',
  'Quiet Badger',
  'email'
);

INSERT INTO public.views (id, project_id, name)
VALUES (
  '46100000-0000-4000-8000-000000000005',
  '46100000-0000-4000-8000-000000000002',
  'Public view'
);

INSERT INTO public.view_shares (
  id, view_id, level, token, password_salt, password_hash
)
VALUES (
  '46100000-0000-4000-8000-000000000006',
  '46100000-0000-4000-8000-000000000005',
  'password',
  'atomic-share',
  'salt',
  'hash'
);

SET LOCAL ROLE service_role;

DO $do$
BEGIN
  FOR i IN 1..5 LOOP
    PERFORM public.issue_feedback_otp_code(
      ('46100000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid,
      '46100000-0000-4000-8000-000000000003',
      'victim@example.test',
      'origin-a',
      'hash-' || i,
      '2030-01-01 01:10:00+00',
      '2030-01-01 01:00:00+00',
      3600,
      0,
      5,
      15
    );
  END LOOP;
END;
$do$;

SELECT is(
  (SELECT count(*)::integer FROM public.feedback_otp_codes WHERE email = 'victim@example.test'),
  5,
  'OTP issuance fills the recipient quota exactly'
);
SELECT is(
  public.issue_feedback_otp_code(
    '46100000-0000-4000-8000-000000000099',
    '46100000-0000-4000-8000-000000000003',
    'victim@example.test',
    'origin-b',
    'overflow',
    '2030-01-01 01:10:00+00',
    '2030-01-01 01:00:00+00',
    3600, 0, 5, 15
  ),
  'rate_limited',
  'OTP issuance refuses the request after the recipient quota is full'
);

SELECT is(
  public.issue_feedback_otp_code(
    '46100000-0000-4000-8000-000000000101',
    '46100000-0000-4000-8000-000000000003',
    'one@example.test', 'origin-limited', 'one',
    '2030-01-01 01:10:00+00', '2030-01-01 01:00:00+00',
    3600, 0, 5, 2
  ),
  'issued',
  'the first origin-scoped OTP request is accepted'
);
SELECT is(
  public.issue_feedback_otp_code(
    '46100000-0000-4000-8000-000000000102',
    '46100000-0000-4000-8000-000000000003',
    'two@example.test', 'origin-limited', 'two',
    '2030-01-01 01:10:00+00', '2030-01-01 01:00:00+00',
    3600, 0, 5, 2
  ),
  'issued',
  'the second origin-scoped OTP request reaches the exact quota'
);
SELECT is(
  public.issue_feedback_otp_code(
    '46100000-0000-4000-8000-000000000103',
    '46100000-0000-4000-8000-000000000003',
    'three@example.test', 'origin-limited', 'three',
    '2030-01-01 01:10:00+00', '2030-01-01 01:00:00+00',
    3600, 0, 5, 2
  ),
  'rate_limited',
  'the origin-scoped OTP quota refuses the next request'
);

INSERT INTO public.feedback_otp_codes (
  id, board_id, email, code_hash, expires_at, created_at, ip_hash
)
VALUES (
  '46100000-0000-4000-8000-000000000200',
  '46100000-0000-4000-8000-000000000003',
  'claim@example.test',
  'claim-hash',
  '2030-01-01 01:10:00+00',
  '2030-01-01 01:00:00+00',
  'claim-origin'
);

SELECT is(
  (SELECT status FROM public.claim_feedback_otp_attempt(
    '46100000-0000-4000-8000-000000000003',
    'claim@example.test',
    '2030-01-01 01:01:00+00',
    5
  )),
  'claimed',
  'the first OTP verification attempt is claimed'
);

DO $do$
BEGIN
  FOR i IN 1..4 LOOP
    PERFORM * FROM public.claim_feedback_otp_attempt(
      '46100000-0000-4000-8000-000000000003',
      'claim@example.test',
      '2030-01-01 01:01:00+00',
      5
    );
  END LOOP;
END;
$do$;

SELECT is(
  (SELECT status FROM public.claim_feedback_otp_attempt(
    '46100000-0000-4000-8000-000000000003',
    'claim@example.test',
    '2030-01-01 01:01:00+00',
    5
  )),
  'too_many_attempts',
  'the OTP claim refuses an attempt after the exact ceiling'
);
SELECT is(
  (SELECT attempts FROM public.feedback_otp_codes WHERE id = '46100000-0000-4000-8000-000000000200'),
  5,
  'failed parallel-style claims cannot increment beyond the OTP ceiling'
);
SELECT ok(
  public.consume_feedback_otp_code(
    '46100000-0000-4000-8000-000000000200',
    '2030-01-01 01:02:00+00'
  ),
  'the claimed OTP can be consumed once'
);
SELECT ok(
  NOT public.consume_feedback_otp_code(
    '46100000-0000-4000-8000-000000000200',
    '2030-01-01 01:02:01+00'
  ),
  'the same OTP cannot be consumed again'
);

SELECT ok(
  public.consume_share_unlock_attempt(
    '46100000-0000-4000-8000-000000000006', 'share-origin',
    '2030-01-01 01:00:00+00', 3600, 2, 10
  ),
  'the first share unlock reservation is accepted'
);
SELECT ok(
  public.consume_share_unlock_attempt(
    '46100000-0000-4000-8000-000000000006', 'share-origin',
    '2030-01-01 01:00:01+00', 3600, 2, 10
  ),
  'the second share unlock reservation reaches the exact IP quota'
);
SELECT ok(
  NOT public.consume_share_unlock_attempt(
    '46100000-0000-4000-8000-000000000006', 'share-origin',
    '2030-01-01 01:00:02+00', 3600, 2, 10
  ),
  'the share unlock reservation refuses the next attempt'
);
SELECT is(
  (SELECT count(*)::integer FROM public.share_unlock_attempts WHERE share_id = '46100000-0000-4000-8000-000000000006'),
  2,
  'the persistent share counter never exceeds its ceiling'
);

SELECT ok(
  public.consume_feedback_voice_attempt(
    '46100000-0000-4000-8000-000000000003',
    '46100000-0000-4000-8000-000000000004',
    'transcribe', 'voice-origin',
    '2030-01-01 01:00:00+00', 3600, 2, 3
  ),
  'the first feedback voice reservation is accepted'
);
SELECT ok(
  public.consume_feedback_voice_attempt(
    '46100000-0000-4000-8000-000000000003',
    '46100000-0000-4000-8000-000000000004',
    'transcribe', 'voice-origin',
    '2030-01-01 01:00:01+00', 3600, 2, 3
  ),
  'the second feedback voice reservation reaches the exact user quota'
);
SELECT ok(
  NOT public.consume_feedback_voice_attempt(
    '46100000-0000-4000-8000-000000000003',
    '46100000-0000-4000-8000-000000000004',
    'transcribe', 'voice-origin',
    '2030-01-01 01:00:02+00', 3600, 2, 3
  ),
  'the shared feedback voice quota refuses the next request'
);
SELECT is(
  (SELECT count(*)::integer FROM public.feedback_voice_attempts WHERE operation = 'transcribe'),
  2,
  'the feedback voice counter never exceeds its ceiling'
);

SELECT is(
  public.write_feedback_sso_secret(
    '46100000-0000-4000-8000-000000000002', 'sealed-first', true
  ),
  'sealed-first',
  'the first SSO initialization stores its candidate'
);
SELECT is(
  public.write_feedback_sso_secret(
    '46100000-0000-4000-8000-000000000002', 'sealed-racing', true
  ),
  'sealed-first',
  'a racing SSO initialization receives the already stored secret'
);
SELECT is(
  public.write_feedback_sso_secret(
    '46100000-0000-4000-8000-000000000002', 'sealed-rotated', false
  ),
  'sealed-rotated',
  'an explicit SSO rotation replaces the secret while holding the board lock'
);

INSERT INTO public.feedback_posts (
  id, project_id, author_id, title, submitted_title, source, review_state
)
VALUES (
  '46100000-0000-4000-8000-000000000300',
  '46100000-0000-4000-8000-000000000002',
  '46100000-0000-4000-8000-000000000004',
  'Atomic comments',
  'Atomic comments',
  'board',
  'published'
);

INSERT INTO public.comments (
  id, feedback_post_id, feedback_user_id, body, visibility, parent_id
)
VALUES
  (
    '46100000-0000-4000-8000-000000000301',
    '46100000-0000-4000-8000-000000000300',
    '46100000-0000-4000-8000-000000000004',
    'Protected root',
    'public',
    NULL
  ),
  (
    '46100000-0000-4000-8000-000000000302',
    '46100000-0000-4000-8000-000000000300',
    NULL,
    'Team reply',
    'public',
    '46100000-0000-4000-8000-000000000301'
  ),
  (
    '46100000-0000-4000-8000-000000000303',
    '46100000-0000-4000-8000-000000000300',
    '46100000-0000-4000-8000-000000000004',
    'Unanswered root',
    'public',
    NULL
  );

SELECT ok(
  NOT public.delete_public_feedback_comment(
    '46100000-0000-4000-8000-000000000300',
    '46100000-0000-4000-8000-000000000301',
    '46100000-0000-4000-8000-000000000004'
  ),
  'a visitor cannot delete a comment that has a reply'
);
SELECT ok(
  EXISTS (SELECT 1 FROM public.comments WHERE id = '46100000-0000-4000-8000-000000000301'),
  'the protected comment remains after the guarded deletion'
);
SELECT ok(
  public.delete_public_feedback_comment(
    '46100000-0000-4000-8000-000000000300',
    '46100000-0000-4000-8000-000000000303',
    '46100000-0000-4000-8000-000000000004'
  ),
  'a visitor can delete their unanswered public comment'
);
SELECT ok(
  NOT EXISTS (SELECT 1 FROM public.comments WHERE id = '46100000-0000-4000-8000-000000000303'),
  'the unanswered public comment is removed'
);

RESET ROLE;

SELECT * FROM finish();

ROLLBACK;
