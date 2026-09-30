#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

import { isValidDataRootKey, RootKeyCrypto } from "../lib/server/encryption/root-key-crypto.mjs";

const PURPOSES = ["content", "blind_index"];
const KINDS = ["project", "user", "system"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const READ_SQL = `SELECT json_build_object(
  'scope_kind', scope_kind, 'scope_id', scope_id, 'purpose', purpose,
  'version', version, 'wrapped_key', wrapped_key)
FROM public.envelope_data_keys
ORDER BY scope_kind, scope_id, purpose, version;`;

function identity(row) {
  return `${row.scope_kind}:${row.scope_id}:${row.purpose}:${row.version}`;
}

function parseRecord(row) {
  if (!row || !KINDS.includes(row.scope_kind) || !UUID.test(row.scope_id) ||
      !PURPOSES.includes(row.purpose) || !Number.isSafeInteger(row.version) || row.version < 1 ||
      typeof row.wrapped_key !== "string" || !/^[A-Za-z0-9+/]+={0,2}$/.test(row.wrapped_key)) {
    throw new Error("Invalid data key registry record");
  }
  const wrapped = Buffer.from(row.wrapped_key, "base64");
  if (!wrapped.length || wrapped.toString("base64") !== row.wrapped_key) {
    throw new Error("Invalid wrapped data key encoding");
  }
  return { ...row, wrapped };
}

export function parseRegistryOutput(output) {
  if (typeof output !== "string") throw new Error("Invalid registry output");
  const records = [];
  const seen = new Set();
  for (const line of output.split("\n")) {
    if (!line.trim()) continue;
    let raw;
    try { raw = JSON.parse(line); } catch { throw new Error("Invalid registry output"); }
    const record = parseRecord(raw);
    const id = identity(record);
    if (seen.has(id)) throw new Error("Duplicate data key registry record");
    seen.add(id);
    records.push(record);
  }
  return records;
}

export async function planRootRewrap(records, oldRoot, nextRoot) {
  if (!isValidDataRootKey(oldRoot) || !isValidDataRootKey(nextRoot) ||
      oldRoot.toLowerCase() === nextRoot.toLowerCase()) {
    throw new Error("Provide distinct 32-byte old and next root keys");
  }
  const oldWrappers = Object.fromEntries(PURPOSES.map((purpose) => [purpose, new RootKeyCrypto(oldRoot, purpose)]));
  const nextWrappers = Object.fromEntries(PURPOSES.map((purpose) => [purpose, new RootKeyCrypto(nextRoot, purpose)]));
  const plan = [];
  for (const raw of records) {
    const row = parseRecord(raw);
    const scope = { kind: row.scope_kind, id: row.scope_id };
    const record = { scope, version: row.version, wrappedKey: row.wrapped };
    const bytes = await oldWrappers[row.purpose].unwrap(record);
    try {
      const nextWrapped = nextWrappers[row.purpose].wrap(scope, bytes);
      const verified = await nextWrappers[row.purpose].unwrap({ ...record, wrappedKey: nextWrapped });
      try {
        if (!verified.equals(bytes)) throw new Error("Root key rewrap verification failed");
      } finally {
        verified.fill(0);
      }
      plan.push({
        scope_kind: row.scope_kind, scope_id: row.scope_id, purpose: row.purpose,
        version: row.version, old_wrapped_key: row.wrapped_key,
        next_wrapped_key: nextWrapped.toString("base64"),
        data_key_digest: createHash("sha256").update(bytes).digest("hex"),
      });
    } finally {
      bytes.fill(0);
    }
  }
  return plan;
}

export async function verifyRootRecords(records, root) {
  if (!isValidDataRootKey(root)) throw new Error("Provide a 32-byte data root key");
  const wrappers = Object.fromEntries(PURPOSES.map((purpose) => [purpose, new RootKeyCrypto(root, purpose)]));
  for (const raw of records) {
    const row = parseRecord(raw);
    const bytes = await wrappers[row.purpose].unwrap({
      scope: { kind: row.scope_kind, id: row.scope_id },
      version: row.version, wrappedKey: row.wrapped,
    });
    bytes.fill(0);
  }
  return records.length;
}

function literal(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

export function buildRootSwapSql(plan) {
  const inserts = [];
  for (let offset = 0; offset < plan.length; offset += 500) {
    const values = plan.slice(offset, offset + 500).map((row) =>
      `(${literal(row.scope_kind)},${literal(row.scope_id)},${literal(row.purpose)},${row.version},` +
      `${literal(row.old_wrapped_key)},${literal(row.next_wrapped_key)})`).join(",\n");
    inserts.push(`INSERT INTO pg_temp.minddy_root_rewrap VALUES\n${values};`);
  }
  return `BEGIN;
LOCK TABLE public.envelope_data_keys IN ACCESS EXCLUSIVE MODE;
CREATE TEMP TABLE minddy_root_rewrap (
  scope_kind text NOT NULL, scope_id uuid NOT NULL, purpose text NOT NULL,
  version integer NOT NULL, old_wrapped_key text NOT NULL,
  next_wrapped_key text NOT NULL,
  PRIMARY KEY (scope_kind, scope_id, purpose, version)
) ON COMMIT DROP;
${inserts.join("\n")}
DO $rewrap$
DECLARE expected_count bigint; actual_count bigint; changed_count bigint;
BEGIN
  SELECT count(*) INTO expected_count FROM pg_temp.minddy_root_rewrap;
  SELECT count(*) INTO actual_count FROM public.envelope_data_keys;
  IF actual_count <> expected_count OR EXISTS (
    SELECT 1 FROM public.envelope_data_keys k
    FULL JOIN pg_temp.minddy_root_rewrap r
      USING (scope_kind, scope_id, purpose, version)
    WHERE k.scope_kind IS NULL OR r.scope_kind IS NULL
      OR k.wrapped_key IS DISTINCT FROM r.old_wrapped_key
  ) THEN
    RAISE EXCEPTION 'data key registry changed during root rewrap';
  END IF;
  UPDATE public.envelope_data_keys k SET wrapped_key = r.next_wrapped_key
    FROM pg_temp.minddy_root_rewrap r
    WHERE k.scope_kind = r.scope_kind AND k.scope_id = r.scope_id
      AND k.purpose = r.purpose AND k.version = r.version;
  GET DIAGNOSTICS changed_count = ROW_COUNT;
  IF changed_count <> expected_count THEN
    RAISE EXCEPTION 'incomplete root rewrap';
  END IF;
END;
$rewrap$;
COMMIT;`;
}

function psql(sql, env) {
  const childEnv = { ...env };
  delete childEnv.MINDDY_DATA_ROOT_KEY;
  delete childEnv.MINDDY_DATA_NEXT_ROOT_KEY;
  const result = spawnSync("psql", ["-X", "-A", "-t", "-q", "-v", "ON_ERROR_STOP=1"], {
    env: childEnv, input: sql, encoding: "utf8", maxBuffer: 256 * 1024 * 1024,
  });
  if (result.error || result.status !== 0) {
    throw new Error("PostgreSQL root rewrap command failed; inspect database access and transaction state");
  }
  return result.stdout;
}

export async function runRootRewrap(args = process.argv.slice(2), env = process.env) {
  const apply = args.includes("--apply");
  const verify = args.includes("--verify-root");
  if (args.some((arg) => !["--apply", "--confirm-writes-stopped", "--verify-root"].includes(arg)) ||
      apply && !args.includes("--confirm-writes-stopped") ||
      verify && (apply || args.includes("--confirm-writes-stopped"))) {
    throw new Error("Usage: node scripts/rewrap-data-root.mjs [--verify-root | --apply --confirm-writes-stopped]");
  }
  if (!env.PGHOST || !env.PGUSER || !env.PGDATABASE) {
    throw new Error("Set PGHOST, PGUSER and PGDATABASE for the administrative database connection");
  }
  const records = parseRegistryOutput(psql(READ_SQL, env));
  if (verify) {
    const count = await verifyRootRecords(records, env.MINDDY_DATA_ROOT_KEY);
    process.stdout.write(`Root key verified against ${count} wrapped data keys.\n`);
    return { applied: false, count };
  }
  const plan = await planRootRewrap(records, env.MINDDY_DATA_ROOT_KEY, env.MINDDY_DATA_NEXT_ROOT_KEY);
  if (!apply) {
    process.stdout.write(`Root rewrap dry run verified ${plan.length} wrapped data keys.\n`);
    return { applied: false, count: plan.length };
  }
  psql(buildRootSwapSql(plan), env);
  try {
    const after = parseRegistryOutput(psql(READ_SQL, env));
    if (after.length !== plan.length) throw new Error("Registry row count changed");
    const expected = new Map(plan.map((row) => [identity(row), row]));
    const nextWrappers = Object.fromEntries(PURPOSES.map((purpose) =>
      [purpose, new RootKeyCrypto(env.MINDDY_DATA_NEXT_ROOT_KEY, purpose)]));
    for (const row of after) {
      const prior = expected.get(identity(row));
      if (!prior || row.wrapped_key !== prior.next_wrapped_key) throw new Error("Registry row mismatch");
      const bytes = await nextWrappers[row.purpose].unwrap({
        scope: { kind: row.scope_kind, id: row.scope_id },
        version: row.version, wrappedKey: row.wrapped,
      });
      try {
        if (createHash("sha256").update(bytes).digest("hex") !== prior.data_key_digest) {
          throw new Error("Data key mismatch");
        }
      } finally {
        bytes.fill(0);
      }
    }
  } catch {
    throw new Error("Root rewrap committed but verification failed; keep Minddy stopped and investigate before restarting");
  }
  process.stdout.write(`Root rewrap committed and verified ${plan.length} wrapped data keys. Configure the next root before restarting Minddy.\n`);
  return { applied: true, count: plan.length };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  runRootRewrap().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
