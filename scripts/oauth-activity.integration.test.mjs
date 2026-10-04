import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { test } from "node:test";

test("OAuth activity RPC binds keys, stays monotonic and has service-only grants", async () => {
  const container = `minddy-min645-${randomUUID().slice(0, 8)}`;
  const sql = (statement) => execFileSync("docker", ["exec", "-i", container,
    "psql", "-X", "-At", "-v", "ON_ERROR_STOP=1", "-U", "postgres"], {
    input: statement, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"],
  }).trim();
  execFileSync("docker", ["run", "--rm", "-d", "--name", container,
    "-e", "POSTGRES_HOST_AUTH_METHOD=trust", "postgres:17"], { stdio: "pipe" });
  try {
    let ready = false;
    for (let attempt = 0; attempt < 50; attempt++) {
      try { sql("SELECT 1;"); ready = true; break; }
      catch { await new Promise(resolve => setTimeout(resolve, 200)); }
    }
    assert.ok(ready, "isolated PostgreSQL must become ready");
    // Use the real baseline table definitions; the RPC needs no Auth/Vault schema.
    const baseline = readFileSync("supabase/migrations/20270106090000_baseline.sql", "utf8");
    const tables = ["api_keys", "oauth_grants"].map(name => {
      const definition = baseline.match(new RegExp(`CREATE TABLE IF NOT EXISTS "public"\\."${name}" \\([\\s\\S]*?\\n\\);`));
      assert.ok(definition, `${name} baseline definition`);
      return definition[0];
    }).join("\n");
    sql(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; ${tables}`);
    sql(readFileSync("supabase/migrations/20270109200026_oauth_activity_bookkeeping.sql", "utf8"));
    assert.equal(sql(`SELECT has_function_privilege('anon',
      'public.touch_oauth_grant_activity(uuid,uuid,timestamptz)', 'EXECUTE'),
      has_function_privilege('authenticated',
      'public.touch_oauth_grant_activity(uuid,uuid,timestamptz)', 'EXECUTE'),
      has_function_privilege('service_role',
      'public.touch_oauth_grant_activity(uuid,uuid,timestamptz)', 'EXECUTE');`), "f|f|t");
    const grant = "00000000-0000-0000-0000-000000000001";
    const key = "00000000-0000-0000-0000-000000000002";
    const other = "00000000-0000-0000-0000-000000000003";
    sql(`INSERT INTO public.api_keys(id,user_id,name,key_hash,key_prefix)
      VALUES('${key}','${grant}','fixture','hash','prefix'),
      ('${other}','${grant}','other','hash','prefix');
      INSERT INTO public.oauth_grants(id,user_id,client_id,api_key_id)
      VALUES('${grant}','${grant}','fixture','${key}');`);
    const touch = (keyId, time = "2026-10-04T12:00:00Z") =>
      `SET ROLE service_role; SELECT public.touch_oauth_grant_activity('${grant}', '${keyId}', '${time}'); RESET ROLE;`;
    sql(touch(other));
    assert.equal(sql("SELECT count(*) FROM public.oauth_grants WHERE last_used_at IS NOT NULL;"), "0");
    sql(touch(key));
    assert.equal(sql(`SELECT g.last_used_at = '2026-10-04T12:00:00Z'::timestamptz,
      g.last_used_at = k.last_used_at FROM public.oauth_grants g
      JOIN public.api_keys k ON k.id = g.api_key_id;`), "t|t");
    sql(touch(key, "2026-10-04T11:00:00Z"));
    assert.equal(sql(`SELECT last_used_at = '2026-10-04T12:00:00Z'::timestamptz
      FROM public.oauth_grants;`), "t");
    sql("UPDATE public.oauth_grants SET revoked_at = now();");
    sql(touch(key, "2026-10-04T13:00:00Z"));
    assert.equal(sql(`SELECT last_used_at = '2026-10-04T12:00:00Z'::timestamptz
      FROM public.oauth_grants;`), "t");
    sql(`UPDATE public.oauth_grants SET revoked_at = NULL;
      CREATE FUNCTION public.fail_activity() RETURNS trigger LANGUAGE plpgsql AS
      $$ BEGIN RAISE EXCEPTION 'fixture_write_failure'; END; $$;
      CREATE TRIGGER fail_activity BEFORE UPDATE ON public.api_keys
      FOR EACH ROW EXECUTE FUNCTION public.fail_activity();`);
    assert.throws(() => sql(touch(key, "2026-10-04T13:00:00Z")), /fixture_write_failure/);
    assert.equal(sql(`SELECT last_used_at = '2026-10-04T12:00:00Z'::timestamptz
      FROM public.oauth_grants;`), "t", "both writes roll back atomically");
    if (process.env.MINDDY_OAUTH_ACTIVITY_AUDIT_OUTPUT) {
      const metadata = sql(readFileSync("scripts/encryption-schema-audit.sql", "utf8"));
      writeFileSync(process.env.MINDDY_OAUTH_ACTIVITY_AUDIT_OUTPUT, metadata);
    }
  } finally { execFileSync("docker", ["rm", "-f", container], { stdio: "pipe" }); }
});
