BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(3);

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
