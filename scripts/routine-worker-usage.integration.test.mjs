import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("routine worker charges survive repair and aggregate across resumed turns", async () => {
  const container = `minddy-min650-${randomUUID().slice(0, 8)}`;
  const query = (input) => execFileSync("docker", ["exec", "-i", container,
    "psql", "-X", "-At", "-v", "ON_ERROR_STOP=1", "-h", "127.0.0.1", "-U", "postgres"], {
    input, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"],
  }).trim();
  execFileSync("docker", ["run", "--rm", "-d", "--name", container,
    "--network", "none", "-e", "POSTGRES_HOST_AUTH_METHOD=trust", "postgres:17"], { stdio: "pipe" });
  try {
    let ready = false;
    for (let attempt = 0; attempt < 50; attempt++) {
      try { query("SELECT 1;"); ready = true; break; }
      catch { await new Promise(resolve => setTimeout(resolve, 200)); }
    }
    assert.ok(ready, "isolated PostgreSQL must become ready");
    const migration = readFileSync("supabase/migrations/20270109200028_routine_worker_usage.sql", "utf8");
    const fixture = readFileSync("test/routine-worker-usage-fixture.sql", "utf8")
      .replaceAll("\\ir ../supabase/migrations/20270109200028_routine_worker_usage.sql", () => migration);
    query(fixture);
    assert.equal(query("SELECT count(*) FROM public.ai_usage;"), "1206");
  } finally {
    execFileSync("docker", ["rm", "-f", container], { stdio: "pipe" });
  }
});
