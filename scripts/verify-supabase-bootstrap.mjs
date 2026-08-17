#!/usr/bin/env node
/** MIN-379 — vérifie une instance après `scripts/bootstrap-supabase.mjs`. */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { EXPECTED_BUCKETS, parseArgs as parseStorageArgs, reconcileBuckets } from "./reconcile-storage-buckets.mjs";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = resolve(SCRIPT_DIR, "..");
const CONFIG_PATH = resolve(ROOT_DIR, "supabase/config.toml");
const REQUIRED_CONFIG = [
  'jwt_expiry = 3600',
  'enable_refresh_token_rotation = true',
  'enabled = true',
  'extra_search_path = ["public", "extensions"]',
];
const REQUIRED_APP_CONFIG = [
  "assistant_model",
  "fallback_model",
  "transcription_model",
  "dictate_model",
  "smart_assign_model",
  "feedback_analysis_model",
  "feedback_embedding_model",
  "feedback_classify_enabled",
  "agent_model",
];
const REQUIRED_TABLES = ["projects", "issues", "attachments", "feedback_posts", "pages", "agent_runs"];

function fail(message) {
  throw new Error(`Vérification Supabase échouée : ${message}`);
}

export function parseArgs(argv) {
  return parseStorageArgs(argv);
}

function query(dbUrl, sql, { dryRun = false, local = false } = {}) {
  if (dryRun) {
    console.log("→ interrogerait PostgreSQL avec psql pour les extensions, schémas, tables, config et policies.");
    return {};
  }
  const command = local ? "docker" : "psql";
  const args = local
    ? ["exec", "supabase_db_minddy", "psql", "-U", "postgres", "-d", "postgres", "-X", "-v", "ON_ERROR_STOP=1", "-At", "-c", sql]
    : [dbUrl, "-X", "-v", "ON_ERROR_STOP=1", "-At", "-c", sql];
  const result = spawnSync(command, args, {
    cwd: ROOT_DIR,
    encoding: "utf8",
  });
  if (result.error?.code === "ENOENT") fail(`${command} est absent. Installez-le pour vérifier l'instance.`);
  if (result.status !== 0) fail(`${local ? "la base locale Docker" : "psql"} a échoué : ${(result.stderr || result.stdout).trim()}`);
  try {
    return JSON.parse(result.stdout.trim());
  } catch {
    fail(`psql a renvoyé une réponse illisible : ${result.stdout.trim()}`);
  }
}

export function checkLocalConfig(path = CONFIG_PATH) {
  const content = readFileSync(path, "utf8");
  const missing = REQUIRED_CONFIG.filter((entry) => !content.includes(entry));
  if (missing.length > 0) fail(`supabase/config.toml ne contient pas : ${missing.join(", ")}.`);
}

export function verificationSql() {
  const schemas = ["auth", "storage", "realtime", "extensions"];
  // Les buckets publics sont lus par leur endpoint Storage, pas grâce à une
  // policy SELECT. Seul l'upload direct dans `attachments` doit rester ouvert.
  const policyNames = ["attachments insert"];
  return `
with checks as (
  select 'schemas' as name, array(select unnest(array[${schemas.map((value) => `'${value}'`).join(",")}]) except select nspname from pg_namespace)::text[] as missing
  union all
  select 'tables', array(select unnest(array[${REQUIRED_TABLES.map((value) => `'${value}'`).join(",")}]) except select tablename from pg_tables where schemaname = 'public')::text[]
  union all
  select 'app_config', array(select unnest(array[${REQUIRED_APP_CONFIG.map((value) => `'${value}'`).join(",")}]) except select key from public.app_config)::text[]
  union all
  select 'policies', array(select unnest(array[${policyNames.map((value) => `'${value}'`).join(",")}]) except select policyname from pg_policies where schemaname = 'storage' and tablename = 'objects')::text[]
  union all
  select 'vector_extension', case when exists (select 1 from pg_extension e join pg_namespace n on n.oid = e.extnamespace where e.extname = 'vector' and n.nspname = 'extensions') then array[]::text[] else array['vector@extensions']::text[] end
  union all
  select 'realtime_publication', case when exists (select 1 from pg_publication where pubname = 'supabase_realtime') then array[]::text[] else array['supabase_realtime']::text[] end
)
select json_object_agg(name, missing) from checks;`;
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.dryRun) {
    console.log("→ vérifierait supabase/config.toml, PostgreSQL et la Storage API.");
    return;
  }
  checkLocalConfig();
  const checks = query(options.dbUrl, verificationSql(), options);
  const failures = Object.entries(checks).filter(([, missing]) => Array.isArray(missing) && missing.length > 0);
  if (failures.length > 0) {
    fail(failures.map(([name, missing]) => `${name} : ${missing.join(", ")}`).join(" ; "));
  }
  await reconcileBuckets(options);
  console.log(`✓ Vérification passée : ${Object.keys(EXPECTED_BUCKETS).join(", ")}, vector, Realtime et valeurs applicatives.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
