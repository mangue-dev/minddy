#!/usr/bin/env node
/** MIN-379 — buckets Storage : ils ne figurent pas dans un dump de schéma SQL. */
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = resolve(SCRIPT_DIR, "..");
const EXPECTED_BUCKETS = {
  attachments: { public: false, file_size_limit: 20 * 1024 * 1024 },
  "project-icons": { public: true, file_size_limit: 25 * 1024 * 1024 },
  "forge-attachments": { public: true, file_size_limit: 20 * 1024 * 1024 },
};

function fail(message) {
  throw new Error(`Configuration Storage impossible : ${message}`);
}

export function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = () => {
      const next = argv[++index];
      if (!next || next.startsWith("--")) fail(`${flag} attend une valeur.`);
      return next;
    };
    if (flag === "--db-url") options.dbUrl = value();
    else if (flag === "--supabase-url") options.supabaseUrl = value();
    else if (flag === "--service-role-key") options.serviceRoleKey = value();
    else if (flag === "--from-bootstrap-env") options.fromBootstrapEnv = true;
    else if (flag === "--local") options.local = true;
    else if (flag === "--dry-run") options.dryRun = true;
    else fail(`option inconnue : ${flag}.`);
  }
  if (options.fromBootstrapEnv) {
    options.dbUrl ??= process.env.MDY_BOOTSTRAP_DB_URL;
    options.supabaseUrl ??= process.env.MDY_BOOTSTRAP_SUPABASE_URL;
    options.serviceRoleKey ??= process.env.MDY_BOOTSTRAP_SERVICE_ROLE_KEY;
  }
  for (const key of ["supabaseUrl", "serviceRoleKey"]) {
    if (!options[key]) fail(`${key} est requis.`);
  }
  return options;
}

function storageUrl(supabaseUrl, path) {
  return `${supabaseUrl.replace(/\/$/, "")}/storage/v1${path}`;
}

async function storageFetch(options, path, init = {}) {
  const response = await fetch(storageUrl(options.supabaseUrl, path), {
    ...init,
    headers: { authorization: `Bearer ${options.serviceRoleKey}`, ...init.headers },
  });
  if (!response.ok) {
    const body = await response.text();
    fail(`Storage API ${init.method ?? "GET"} ${path} a répondu ${response.status} : ${body || response.statusText}`);
  }
  return response;
}

async function listBuckets(options) {
  const response = await storageFetch(options, "/bucket");
  const buckets = await response.json();
  if (!Array.isArray(buckets)) fail("la réponse de liste des buckets n'est pas une liste.");
  return buckets;
}

function matches(bucket, expected) {
  return bucket.public === expected.public && Number(bucket.file_size_limit) === expected.file_size_limit;
}

export async function reconcileBuckets(options) {
  if (options.dryRun) {
    console.log("→ créerait/configurerait les buckets Storage et supprimerait le bucket avatars hérité s'il est vide.");
    return;
  }
  const current = new Map((await listBuckets(options)).map((bucket) => [bucket.id, bucket]));

  for (const [id, expected] of Object.entries(EXPECTED_BUCKETS)) {
    const bucket = current.get(id);
    if (!bucket) {
      await storageFetch(options, "/bucket", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, name: id, ...expected }),
      });
      console.log(`→ bucket ${id} créé.`);
    } else if (!matches(bucket, expected)) {
      await storageFetch(options, `/bucket/${encodeURIComponent(id)}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(expected),
      });
      console.log(`→ bucket ${id} reconfiguré.`);
    }
  }

  const byId = new Map((await listBuckets(options)).map((bucket) => [bucket.id, bucket]));
  for (const [id, expected] of Object.entries(EXPECTED_BUCKETS)) {
    const bucket = byId.get(id);
    if (!bucket || !matches(bucket, expected)) {
      fail(`bucket ${id} absent ou mal configuré après réconciliation.`);
    }
  }

  if (!byId.has("avatars")) return;
  try {
    await storageFetch(options, "/bucket/avatars", { method: "DELETE" });
    console.log("→ bucket avatars hérité supprimé (inutile depuis la migration 20260903090000).");
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    fail(
      "le bucket avatars hérité contient probablement encore des objets ; ne le supprimez pas à l'aveugle. " +
        `Videz/archivez-le via Storage puis relancez. Détail : ${detail}`
    );
  }
}

export { EXPECTED_BUCKETS, ROOT_DIR };

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  reconcileBuckets(parseArgs(process.argv.slice(2))).catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
