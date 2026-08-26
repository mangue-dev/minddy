BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(23);

SELECT ok(
  NOT has_function_privilege('authenticated', 'public.purge_feedback_junk_guarded(uuid[], timestamptz)', 'EXECUTE'),
  'authenticated callers cannot invoke the junk purge'
);
SELECT ok(
  has_function_privilege('service_role', 'public.purge_feedback_junk_guarded(uuid[], timestamptz)', 'EXECUTE'),
  'the service role can invoke the guarded junk purge'
);
SELECT ok(
  NOT has_function_privilege('authenticated', 'public.discard_blank_page_guarded(uuid)', 'EXECUTE'),
  'authenticated callers cannot bypass page discard authorization'
);
SELECT ok(
  has_function_privilege('service_role', 'public.discard_blank_page_guarded(uuid)', 'EXECUTE'),
  'the service role can invoke guarded page discard after authorization'
);

INSERT INTO auth.users (id, email)
VALUES ('46200000-0000-4000-8000-000000000001', 'race-owner@example.test');

INSERT INTO public.projects (id, owner_id, name, key)
VALUES (
  '46200000-0000-4000-8000-000000000002',
  '46200000-0000-4000-8000-000000000001',
  'Destructive race guards',
  'DRG'
);

INSERT INTO public.feedback_posts (
  id, project_id, title, submitted_title, source, status, vote_count, created_at
) VALUES
  (
    '46200000-0000-4000-8000-000000000010',
    '46200000-0000-4000-8000-000000000002',
    'Protected after scan', 'Protected after scan', 'internal', 'spam', 1,
    '2020-01-01 00:00:00+00'
  ),
  (
    '46200000-0000-4000-8000-000000000011',
    '46200000-0000-4000-8000-000000000002',
    'Merged target', 'Merged target', 'internal', 'spam', 1,
    '2020-01-01 00:00:00+00'
  ),
  (
    '46200000-0000-4000-8000-000000000012',
    '46200000-0000-4000-8000-000000000002',
    'Deletable junk', 'Deletable junk', 'internal', 'spam', 1,
    '2020-01-01 00:00:00+00'
  );

-- Simulate a stale candidate scan: protection arrives before the deleting
-- transaction starts and must be re-read by the guarded function.
UPDATE public.feedback_posts
SET vote_count = 2
WHERE id = '46200000-0000-4000-8000-000000000010';

INSERT INTO public.feedback_posts (
  id, project_id, title, submitted_title, source, status, merged_into_id
) VALUES (
  '46200000-0000-4000-8000-000000000013',
  '46200000-0000-4000-8000-000000000002',
  'Merged child', 'Merged child', 'internal', 'spam',
  '46200000-0000-4000-8000-000000000011'
);

SET LOCAL ROLE service_role;

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.purge_feedback_junk_guarded(
      ARRAY[
        '46200000-0000-4000-8000-000000000010'::uuid,
        '46200000-0000-4000-8000-000000000011'::uuid,
        '46200000-0000-4000-8000-000000000012'::uuid
      ],
      '2025-01-01 00:00:00+00'
    )
  ),
  1,
  'the deleting transaction removes only the still-unprotected candidate'
);
SELECT ok(
  EXISTS (SELECT 1 FROM public.feedback_posts WHERE id = '46200000-0000-4000-8000-000000000010'),
  'a concurrent extra vote protects the junk post'
);
SELECT ok(
  EXISTS (SELECT 1 FROM public.feedback_posts WHERE id = '46200000-0000-4000-8000-000000000011'),
  'a concurrent merged child protects its target'
);
SELECT ok(
  NOT EXISTS (SELECT 1 FROM public.feedback_posts WHERE id = '46200000-0000-4000-8000-000000000012'),
  'an unchanged junk candidate is removed'
);

RESET ROLE;

INSERT INTO public.pages (
  id, project_id, title, content, position, created_by
) VALUES
  (
    '46200000-0000-4000-8000-000000000020',
    '46200000-0000-4000-8000-000000000002',
    '', '{"type":"doc","content":[]}', 'a0',
    '46200000-0000-4000-8000-000000000001'
  ),
  (
    '46200000-0000-4000-8000-000000000021',
    '46200000-0000-4000-8000-000000000002',
    '', '{"type":"doc","content":[]}', 'a1',
    '46200000-0000-4000-8000-000000000001'
  ),
  (
    '46200000-0000-4000-8000-000000000022',
    '46200000-0000-4000-8000-000000000002',
    '', '{"type":"doc","content":[]}', 'a2',
    '46200000-0000-4000-8000-000000000001'
  );

-- The editor saves after the discard caller's read but before its RPC.
UPDATE public.pages
SET content = '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"new"}]}]}',
    version = version + 1
WHERE id = '46200000-0000-4000-8000-000000000020';

INSERT INTO public.pages (
  id, project_id, parent_id, title, content, position, created_by
) VALUES (
  '46200000-0000-4000-8000-000000000023',
  '46200000-0000-4000-8000-000000000002',
  '46200000-0000-4000-8000-000000000021',
  'New child', '{"type":"doc","content":[]}', 'a3',
  '46200000-0000-4000-8000-000000000001'
);

