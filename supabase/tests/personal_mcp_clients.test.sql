BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(1);

-- Copy real constraints without foreign keys or writes to account data.
CREATE TEMP TABLE mcp_endpoint_probe (
  LIKE public.user_mcp_connections INCLUDING DEFAULTS INCLUDING CONSTRAINTS
);

DO $$
DECLARE
  endpoint text;
BEGIN
  FOREACH endpoint IN ARRAY ARRAY[
    'https://example.com/mcp',
    'HTTPS://example.com/mcp',
    'hTtPs://example.com/mcp'
  ] LOOP
    INSERT INTO mcp_endpoint_probe (user_id, name, url)
    VALUES (gen_random_uuid(), 'Endpoint validation', endpoint);
  END LOOP;

  FOREACH endpoint IN ARRAY ARRAY[
    'http://example.com/mcp',
    'HTTP://example.com/mcp',
    'httpsx://example.com/mcp',
    'https://' || repeat('a', 2041)
  ] LOOP
    BEGIN
      INSERT INTO mcp_endpoint_probe (user_id, name, url)
      VALUES (gen_random_uuid(), 'Endpoint validation', endpoint);
      RAISE EXCEPTION 'Invalid MCP endpoint was accepted';
    EXCEPTION WHEN check_violation THEN
      NULL;
    END;
  END LOOP;
END;
$$;

SELECT pass('MCP endpoints accept case-insensitive HTTPS and reject HTTP or oversized URLs');
SELECT * FROM finish();

ROLLBACK;
