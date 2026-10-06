import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("admin data minimisation migration enforces exact lookup and minimal signals", async () => {
  const container = `minddy-min637-${randomUUID().slice(0, 8)}`;
  const sql = (statement) => execFileSync("docker", ["exec", "-i", container,
    "psql", "-h", "127.0.0.1", "-X", "-At", "-v", "ON_ERROR_STOP=1", "-U", "postgres"], {
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
    // Deliberately no usage, activity, avatars or keys tables: these reads must not need them.
    sql(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE SCHEMA auth;
      CREATE TABLE auth.users(id uuid PRIMARY KEY, email text, raw_user_meta_data jsonb,
        raw_app_meta_data jsonb, deleted_at timestamptz, email_confirmed_at timestamptz);
      CREATE TABLE public.projects(id uuid PRIMARY KEY, owner_id uuid, deleted_at timestamptz);
      CREATE TABLE public.project_members(project_id uuid, user_id uuid);
      CREATE TABLE public.issues(id uuid PRIMARY KEY, project_id uuid);
      CREATE FUNCTION public.get_admin_users_overview(text, integer, integer)
        RETURNS integer LANGUAGE sql AS 'SELECT 1';
      INSERT INTO auth.users VALUES
        ('00000000-0000-4000-8000-000000000001', 'owner@example.test',
         '{"display_name":"  Owner  ","private_note":"secret","onboarding_started":true,"onboarding_steps":["numo","mcp"],"onboarding_version":2,"cycles_enabled":true}', '{}', NULL, now()),
        ('00000000-0000-4000-8000-000000000002', 'member@example.test', '{}', '{}', NULL, NULL),
        ('00000000-0000-4000-8000-000000000003', 'internal@example.test', '{"onboarding_started":true}', '{"internal":true}', NULL, now()),
        ('00000000-0000-4000-8000-000000000004', 'deleted@example.test', '{}', '{}', now(), now()),
        ('00000000-0000-4000-8000-000000000005', 'percent%@example.test', '{}', '{}', NULL, now());
      INSERT INTO public.projects VALUES
        ('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001', NULL),
        ('10000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000005', now());
      INSERT INTO public.project_members VALUES ('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002');
      INSERT INTO public.issues VALUES
        ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001'),
        ('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002');`);
    sql(readFileSync("supabase/migrations/20270109200030_admin_data_minimisation.sql", "utf8"));
    assert.equal(sql("SELECT to_regprocedure('public.get_admin_users_overview(text,integer,integer)') IS NULL;"), "t");
    const lookup = (email) => JSON.parse(sql(`SELECT coalesce(jsonb_agg(to_jsonb(a)), '[]') FROM public.get_admin_account('${email}') a;`));
    assert.equal(lookup("").length, 0);
    assert.equal(lookup("owner").length, 0);
    assert.equal(lookup("%@example.test").length, 0);
    assert.equal(lookup("deleted@example.test").length, 0);
    assert.equal(lookup("percent%@example.test").length, 1);
    assert.deepEqual(lookup(" OWNER@EXAMPLE.TEST ")[0], {
      user_id: "00000000-0000-4000-8000-000000000001", email: "owner@example.test", name: "Owner", is_internal: false, email_confirmed: true,
    });
    assert.equal(sql("SELECT count(*) FROM public.get_admin_account(NULL, '00000000-0000-4000-8000-000000000002');"), "1");
    assert.equal(sql("SELECT count(*) FROM public.get_admin_account('owner@example.test', '00000000-0000-4000-8000-000000000002');"), "0");
    const signals = JSON.parse(sql("SELECT jsonb_agg(to_jsonb(s)) FROM public.get_admin_onboarding_signals() s;"));
    assert.equal(signals.length, 4);
    assert.deepEqual(signals.map(s => [s.has_project, s.has_issue]), [[true,true],[true,true],[false,false],[false,false]]);
    assert.deepEqual(Object.keys(signals[0]).sort(), ["has_issue", "has_project", "is_internal", "meta", "user_id"]);
    assert.deepEqual(Object.keys(signals[0].meta).sort(), ["cycles_enabled", "onboarding_started", "onboarding_steps", "onboarding_version"]);
    assert.deepEqual(signals[2].meta, {});
    assert.equal(sql("SELECT count(*) FROM public.get_admin_onboarding_signals(0, 0);"), "0");
    assert.equal(sql("SELECT user_id FROM public.get_admin_onboarding_signals(1, 1);"), signals[1].user_id);
    for (const signature of ["get_admin_account(text,uuid)", "get_admin_onboarding_signals(integer,integer)"]) {
      for (const role of ["anon", "authenticated"]) {
        assert.equal(sql(`SELECT has_function_privilege('${role}', 'public.${signature}', 'EXECUTE');`), "f");
        assert.throws(() => sql(`SET ROLE ${role}; SELECT * FROM public.${signature.startsWith("get_admin_account") ? "get_admin_account(NULL,NULL)" : "get_admin_onboarding_signals()"};`), /permission denied/);
      }
      assert.equal(sql(`SELECT has_function_privilege('service_role', 'public.${signature}', 'EXECUTE');`), "t");
    }
    // A full page must never be truncated or expanded past the hard SQL bound.
    sql(`INSERT INTO auth.users(id, email) SELECT md5('fixture-' || n)::uuid, 'fixture-' || n || '@example.test' FROM generate_series(1, 600) n;`);
    assert.equal(sql("SELECT count(*) FROM public.get_admin_onboarding_signals(10000, 0);"), "500");
    assert.equal(sql("SET ROLE service_role; SELECT count(*) FROM public.get_admin_onboarding_signals(500, 500);"), "SET\n104");
  } finally {
    execFileSync("docker", ["rm", "-f", container], { stdio: "pipe" });
  }
});
