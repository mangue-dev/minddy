BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(6);

SELECT ok(NOT has_function_privilege('anon',
  'public.claim_local_agent_run(uuid,uuid,text)', 'EXECUTE'),
  'Anonymous clients cannot claim local agent runs');
SELECT ok(NOT has_function_privilege('authenticated',
  'public.claim_local_agent_run(uuid,uuid,text)', 'EXECUTE'),
  'Authenticated clients cannot bypass server authorization for local claims');
SELECT ok(has_function_privilege('service_role',
  'public.claim_local_agent_run(uuid,uuid,text)', 'EXECUTE'),
  'The authorized server can still claim local agent runs');

SELECT ok(NOT has_function_privilege('anon',
  'public.reserve_forge_relay_mint(uuid,integer)', 'EXECUTE'),
  'Anonymous clients cannot reserve relay quota');
SELECT ok(NOT has_function_privilege('authenticated',
  'public.reserve_forge_relay_mint(uuid,integer)', 'EXECUTE'),
  'Authenticated clients cannot bypass relay authorization');
SELECT ok(has_function_privilege('service_role',
  'public.reserve_forge_relay_mint(uuid,integer)', 'EXECUTE'),
  'The authorized server can still reserve relay quota');

SELECT * FROM finish();
ROLLBACK;
