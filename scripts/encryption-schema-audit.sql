-- Read schema metadata only, from an isolated database with the migrations applied.
-- Never query application rows or decrypted Vault views to build this inventory.
SELECT jsonb_pretty(jsonb_build_object(
  'tables', (SELECT jsonb_object_agg(c.relname, jsonb_build_object(
    'columns', (SELECT jsonb_object_agg(a.attname, jsonb_build_object(
      'type', format_type(a.atttypid, a.atttypmod), 'nullable', NOT a.attnotnull,
      'generated', a.attgenerated <> '') ORDER BY a.attname)
      FROM pg_attribute a WHERE a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped),
    'primaryKey', COALESCE((SELECT jsonb_agg(a.attname ORDER BY k.ordinality)
      FROM pg_index i CROSS JOIN LATERAL unnest(i.indkey) WITH ORDINALITY k(attnum, ordinality)
      JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = k.attnum
      WHERE i.indrelid = c.oid AND i.indisprimary), '[]'::jsonb),
    'foreignKeys', COALESCE((SELECT jsonb_agg(jsonb_build_object('column', a.attname,
      'table', target.relname, 'targetColumn', ta.attname) ORDER BY a.attname)
      FROM pg_constraint fk JOIN pg_class target ON target.oid = fk.confrelid
      CROSS JOIN LATERAL unnest(fk.conkey, fk.confkey) k(source_key, target_key)
      JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = k.source_key
      JOIN pg_attribute ta ON ta.attrelid = target.oid AND ta.attnum = k.target_key
      WHERE fk.conrelid = c.oid AND fk.contype = 'f'), '[]'::jsonb)
  ) ORDER BY c.relname)
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r'),
  'views', (SELECT jsonb_object_agg(c.relname, pg_get_viewdef(c.oid, true) ORDER BY c.relname)
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('v', 'm')),
  'functions', (SELECT jsonb_object_agg(p.oid::regprocedure::text, jsonb_build_object(
    'definition', pg_get_functiondef(p.oid), 'securityDefiner', p.prosecdef,
    'configuration', p.proconfig, 'acl', p.proacl::text) ORDER BY p.oid::regprocedure::text)
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prokind = 'f'
      AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid
        AND d.classid = 'pg_proc'::regclass AND d.deptype = 'e')),
  'triggers', (SELECT jsonb_object_agg(c.relname || '.' || t.tgname,
    jsonb_build_object('function', t.tgfoid::regprocedure::text,
      'definition', pg_get_triggerdef(t.oid, true)) ORDER BY c.relname, t.tgname)
    FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND NOT t.tgisinternal)
));
