import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

const container = process.env.MINDDY_BACKFILL_TEST_CONTAINER;
const migration = readFileSync(new URL("../supabase/migrations/20270109200025_indexed_backfill_progress.sql", import.meta.url), "utf8");
const previous = readFileSync(new URL("../supabase/migrations/20270108160000_verified_row_migration_progress.sql", import.meta.url), "utf8");
function sql(database, input) {
  return execFileSync("docker", ["exec", "-i", container, "psql", "-X", "-Atq",
    "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", database], { input, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
}

test("indexed backfill preserves snapshot proofs, typed keys and service-only grants", { skip: !container }, (context) => {
  const database = `min633_${randomUUID().replaceAll("-", "")}`;
  const id = "00000000-0000-0000-0000-000000000001";
  sql("postgres", `CREATE DATABASE ${database};`);
  try {
    sql(database, `DO $$ BEGIN
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role; END IF;
    END $$;
    CREATE TABLE public.issues (id uuid PRIMARY KEY, title text,
      encryption_attempted_at timestamptz, encryption_checked_at timestamptz);
    CREATE TABLE public.forge_repository_names (provider text, token text,
      full_name_ciphertext text, encryption_attempted_at timestamptz,
      encryption_checked_at timestamptz, PRIMARY KEY(provider,token));
    CREATE TABLE public.github_issue_comment_syncs (issue_id uuid, remote_comment_id bigint,
      html_url text, html_url_encryption_attempted_at timestamptz,
      html_url_encryption_checked_at timestamptz, PRIMARY KEY(issue_id,remote_comment_id));
    CREATE FUNCTION public.assert_verified_progress() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF NEW.encryption_checked_at IS DISTINCT FROM OLD.encryption_checked_at AND
          current_setting('minddy.encryption_backfill_verified',true) IS DISTINCT FROM 'on' THEN
        RAISE EXCEPTION 'unverified progress';
      END IF;
      RETURN NEW;
    END $$;
    CREATE TRIGGER proof BEFORE UPDATE ON public.issues FOR EACH ROW EXECUTE FUNCTION public.assert_verified_progress();
    INSERT INTO public.issues(id,title) SELECT md5(i::text)::uuid,'Synthetic title' FROM generate_series(1,10000) i;
    INSERT INTO public.issues(id,title) VALUES('${id}','Current title');
    INSERT INTO public.forge_repository_names(provider,token,full_name_ciphertext) VALUES
      ('github','opaque','current ciphertext'),('gitlab','opaque','other ciphertext');
    INSERT INTO public.github_issue_comment_syncs(issue_id,remote_comment_id,html_url)
      VALUES('${id}',9223372036854775806,'fixture');
    ANALYZE public.issues;`);
    // Exercise a real upgrade, including existing execution grants.
    sql(database, "BEGIN;\n" + previous.slice(previous.indexOf("CREATE FUNCTION public.record_encryption_backfill_progress(")));
    const timing = () => JSON.parse(sql(database, `EXPLAIN (ANALYZE,FORMAT JSON)
      SELECT public.record_encryption_backfill_progress('issues','encryption_attempted_at','{"id":"${id}"}',false);`))[0]["Execution Time"];
    const before = Array.from({ length: 5 }, timing);
    sql(database, migration);
    const after = Array.from({ length: 5 }, timing);
    const median = (values) => [...values].sort((a, b) => a - b)[2];
    context.diagnostic(`Synthetic 10,001-row progress median: ${median(before)} ms before, ${median(after)} ms after`);
    const progress = (snapshot, verified = false) => sql(database,
      `SELECT public.record_encryption_backfill_progress('issues','encryption_attempted_at','${JSON.stringify(snapshot)}',${verified});`);
    assert.equal(progress({ id, title: "Current title" }), "t");
    assert.equal(sql(database, `SELECT encryption_attempted_at IS NOT NULL AND encryption_checked_at IS NULL FROM public.issues WHERE id='${id}';`), "t");
    assert.equal(progress({ id, title: "Stale title" }, true), "f");
    assert.equal(sql(database, `SELECT encryption_checked_at IS NULL FROM public.issues WHERE id='${id}';`), "t");
    assert.equal(progress({ id, title: "Current title" }, true), "t");
    assert.equal(sql(database, `SELECT encryption_checked_at IS NOT NULL FROM public.issues WHERE id='${id}';`), "t");
    assert.equal(progress({ id: "00000000-0000-0000-0000-000000000002" }), "f");
    for (const snapshot of [{}, { id: null }, { title: "Missing identity" }]) {
      assert.throws(() => progress(snapshot), /invalid_backfill_(identity|progress)/);
    }
    assert.throws(() => progress({ id: "invalid" }), /invalid input syntax for type uuid/);
    assert.throws(() => sql(database, `SELECT public.record_encryption_backfill_progress('issues','title','{"id":"${id}"}',true);`), /invalid_backfill_progress/);
    assert.equal(sql(database, `SELECT public.record_encryption_backfill_progress('forge_repository_names','encryption_attempted_at',
      '{"provider":"github","token":"opaque","full_name_ciphertext":"current ciphertext"}',true);`), "t");
    assert.equal(sql(database, `SELECT encryption_checked_at IS NULL FROM public.forge_repository_names WHERE provider='gitlab';`), "t");
    assert.equal(sql(database, `SELECT public.record_encryption_backfill_progress('github_issue_comment_syncs','html_url_encryption_attempted_at',
      '{"issue_id":"${id}","remote_comment_id":9223372036854775806,"html_url":"fixture"}',true);`), "t");
    assert.equal(sql(database, `SELECT has_function_privilege('service_role','public.record_encryption_backfill_progress(text,text,jsonb,boolean)','EXECUTE')
      AND NOT has_function_privilege('authenticated','public.record_encryption_backfill_progress(text,text,jsonb,boolean)','EXECUTE')
      AND NOT has_function_privilege('anon','public.record_encryption_backfill_progress(text,text,jsonb,boolean)','EXECUTE');`), "t");
    const explain = sql(database, `EXPLAIN (ANALYZE,FORMAT JSON) SELECT * FROM public.issues t
      WHERE t.id = (pg_catalog.jsonb_populate_record(NULL::public.issues,'{"id":"${id}"}'::jsonb)).id FOR UPDATE;`);
    assert.match(explain, /Index Scan/);
    assert.match(explain, /issues_pkey/);
    assert.equal(sql(database, `BEGIN; SELECT public.record_encryption_backfill_progress('issues','encryption_attempted_at','{"id":"${id}"}',true);
      SELECT coalesce(current_setting('minddy.encryption_backfill_verified',true),'') = ''
        AND coalesce(current_setting('minddy.encryption_maintenance',true),'') = ''; ROLLBACK;`), "t\nt");
  } finally {
    sql("postgres", `DROP DATABASE ${database} WITH (FORCE);`);
  }
});
