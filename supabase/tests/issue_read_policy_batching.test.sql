BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();

INSERT INTO auth.users (id, email) VALUES
  ('54900000-0000-4000-8000-000000000001', 'read-owner@example.test'),
  ('54900000-0000-4000-8000-000000000002', 'read-member@example.test'),
  ('54900000-0000-4000-8000-000000000003', 'read-outsider@example.test');

INSERT INTO public.projects (id, owner_id, name, key, deleted_at) VALUES
  ('54900000-0000-4000-8000-000000000010', '54900000-0000-4000-8000-000000000001', 'Read project', 'READ', NULL),
  ('54900000-0000-4000-8000-000000000011', '54900000-0000-4000-8000-000000000001', 'Trashed project', 'TRASH', now()),
  ('54900000-0000-4000-8000-000000000012', '54900000-0000-4000-8000-000000000003', 'Foreign project', 'FOREIGN', NULL);
INSERT INTO public.project_members (project_id, user_id, role, added_by) VALUES
  ('54900000-0000-4000-8000-000000000010', '54900000-0000-4000-8000-000000000002', 'member', '54900000-0000-4000-8000-000000000001');

INSERT INTO public.issues (id, project_id, number, title, created_by, deleted_at) VALUES
  ('54900000-0000-4000-8000-000000000020', '54900000-0000-4000-8000-000000000010', 1, 'Visible', '54900000-0000-4000-8000-000000000001', NULL),
  ('54900000-0000-4000-8000-000000000021', '54900000-0000-4000-8000-000000000010', 2, 'Trashed', '54900000-0000-4000-8000-000000000001', now()),
  ('54900000-0000-4000-8000-000000000022', '54900000-0000-4000-8000-000000000011', 1, 'In trashed project', '54900000-0000-4000-8000-000000000001', NULL),
  ('54900000-0000-4000-8000-000000000023', '54900000-0000-4000-8000-000000000012', 1, 'Foreign', '54900000-0000-4000-8000-000000000003', NULL);
INSERT INTO public.categories (id, project_id, name, color) VALUES
  ('54900000-0000-4000-8000-000000000030', '54900000-0000-4000-8000-000000000010', 'Read category', '#123456'),
  ('54900000-0000-4000-8000-000000000031', '54900000-0000-4000-8000-000000000011', 'Trash category', '#123456'),
  ('54900000-0000-4000-8000-000000000032', '54900000-0000-4000-8000-000000000012', 'Foreign category', '#123456');
INSERT INTO public.issue_categories (issue_id, category_id) VALUES
  ('54900000-0000-4000-8000-000000000020', '54900000-0000-4000-8000-000000000030'),
  ('54900000-0000-4000-8000-000000000021', '54900000-0000-4000-8000-000000000030'),
  ('54900000-0000-4000-8000-000000000022', '54900000-0000-4000-8000-000000000031'),
  ('54900000-0000-4000-8000-000000000023', '54900000-0000-4000-8000-000000000032');

-- Compare the new policies with the original predicate for each actor.
CREATE TEMP TABLE expected_issues AS
SELECT id FROM public.issues WHERE false;
CREATE TEMP TABLE expected_categories AS
SELECT issue_id, category_id FROM public.issue_categories WHERE false;
GRANT SELECT ON expected_issues, expected_categories TO authenticated;

SELECT set_config('request.jwt.claim.sub', '54900000-0000-4000-8000-000000000001', true);
INSERT INTO expected_issues
SELECT id FROM public.issues WHERE public.can_access_project(project_id) AND deleted_at IS NULL;
INSERT INTO expected_categories
SELECT issue_id, category_id FROM public.issue_categories WHERE issue_id IN (SELECT id FROM expected_issues);
SET LOCAL ROLE authenticated;
SELECT results_eq('SELECT id FROM public.issues ORDER BY id', 'SELECT id FROM expected_issues ORDER BY id', 'owner issue visibility matches the original policy');
SELECT results_eq('SELECT issue_id, category_id FROM public.issue_categories ORDER BY issue_id, category_id', 'SELECT issue_id, category_id FROM expected_categories ORDER BY issue_id, category_id', 'owner category visibility matches the original policy');
SELECT is((SELECT count(*)::int FROM public.issues), 2, 'owner retains reads in trashed projects but cannot read trashed issues or foreign projects');
SELECT is((SELECT count(*)::int FROM public.issues i JOIN public.issue_categories c ON c.issue_id = i.id), 2, 'embedded category reads preserve the visible issue set');

RESET ROLE;
TRUNCATE expected_issues, expected_categories;
SELECT set_config('request.jwt.claim.sub', '54900000-0000-4000-8000-000000000002', true);
INSERT INTO expected_issues
SELECT id FROM public.issues WHERE public.can_access_project(project_id) AND deleted_at IS NULL;
INSERT INTO expected_categories
SELECT issue_id, category_id FROM public.issue_categories WHERE issue_id IN (SELECT id FROM expected_issues);
SET LOCAL ROLE authenticated;
SELECT results_eq('SELECT id FROM public.issues ORDER BY id', 'SELECT id FROM expected_issues ORDER BY id', 'member issue visibility matches the original policy');
SELECT results_eq('SELECT issue_id, category_id FROM public.issue_categories ORDER BY issue_id, category_id', 'SELECT issue_id, category_id FROM expected_categories ORDER BY issue_id, category_id', 'member category visibility matches the original policy');
SELECT is((SELECT count(*)::int FROM public.issues), 1, 'member sees only the shared live issue');
SELECT lives_ok($$UPDATE public.issues SET title = 'Member edit' WHERE id = '54900000-0000-4000-8000-000000000020'$$, 'member writes remain supported');
SELECT is((SELECT title FROM public.issues WHERE id = '54900000-0000-4000-8000-000000000020'), 'Member edit', 'the member update actually persists');
SELECT throws_ok($$INSERT INTO public.issue_categories (issue_id, category_id) VALUES ('54900000-0000-4000-8000-000000000023', '54900000-0000-4000-8000-000000000030')$$, '42501', NULL, 'member cannot attach a category to a foreign issue');

RESET ROLE;
DELETE FROM public.project_members WHERE user_id = '54900000-0000-4000-8000-000000000002';
SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*)::int FROM public.issues), 0, 'membership revocation takes effect on the next statement');
SELECT is((SELECT count(*)::int FROM public.issue_categories), 0, 'revocation also removes category visibility');

SELECT set_config('request.jwt.claim.sub', '54900000-0000-4000-8000-000000000003', true);
SELECT is((SELECT count(*)::int FROM public.issues), 1, 'switching JWT identity does not reuse another user access');
SELECT is((SELECT id::text FROM public.issues), '54900000-0000-4000-8000-000000000023', 'outsider sees their own issue only');
SELECT is((SELECT issue_id::text FROM public.issue_categories), '54900000-0000-4000-8000-000000000023', 'outsider sees their own category link only');

SELECT set_config('request.jwt.claim.sub', '', true);
SELECT is((SELECT count(*)::int FROM public.issues), 0, 'missing identity fails closed');
SELECT is((SELECT count(*)::int FROM public.issue_categories), 0, 'missing identity cannot read category links');
SET LOCAL ROLE anon;
SELECT is((SELECT count(*)::int FROM public.issues), 0, 'anonymous callers cannot read issues');
SELECT is((SELECT count(*)::int FROM public.issue_categories), 0, 'anonymous callers cannot read category links');
RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
