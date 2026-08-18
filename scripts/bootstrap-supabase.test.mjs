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
import { checkLocalConfig, verificationSql } from "./verify-supabase-bootstrap.mjs";
import { BASELINE_VERSION } from "./repair-squashed-migration-history.mjs";

test("le baseline est compact, trié et porte l'extension vector", () => {
  const migrations = listMigrations();
  assert.equal(migrations.length, 2);
  assert.deepEqual([...migrations].sort(), migrations);
  assert.equal(migrations[0], "20270106090000_baseline.sql");
  assert.equal(migrations[1], "20270106091000_initial_data.sql");
  assert.equal(migrations[0].split("_")[0], BASELINE_VERSION);
});

test("le fichier d'environnement est complété sans remplacer les valeurs existantes", () => {
  const directory = mkdtempSync(join(tmpdir(), "minddy-bootstrap-"));
  const file = join(directory, ".env.local");
  try {
    writeFileSync(file, "CRON_SECRET=secret-existant\n# commentaire\n", { mode: 0o600 });
    const values = {
      CRON_SECRET: "ne-doit-pas-remplacer",
      GIT_STATE_SECRET: "secret-nouveau",
      NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
    };

    assert.deepEqual(appendMissingEnv(file, values), ["GIT_STATE_SECRET", "NEXT_PUBLIC_SUPABASE_URL"]);
    assert.deepEqual(appendMissingEnv(file, values), []);

    const parsed = parseEnv(readFileSync(file, "utf8"));
    assert.equal(parsed.get("CRON_SECRET"), "secret-existant");
    assert.equal(parsed.get("GIT_STATE_SECRET"), "secret-nouveau");
    assert.equal(parsed.get("NEXT_PUBLIC_SUPABASE_URL"), "http://127.0.0.1:54321");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("le mode distant exige une URL de base et le vérificateur couvre les invariants", () => {
  assert.equal(parseArgs([]).local, true);
  assert.equal(parseArgs(["--", "--local"]).local, true);
  assert.equal(parseArgs(["--db-url", "postgresql://example"]).local, false);
  assert.throws(() => parseArgs(["--unknown"]), /option inconnue/);
  assert.doesNotThrow(() => checkLocalConfig());
  const sql = verificationSql();
  assert.match(sql, /vector_extension/);
  assert.match(sql, /attachments insert/);
  assert.match(sql, /supabase_realtime/);
  assert.match(sql, /members_receive_page_presence/);
});
