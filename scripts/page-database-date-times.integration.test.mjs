import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";

// Isolate the actual trigger and conversion migration from all account data.
test("database dates retain optional times through SQL validation and conversion", async () => {
  const container = `minddy-page-dates-${randomUUID().slice(0, 8)}`;
  const query = (input) => execFileSync("docker", ["exec", "-i", container,
    "psql", "-X", "-At", "-v", "ON_ERROR_STOP=1", "-h", "127.0.0.1", "-U", "postgres"], {
    input, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"],
  }).trim();
  const quote = (value) => `'${value.replaceAll("'", "''")}'`;
  const column = "10000000-0000-4000-8000-000000000001";
  const entry = "10000000-0000-4000-8000-000000000004";
  execFileSync("docker", ["run", "--rm", "-d", "--name", container,
    "--network", "none", "-e", "POSTGRES_HOST_AUTH_METHOD=trust", "postgres:17"], { stdio: "pipe" });
  try {
    let ready = false;
    for (let attempt = 0; attempt < 50; attempt++) {
      try { query("SELECT 1;"); ready = true; break; }
      catch { await new Promise(resolve => setTimeout(resolve, 200)); }
    }
    assert.ok(ready, "isolated PostgreSQL must become ready");
    query(`
      CREATE TABLE public.projects (id uuid PRIMARY KEY, owner_id uuid);
      CREATE TABLE public.project_members (project_id uuid, user_id uuid);
      CREATE TABLE public.pages (
        id uuid PRIMARY KEY, project_id uuid, parent_id uuid, deleted_at timestamptz,
        database_schema jsonb, database_title_name text, database_revision integer DEFAULT 0,
        property_values jsonb DEFAULT '{}', encryption_version integer DEFAULT 0
      );
    `);
    query(readFileSync("supabase/migrations/20270109200044_page_database_date_times.sql", "utf8"));
    query(`
      CREATE TRIGGER page_database_guard BEFORE INSERT OR UPDATE ON public.pages
        FOR EACH ROW EXECUTE FUNCTION public.validate_page_database();
      INSERT INTO public.projects VALUES ('10000000-0000-4000-8000-000000000002', NULL);
      INSERT INTO public.pages (id, project_id, database_schema) VALUES
        ('10000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000002',
         '[{"id":"${column}","name":"Delivery","type":"date"}]');
      INSERT INTO public.pages (id, project_id, parent_id) VALUES
        ('${entry}', '10000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000003');
    `);
    const write = (value) => query(`UPDATE public.pages SET property_values =
      jsonb_build_object('${column}', ${quote(JSON.stringify(value))}::jsonb) WHERE id = '${entry}';`);
    const convert = (value) => query(`SELECT public.convert_database_cell(
      '{"type":"text"}', 'date', ${quote(JSON.stringify(value))}::jsonb);`);
    for (const value of ["2028-02-29", "2026-10-12T00:00:00.000Z",
      "2026-10-12T14:30:00+02:00", "2026-10-12T01:30:00-07:00"]) {
      write(value);
      assert.equal(query(`SELECT property_values->>'${column}' FROM public.pages WHERE id='${entry}';`), value);
      assert.equal(convert(value), JSON.stringify(value));
    }
    for (const value of ["2026-02-29", "2026-04-31T12:30:00Z", "2026-10-12T24:00:00Z",
      "2026-10-12T12:60:00Z", "2026-10-12T12:00:60Z", "2026-10-12T12:00:00+16:00",
      "2026-10-12T12:00:00", "2026-10-12T12:00:00Z\n", "0000-01-01", "today"]) {
      assert.throws(() => write(value), undefined, `reject ${JSON.stringify(value)}`);
      assert.equal(convert(value), "", `conversion must reject ${JSON.stringify(value)}`);
    }
    write(null);
    assert.equal(query(`SELECT property_values->'${column}' FROM public.pages WHERE id='${entry}';`), "null");
    assert.equal(query("SELECT public.convert_database_cell('{\"type\":\"created_at\"}', 'date', '\"2026-10-12T14:30:00.000Z\"');"), '"2026-10-12"');
    assert.throws(() => query(`UPDATE public.pages SET database_schema =
      '[{"id":"${column}","name":"Delivery","type":"text"}]' WHERE id='10000000-0000-4000-8000-000000000003';`));
  } finally {
    execFileSync("docker", ["rm", "-f", container], { stdio: "pipe" });
  }
});