SET LOCAL ROLE service_role;

SELECT is(
  public.discard_blank_page_guarded('46200000-0000-4000-8000-000000000020')->>'status',
  'not_empty',
  'guarded discard refuses a concurrently edited page'
);
SELECT ok(
  EXISTS (SELECT 1 FROM public.pages WHERE id = '46200000-0000-4000-8000-000000000020'),
  'the newer page body remains stored'
);
SELECT is(
  public.discard_blank_page_guarded('46200000-0000-4000-8000-000000000021')->>'status',
  'not_empty',
  'guarded discard refuses a page that gained a child'
);
SELECT is(
  public.discard_blank_page_guarded('46200000-0000-4000-8000-000000000022')->>'status',
  'discarded',
  'guarded discard removes an unchanged blank page'
);

RESET ROLE;

INSERT INTO public.page_comments (
  id, page_id, project_id, body, author_id
) VALUES (
  '46200000-0000-4000-8000-000000000030',
  '46200000-0000-4000-8000-000000000020',
  '46200000-0000-4000-8000-000000000002',
  'Before trash',
  '46200000-0000-4000-8000-000000000001'
);

UPDATE public.pages
SET deleted_at = pg_catalog.clock_timestamp(),
    deleted_by = '46200000-0000-4000-8000-000000000001'
WHERE id = '46200000-0000-4000-8000-000000000020';

SELECT throws_ok(
  $$UPDATE public.page_comments SET body = 'After trash' WHERE id = '46200000-0000-4000-8000-000000000030'$$,
  'P0001',
  'page_not_live',
  'comment edits on a soft-deleted page are rejected'
);
SELECT throws_ok(
  $$DELETE FROM public.page_comments WHERE id = '46200000-0000-4000-8000-000000000030'$$,
  'P0001',
  'page_not_live',
  'comment deletion on a soft-deleted page is rejected'
);
SELECT throws_ok(
  $$INSERT INTO public.page_comments (page_id, project_id, body, author_id) VALUES ('46200000-0000-4000-8000-000000000020', '46200000-0000-4000-8000-000000000002', 'Late', '46200000-0000-4000-8000-000000000001')$$,
  'P0001',
  'page_not_live',
  'new comments on a soft-deleted page are rejected'
);

INSERT INTO public.views (id, project_id, name)
VALUES (
  '46200000-0000-4000-8000-000000000040',
  '46200000-0000-4000-8000-000000000002',
  'Race view'
);

SET LOCAL ROLE service_role;

SELECT is(
  public.upsert_view_share_guarded(
    '46200000-0000-4000-8000-000000000040',
    'public', 'old-token', NULL, NULL,
    '46200000-0000-4000-8000-000000000001'
  )->>'status',
  'ok',
  'the first guarded share upsert succeeds'
);
SELECT is(
  public.upsert_view_share_guarded(
    '46200000-0000-4000-8000-000000000040',
    'password', 'unused-token', NULL, NULL,
    '46200000-0000-4000-8000-000000000001'
  )->>'status',
  'password_required',
  'a guarded replacement cannot use stale missing credentials'
);
SELECT is(
  (SELECT token FROM public.view_shares WHERE view_id = '46200000-0000-4000-8000-000000000040'),
  'old-token',
  'a rejected share replacement retains the existing token'
);

INSERT INTO public.custom_domains (
  id, domain, share_id, status, created_by
) SELECT
  '46200000-0000-4000-8000-000000000041',
  'docs.example.test', id, 'verified',
  '46200000-0000-4000-8000-000000000001'
FROM public.view_shares
WHERE view_id = '46200000-0000-4000-8000-000000000040';

SELECT is(
  public.revoke_view_share_guarded('46200000-0000-4000-8000-000000000040')->>'status',
  'revoked',
  'guarded share revocation removes the locked generation'
);
SELECT is(
  public.upsert_view_share_guarded(
    '46200000-0000-4000-8000-000000000040',
    'public', 'new-token', NULL, NULL,
    '46200000-0000-4000-8000-000000000001'
  )->>'status',
  'ok',
  'a share can be recreated after revocation'
);

INSERT INTO public.custom_domains (
  id, domain, share_id, status, created_by
) SELECT
  '46200000-0000-4000-8000-000000000042',
  'docs.example.test', id, 'verified',
  '46200000-0000-4000-8000-000000000001'
FROM public.view_shares
WHERE view_id = '46200000-0000-4000-8000-000000000040';

SELECT ok(
  NOT public.delete_custom_domain_if_current(
    '46200000-0000-4000-8000-000000000041',
    'docs.example.test'
  ),
  'cleanup for the revoked generation cannot delete the recreated domain row'
);
SELECT ok(
  EXISTS (SELECT 1 FROM public.custom_domains WHERE id = '46200000-0000-4000-8000-000000000042'),
  'the retained domain mapping survives stale cleanup'
);
SELECT is(
  (SELECT token FROM public.view_shares WHERE view_id = '46200000-0000-4000-8000-000000000040'),
  'new-token',
  'the recreated share generation remains current'
);

SELECT * FROM finish();
ROLLBACK;
