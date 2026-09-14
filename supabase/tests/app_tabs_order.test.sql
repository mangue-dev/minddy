BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(10);
INSERT INTO auth.users(id, email) VALUES
 ('53600000-0000-4000-8000-000000000001', 'tabs-order-one@example.test'),
 ('53600000-0000-4000-8000-000000000002', 'tabs-order-two@example.test');
INSERT INTO public.app_tabs(id,user_id,position,pinned) VALUES
 ('53600000-0000-4000-8000-000000000010','53600000-0000-4000-8000-000000000001',0,false),
 ('53600000-0000-4000-8000-000000000011','53600000-0000-4000-8000-000000000001',1,false),
 ('53600000-0000-4000-8000-000000000012','53600000-0000-4000-8000-000000000001',2,true),
 ('53600000-0000-4000-8000-000000000013','53600000-0000-4000-8000-000000000002',0,false);
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '53600000-0000-4000-8000-000000000001', true);
SELECT is(jsonb_array_length(public.move_app_tab('53600000-0000-4000-8000-000000000011',1,'53600000-0000-4000-8000-000000000010')->'tabs'),3,'reorder returns only the owner collection');
SELECT is((SELECT position::int FROM public.app_tabs WHERE id='53600000-0000-4000-8000-000000000011'),0,'move inserts before the target');
SELECT is((SELECT revision::int FROM public.app_tabs WHERE id='53600000-0000-4000-8000-000000000010'),2,'shifted rows advance their revisions');
SELECT is((SELECT revision::int FROM public.app_tabs WHERE pinned),1,'the other pin group is unchanged');
SELECT is(public.move_app_tab('53600000-0000-4000-8000-000000000011',1,NULL)->>'code','conflict','a stale reorder is rejected');
SELECT public.move_app_tab('53600000-0000-4000-8000-000000000011',2,NULL);
SELECT is((SELECT position::int FROM public.app_tabs WHERE id='53600000-0000-4000-8000-000000000011'),1,'a null anchor moves to the end of its group');
SELECT is(public.move_app_tab('53600000-0000-4000-8000-000000000011',3,'53600000-0000-4000-8000-000000000012')->>'code','invalid','drag cannot cross the pinned boundary');
SELECT is(public.move_app_tab('53600000-0000-4000-8000-000000000011',3,'53600000-0000-4000-8000-000000000013')->>'code','invalid','another owner cannot supply the anchor');
SELECT is(public.move_app_tab('53600000-0000-4000-8000-000000000013',1,NULL)->>'code','not_found','another owner cannot move the tab');
SET LOCAL ROLE anon;
SELECT throws_ok($$SELECT public.move_app_tab('53600000-0000-4000-8000-000000000010',1,NULL)$$,'42501',NULL,'anonymous reorder is denied');
SELECT * FROM finish();
ROLLBACK;
