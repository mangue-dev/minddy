import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("Smart Triage migration converts legacy modes and rejects AI reactivation", async () => {
  const container = `minddy-min642-${randomUUID().slice(0, 8)}`;
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
    // Only routing metadata changes; no content or issue positions are involved.
    sql(`CREATE TABLE public.projects(id integer PRIMARY KEY,
      smart_triage_mode text NOT NULL DEFAULT 'rules', deleted_at timestamptz,
      CONSTRAINT projects_smart_triage_mode_check CHECK (smart_triage_mode IN ('rules', 'jev', 'off')));
      INSERT INTO public.projects VALUES (1, 'rules', NULL), (2, 'jev', NULL),
        (3, 'off', NULL), (4, 'jev', now());`);
    const migration = readFileSync("supabase/migrations/20270109200027_rules_only_smart_triage.sql", "utf8");
    sql(migration);
    assert.equal(sql("SELECT string_agg(smart_triage_mode, ',' ORDER BY id) FROM public.projects;"), "rules,rules,rules,rules");
    sql("INSERT INTO public.projects(id) VALUES (5);");
    assert.equal(sql("SELECT smart_triage_mode FROM public.projects WHERE id = 5;"), "rules");
    for (const mode of ["jev", "off"]) {
      assert.throws(() => sql(`UPDATE public.projects SET smart_triage_mode = '${mode}' WHERE id = 1;`), /projects_smart_triage_mode_check/);
      assert.throws(() => sql(`INSERT INTO public.projects VALUES (6, '${mode}', NULL);`), /projects_smart_triage_mode_check/);
    }
    sql(migration);
    assert.equal(sql("SELECT count(*) FROM public.projects WHERE smart_triage_mode = 'rules';"), "5");
  } finally { execFileSync("docker", ["rm", "-f", container], { stdio: "pipe" }); }
});
