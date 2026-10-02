import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const container = "supabase_db_minddy-encryption-test";
function sql(database, statement) {
  return execFileSync("docker", ["exec", "-i", container, "psql", "-X", "-q", "-At",
    "-v", "ON_ERROR_STOP=1", "-U", "supabase_admin", "-d", database],
  { input: statement, encoding: "utf8", maxBuffer: 8 * 1024 * 1024 }).trim();
}

const cases = [
  { name: "Agent Realtime durable cleartext", template: "minddy_min591_agent_realtime_root",
    script: "scripts/encryption-agent-realtime-regression.sql",
    marker: "-- APPLY_AGENT_REALTIME_MIGRATION_HERE",
    migration: "supabase/migrations/20270108010000_agent_realtime_content_refusal.sql", outerTransaction: true },
  { name: "Numo obsolete verification marker", template: "minddy_min591_final_review",
    script: "scripts/encryption-min591-numo-legacy-marker-regression.sql",
    marker: "-- APPLY_NUMO_ATTEMPT_AND_COMMENT_REALTIME_MIGRATION_HERE",
    migration: "supabase/migrations/20270108100000_min591_numo_attempts_and_comment_realtime.sql" },
  { name: "Comment Realtime historical cleartext", template: "minddy_min591_final_review",
    script: "scripts/encryption-min591-comment-realtime-history-regression.sql",
    marker: "-- APPLY_NUMO_ATTEMPT_AND_COMMENT_REALTIME_MIGRATION_HERE",
    migration: "supabase/migrations/20270108100000_min591_numo_attempts_and_comment_realtime.sql" },
];

for (const fixture of cases) test(`${fixture.name} reproduces before and rejects after its historical migration`, {
  skip: process.env.MINDDY_ENCRYPTION_DB_TEST !== "true", timeout: 30000,
}, () => {
  const database = `minddy_min591_historical_${randomUUID().replaceAll("-", "").slice(0, 12)}`;
  execFileSync("docker", ["exec", container, "createdb", "-U", "supabase_admin", "-T", fixture.template, database]);
  try {
    if (fixture.outerTransaction) {
      assert.equal(sql(database, "SELECT to_regclass('public.agent_run_live_snapshots') IS NULL;"), "t");
    } else {
      assert.equal(sql(database, `SELECT NOT EXISTS(SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name='numo_assistant_turns' AND column_name='tool_checkpoint_attempted_at');`), "t");
      assert.match(sql(database, "SELECT pg_get_functiondef('public.mark_numo_tool_content_attempt(text,uuid,text)'::regprocedure);"),
        /tool_checkpoint_checked_at = clock_timestamp/);
    }
    const script = readFileSync(fixture.script, "utf8");
    let migration = readFileSync(fixture.migration, "utf8");
    if (fixture.outerTransaction) {
      const lines = migration.split("\n");
      assert.equal(lines.filter((line) => line === "BEGIN;").length, 1);
      assert.equal(lines.filter((line) => line === "COMMIT;").length, 1);
      migration = lines.filter((line) => line !== "BEGIN;" && line !== "COMMIT;").join("\n");
    }
    assert.equal(script.split(fixture.marker).length, 2);
    sql(database, script.replace(fixture.marker, () => migration));
  } finally {
    execFileSync("docker", ["exec", container, "dropdb", "-U", "supabase_admin", "--if-exists", "--force", database]);
  }
});
