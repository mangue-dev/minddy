import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import test from "node:test";

const container = process.env.MINDDY_DOMAIN_REMOVAL_TEST_CONTAINER;
const migration = "supabase/migrations/20270109200029_remove_custom_domains.sql";
const read = (path) => readFileSync(path, "utf8");
const removedTables = ["custom_domains", "custom_domain_cleanup",
  "custom_domain_mutation_leases", "custom_domain_verification_scope"];

// Run only against an explicitly selected, isolated PostgreSQL test container.
test("removes populated domain infrastructure while retaining public content and guarded revocation", {
  skip: !container,
}, () => {
  const database = `min653_${randomUUID().replaceAll("-", "")}`;
  const docker = (...args) => execFileSync("docker", ["exec", "-i", container, ...args], {
    encoding: "utf8", maxBuffer: 4 * 1024 * 1024,
  });
  const sql = (input) => execFileSync("docker", ["exec", "-i", container,
    "psql", "-X", "-At", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", database], {
    input, encoding: "utf8", maxBuffer: 4 * 1024 * 1024,
  }).trim();
  docker("createdb", "-U", "postgres", database);
  try {
    sql(`DO $$ BEGIN
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role; END IF;
    END $$;
    CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);`);
    const baseline = read("supabase/migrations/20270106090000_baseline.sql");
    for (const table of ["projects", "views", "pages", "feedback_boards", "view_shares", "custom_domains"]) {
      const definition = baseline.match(new RegExp(
        `CREATE TABLE IF NOT EXISTS "public"\\."${table}" \\(.*?\\n\\);`, "s"));
      assert.ok(definition, `Baseline table ${table} exists`);
      sql(definition[0]);
      sql(`ALTER TABLE public.${table} ADD PRIMARY KEY(id);`);
    }
    // Use the actual provider and domain migrations, including their triggers.
    const provider = read("supabase/migrations/20270106310000_bound_provider_operations.sql");
    sql(provider.slice(provider.indexOf("CREATE TABLE public.provider_operation_reservations")));
    const guards = read("supabase/migrations/20270106470000_restore_destructive_race_guards.sql");
    sql(guards.slice(guards.indexOf("CREATE OR REPLACE FUNCTION public.revoke_view_share_guarded(")));
    sql(read("supabase/migrations/20270107860000_custom_domain_verification.sql"));
    sql(read("supabase/migrations/20270109200017_custom_domain_cleanup.sql"));
    sql(`INSERT INTO auth.users VALUES ('65300000-0000-4000-8000-000000000001');
      INSERT INTO projects(id,owner_id,name,key) VALUES
        ('65300000-0000-4000-8000-000000000002','65300000-0000-4000-8000-000000000001','Removal test','REM');
      INSERT INTO views(id,project_id,name) VALUES
        ('65300000-0000-4000-8000-000000000003','65300000-0000-4000-8000-000000000002','Public view');
      INSERT INTO pages(id,project_id,position,title) VALUES
        ('65300000-0000-4000-8000-000000000004','65300000-0000-4000-8000-000000000002','a','Published page');
      INSERT INTO feedback_boards(id,project_id,token) VALUES
        ('65300000-0000-4000-8000-000000000005','65300000-0000-4000-8000-000000000002','board-token');
      INSERT INTO view_shares(id,view_id,page_id,level,token) VALUES
        ('65300000-0000-4000-8000-000000000006','65300000-0000-4000-8000-000000000003',NULL,'public','view-token'),
        ('65300000-0000-4000-8000-000000000007',NULL,'65300000-0000-4000-8000-000000000004','public','page-token');
      INSERT INTO custom_domains(domain,board_id,share_id,status) VALUES
        ('feedback.example.test','65300000-0000-4000-8000-000000000005',NULL,'verified'),
        ('view.example.test',NULL,'65300000-0000-4000-8000-000000000006','pending'),
        ('page.example.test',NULL,'65300000-0000-4000-8000-000000000007','verified');
      INSERT INTO custom_domain_cleanup(domain) VALUES ('old.example.test');
      SELECT acquire_custom_domain_lease('old.example.test');
      SELECT activate_custom_domain_verification();
      INSERT INTO provider_operation_reservations(actor_id,provider,operation,resource_key,lease_expires_at)
        SELECT '65300000-0000-4000-8000-000000000001',provider,'test','test',now()
        FROM unnest(ARRAY['vercel-domains','vercel-domain-names','github']) provider;`);
    const audit = () => JSON.parse(sql(read("scripts/encryption-schema-audit.sql")));
    const before = audit();
    const retained = () => sql(`SELECT jsonb_build_object(
      'boards', (SELECT jsonb_agg(to_jsonb(b)) FROM feedback_boards b),
      'shares', (SELECT jsonb_agg(to_jsonb(s) ORDER BY s.id) FROM view_shares s),
      'pages', (SELECT jsonb_agg(to_jsonb(p)) FROM pages p),
      'views', (SELECT jsonb_agg(to_jsonb(v)) FROM views v))`);
    const content = retained();
    sql(read(migration));
    const after = audit();
    assert.equal(retained(), content, "Public rows and tokens are preserved");
    for (const table of removedTables) {
      assert.equal(after.tables[table], undefined);
      delete before.tables[table];
    }
    assert.deepEqual(after.tables, before.tables, "Other table definitions are unchanged");
    assert.ok(!Object.keys(after.functions).some((name) => /custom_domain|remove_disabled_board_domains|remove_unpublished_content_domains/.test(name)));
    assert.ok(!Object.keys(after.triggers ?? {}).some((name) => name.includes("custom_domain")));
    assert.equal(sql("SELECT string_agg(provider, ',') FROM provider_operation_reservations"), "github");
    assert.equal(sql("SELECT has_function_privilege('authenticated','revoke_view_share_guarded(uuid)','EXECUTE')"), "f");
    assert.equal(sql("SELECT has_function_privilege('service_role','revoke_view_share_guarded(uuid)','EXECUTE')"), "t");
    assert.equal(sql("SELECT revoke_view_share_guarded('65300000-0000-4000-8000-000000000003')->>'status'"), "revoked");
    assert.equal(sql("SELECT revoke_view_share_guarded('65300000-0000-4000-8000-000000000003')->>'status'"), "absent");
    assert.equal(sql("SELECT token FROM view_shares WHERE page_id IS NOT NULL"), "page-token");
    // Target updates must no longer execute triggers referencing deleted tables.
    sql("UPDATE feedback_boards SET enabled=false; UPDATE pages SET deleted_at=now(); UPDATE projects SET deleted_at=now();");
    const output = process.env.MINDDY_DOMAIN_REMOVAL_AUDIT;
    if (output) writeFileSync(output, `${JSON.stringify(after, null, 2)}\n`);
  } finally {
    docker("dropdb", "-U", "postgres", database);
  }
});
