import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import test from "node:test";

import { RootKeyCrypto } from "../lib/server/encryption/root-key-crypto.mjs";
import { buildRootSwapSql, parseRegistryOutput, planRootRewrap, verifyRootRecords } from "./rewrap-data-root.mjs";

test("root rewrap preserves each versioned data key and its purpose", async () => {
  const oldRoot = randomBytes(32).toString("hex");
  const nextRoot = randomBytes(32).toString("hex");
  const rows = [];
  const plaintext = new Map();
  for (const purpose of ["content", "blind_index"]) {
    const crypto = new RootKeyCrypto(oldRoot, purpose);
    for (const version of [1, 2]) {
      const scope = { kind: "project", id: randomUUID() };
      const generated = await crypto.generate(scope);
      const row = {
        scope_kind: scope.kind, scope_id: scope.id, purpose, version,
        wrapped_key: Buffer.from(generated.wrappedKey).toString("base64"),
      };
      rows.push(row);
      plaintext.set(`${scope.id}:${purpose}:${version}`, Buffer.from(generated.bytes));
      generated.bytes.fill(0);
    }
  }
  const parsed = parseRegistryOutput(rows.map((row) => JSON.stringify(row)).join("\n"));
  assert.equal(await verifyRootRecords(parsed, oldRoot), rows.length);
  await assert.rejects(verifyRootRecords(parsed, nextRoot), /Unable to unwrap/);
  const plan = await planRootRewrap(parsed, oldRoot, nextRoot);
  assert.equal(plan.length, rows.length);
  for (const row of plan) {
    const scope = { kind: row.scope_kind, id: row.scope_id };
    const expected = plaintext.get(`${row.scope_id}:${row.purpose}:${row.version}`);
    const next = new RootKeyCrypto(nextRoot, row.purpose);
    const recovered = await next.unwrap({
      scope, version: row.version, wrappedKey: Buffer.from(row.next_wrapped_key, "base64"),
    });
    assert.deepEqual(recovered, expected);
    await assert.rejects(new RootKeyCrypto(oldRoot, row.purpose).unwrap({
      scope, version: row.version, wrappedKey: Buffer.from(row.next_wrapped_key, "base64"),
    }));
    recovered.fill(0);
    expected.fill(0);
  }
  assert.match(buildRootSwapSql(plan), /LOCK TABLE public\.envelope_data_keys IN ACCESS EXCLUSIVE MODE/);
  assert.match(buildRootSwapSql(plan), /data key registry changed during root rewrap/);
});

test("root rewrap rejects duplicate, malformed and wrong-root records before SQL", async () => {
  const oldRoot = randomBytes(32).toString("hex");
  const nextRoot = randomBytes(32).toString("hex");
  const scope = { kind: "user", id: randomUUID() };
  const key = await new RootKeyCrypto(oldRoot).generate(scope);
  const row = { scope_kind: scope.kind, scope_id: scope.id, purpose: "content", version: 1,
    wrapped_key: Buffer.from(key.wrappedKey).toString("base64") };
  key.bytes.fill(0);
  assert.throws(() => parseRegistryOutput(`${JSON.stringify(row)}\n${JSON.stringify(row)}`), /Duplicate/);
  assert.throws(() => parseRegistryOutput(JSON.stringify({ ...row, scope_id: "invalid" })), /Invalid/);
  await assert.rejects(planRootRewrap([row], nextRoot, oldRoot), /Unable to unwrap/);
  await assert.rejects(planRootRewrap([row], oldRoot, oldRoot), /distinct/);
  assert.equal(buildRootSwapSql([]).includes("INSERT INTO pg_temp.minddy_root_rewrap"), false);
});
