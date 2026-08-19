import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  appendMissingEnv,
  listMigrations,
  parseArgs,
  parseEnv,
} from "./bootstrap-supabase.mjs";
import { parseArgs as parseStorageArgs } from "./reconcile-storage-buckets.mjs";
import { checkLocalConfig, verificationSql } from "./verify-supabase-bootstrap.mjs";
import { BASELINE_VERSION } from "./repair-squashed-migration-history.mjs";

test("migrations are sorted, include the vector extension, and repair Realtime policies", () => {
  const migrations = listMigrations();
  assert.equal(migrations.length, 4);
  assert.deepEqual([...migrations].sort(), migrations);
  assert.equal(migrations[0], "20270106090000_baseline.sql");
  assert.equal(migrations[1], "20270106091000_initial_data.sql");
  assert.equal(migrations[2], "20270106092000_reapply_realtime_policies.sql");
  assert.equal(
    migrations[3],
    "20270106094000_page_broadcast_and_pull_request_notification_deduplication.sql",
  );
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
      NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
    };

    assert.deepEqual(appendMissingEnv(file, values), ["GIT_STATE_SECRET", "NEXT_PUBLIC_SUPABASE_URL"]);
    assert.deepEqual(appendMissingEnv(file, values), []);

    const parsed = parseEnv(readFileSync(file, "utf8"));
    assert.equal(parsed.get("CRON_SECRET"), "existing-secret");
    assert.equal(parsed.get("GIT_STATE_SECRET"), "new-secret");
    assert.equal(parsed.get("NEXT_PUBLIC_SUPABASE_URL"), "http://127.0.0.1:54321");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("remote mode requires a database URL and the verifier covers invariants", () => {
  assert.equal(parseArgs([]).local, true);
  assert.equal(parseArgs(["--", "--local"]).local, true);
  assert.equal(parseArgs(["--db-url", "postgresql://example"]).local, false);
  assert.throws(() => parseArgs(["--unknown"]), /unknown option/);
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
