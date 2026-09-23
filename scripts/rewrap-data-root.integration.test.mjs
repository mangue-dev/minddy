import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { RootKeyCrypto } from "../lib/server/encryption/root-key-crypto.mjs";
import { runRootRewrap } from "./rewrap-data-root.mjs";

const enabled = process.env.MINDDY_ENCRYPTION_DB_TEST === "true";
const container = "supabase_db_minddy-encryption-test";
const template = "minddy_min591_full_audit";

function sql(database, input) {
  return execFileSync("docker", ["exec", "-i", container, "psql", "-X", "-At", "-v", "ON_ERROR_STOP=1",
    "-U", "supabase_admin", "-d", database], { input, encoding: "utf8" }).trim();
}

test("offline command rewraps all registry purposes and versions atomically", { skip: !enabled }, async () => {
  const database = `minddy_root_rewrap_${randomUUID().replaceAll("-", "")}`;
  const directory = mkdtempSync(join(tmpdir(), "minddy-root-rewrap-"));
  const oldRoot = randomBytes(32).toString("hex");
  const nextRoot = randomBytes(32).toString("hex");
  const scopeId = randomUUID();
  let created = false;
  try {
    sql("postgres", `CREATE DATABASE ${database} TEMPLATE ${template};`);
    created = true;
    for (const purpose of ["content", "blind_index"]) {
      const crypto = new RootKeyCrypto(oldRoot, purpose);
      for (const version of [1, 2]) {
        const generated = await crypto.generate({ kind: "project", id: scopeId });
        const wrapped = Buffer.from(generated.wrappedKey).toString("base64");
        generated.bytes.fill(0);
        sql(database, `INSERT INTO public.envelope_data_keys
          (scope_kind,scope_id,purpose,version,wrapped_key,is_current)
          VALUES('project','${scopeId}','${purpose}',${version},'${wrapped}',${version === 2});`);
      }
    }
    const before = JSON.parse(sql(database, "SELECT json_agg(k ORDER BY purpose,version) FROM public.envelope_data_keys k;"));
    const wrapper = join(directory, "psql");
    writeFileSync(wrapper, `#!/bin/sh
test -z "$MINDDY_DATA_ROOT_KEY" || exit 77
test -z "$MINDDY_DATA_NEXT_ROOT_KEY" || exit 77
exec docker exec -i ${container} psql -U supabase_admin -d "$PGDATABASE" "$@"
`, { mode: 0o700 });
    const env = { ...process.env, PATH: `${directory}:${process.env.PATH}`,
      PGHOST: "isolated-test", PGUSER: "supabase_admin", PGDATABASE: database,
      MINDDY_DATA_ROOT_KEY: oldRoot, MINDDY_DATA_NEXT_ROOT_KEY: nextRoot };
    assert.deepEqual(await runRootRewrap(["--verify-root"], env), { applied: false, count: 4 });
    assert.deepEqual(await runRootRewrap([], env), { applied: false, count: 4 });
    assert.deepEqual(await runRootRewrap(["--apply", "--confirm-writes-stopped"], env), { applied: true, count: 4 });
    const after = JSON.parse(sql(database, "SELECT json_agg(k ORDER BY purpose,version) FROM public.envelope_data_keys k;"));
    assert.deepEqual(after.map((row) => [row.scope_kind, row.scope_id, row.purpose, row.version, row.is_current]),
      before.map((row) => [row.scope_kind, row.scope_id, row.purpose, row.version, row.is_current]));
    assert.ok(after.every((row, index) => row.wrapped_key !== before[index].wrapped_key));
    assert.deepEqual(await runRootRewrap(["--verify-root"], { ...env, MINDDY_DATA_ROOT_KEY: nextRoot }),
      { applied: false, count: 4 });
    await assert.rejects(runRootRewrap(["--verify-root"], env), /Unable to unwrap/);
  } finally {
    if (created) sql("postgres", `DROP DATABASE ${database} WITH (FORCE);`);
    rmSync(directory, { recursive: true, force: true });
  }
});
