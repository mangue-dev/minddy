import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  MINIMAL_LOCAL_EXCLUDES,
  appendMissingEnv,
  generatedSecrets,
  listMigrations,
  parseArgs,
  parseEnv,
} from "./bootstrap-supabase.mjs";
import { parseArgs as parseStorageArgs } from "./reconcile-storage-buckets.mjs";
import { checkLocalConfig, verificationSql } from "./verify-supabase-bootstrap.mjs";
import { BASELINE_VERSION } from "./repair-squashed-migration-history.mjs";

test("minimal local mode skips only services that minddy does not require", () => {
  const options = parseArgs(["--minimal", "--app-url", "http://localhost:6463"]);
  assert.equal(options.local, true);
  assert.equal(options.minimal, true);
  assert.equal(options.appUrl, "http://localhost:6463");
  assert.deepEqual(MINIMAL_LOCAL_EXCLUDES, [
    "studio",
    "imgproxy",
    "postgres-meta",
    "edge-runtime",
    "logflare",
    "vector",
    "supavisor",
    "mailpit",
  ]);
});

test("bootstrap generates optional secrets only for selected capabilities", () => {
  const minimal = generatedSecrets();
  assert.ok(minimal.AI_KEY_ENCRYPTION_SECRET);
  assert.ok(minimal.FEEDBACK_SSO_ENCRYPTION_SECRET);
  assert.equal(minimal.GIT_STATE_SECRET, undefined);
  assert.equal(minimal.CRON_SECRET, undefined);

  const selected = generatedSecrets(new Set(["github", "scheduler"]));
  assert.ok(selected.GIT_STATE_SECRET);
  assert.ok(selected.GIT_TOKEN_ENCRYPTION_SECRET);
  assert.ok(selected.CRON_SECRET);
  assert.deepEqual([...parseArgs(["--enable", "gitlab", "--enable", "scheduler"]).capabilities], ["gitlab", "scheduler"]);
  assert.throws(() => parseArgs(["--enable", "posthog"]), /unknown optional capability/);
});

test("migrations are sorted, include the vector extension, and repair Realtime policies", () => {
  const migrations = listMigrations();
  assert.equal(migrations.length, 5);
  assert.deepEqual([...migrations].sort(), migrations);
  assert.equal(migrations[0], "20270106090000_baseline.sql");
  assert.equal(migrations[1], "20270106091000_initial_data.sql");
  assert.equal(migrations[2], "20270106092000_reapply_realtime_policies.sql");
  assert.equal(
    migrations[3],
    "20270106094000_page_broadcast_and_pull_request_notification_deduplication.sql",
  );
  assert.equal(migrations[4], "20270106095000_github_issue_sync_metadata.sql");
  assert.equal(migrations[0].split("_")[0], BASELINE_VERSION);
});

test("the environment file is completed without replacing existing values", () => {
  const directory = mkdtempSync(join(tmpdir(), "minddy-bootstrap-"));
  const file = join(directory, ".env.local");
  try {
    writeFileSync(file, "CRON_SECRET=existing-secret\n# comment\n", { mode: 0o600 });
    const values = {
      CRON_SECRET: "must-not-replace",
      GIT_STATE_SECRET: "new-secret",
      MINDDY_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
    };

    assert.deepEqual(appendMissingEnv(file, values), ["GIT_STATE_SECRET", "MINDDY_PUBLIC_SUPABASE_URL"]);
    assert.deepEqual(appendMissingEnv(file, values), []);

    const parsed = parseEnv(readFileSync(file, "utf8"));
    assert.equal(parsed.get("CRON_SECRET"), "existing-secret");
    assert.equal(parsed.get("GIT_STATE_SECRET"), "new-secret");
    assert.equal(parsed.get("MINDDY_PUBLIC_SUPABASE_URL"), "http://127.0.0.1:54321");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("remote mode requires a database URL and the verifier covers invariants", () => {
  assert.equal(parseArgs([]).local, true);
  assert.equal(parseArgs(["--", "--local"]).local, true);
  assert.equal(parseArgs(["--db-url", "postgresql://example"]).local, false);
  assert.throws(() => parseArgs(["--unknown"]), /unknown option/);
  assert.throws(() => parseArgs(["--app-url", "localhost:6463"]), /absolute http\(s\) origin/);
  assert.doesNotThrow(() => checkLocalConfig());
  const sql = verificationSql();
  assert.match(sql, /vector_extension/);
  assert.match(sql, /attachments insert/);
  assert.match(sql, /supabase_realtime/);
  assert.match(sql, /members_receive_page_presence/);
});

test("local verification derives Storage credentials from Supabase status", () => {
  const options = parseStorageArgs(["--local"], () => ({
    supabaseUrl: "http://127.0.0.1:54321",
    serviceRoleKey: "local-service-role",
  }));
  assert.equal(options.local, true);
  assert.equal(options.supabaseUrl, "http://127.0.0.1:54321");
  assert.equal(options.serviceRoleKey, "local-service-role");
});
