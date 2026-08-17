#!/usr/bin/env node
/**
 * MIN-379 — bootstrap reproductible d'une instance Supabase minddy.
 *
 * Deux modes, volontairement explicites :
 *   pnpm bootstrap:supabase
 *     démarre et prépare la pile locale définie par supabase/config.toml.
 *   pnpm bootstrap:supabase -- --db-url "$SUPABASE_DB_URL"
 *     prépare une pile auto-hébergée déjà démarrée. L'URL PostgreSQL doit être
 *     celle d'un rôle qui peut appliquer les migrations Supabase.
 *
 * Le script ne redémarre jamais une pile distante et n'écrase jamais une valeur
 * déjà présente dans le fichier d'environnement. Les migrations sont la source
 * de vérité du schéma ; l'API Storage est celle des buckets, car ils ne font
 * pas partie d'un dump de schéma PostgreSQL.
 */
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
export const ROOT_DIR = resolve(SCRIPT_DIR, "..");
export const MIGRATIONS_DIR = resolve(ROOT_DIR, "supabase/migrations");
const DEFAULT_ENV_FILE = resolve(ROOT_DIR, ".env.local");
const GENERATED_SECRET_KEYS = [
  "GIT_STATE_SECRET",
  "GIT_TOKEN_ENCRYPTION_SECRET",
  "AI_KEY_ENCRYPTION_SECRET",
  "FEEDBACK_SSO_ENCRYPTION_SECRET",
  "CRON_SECRET",
];

export function fail(message) {
  throw new Error(`Bootstrap Supabase impossible : ${message}`);
}

export function parseArgs(argv) {
  const options = { local: true, start: true, envFile: DEFAULT_ENV_FILE, dryRun: false };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = () => {
      const next = argv[++index];
      if (!next || next.startsWith("--")) fail(`${arg} attend une valeur.`);
      return next;
    };

    if (arg === "--") {
      continue;
    } else if (arg === "--db-url") {
      options.dbUrl = value();
      options.local = false;
    } else if (arg === "--local") {
      options.local = true;
      delete options.dbUrl;
    } else if (arg === "--skip-start") {
      options.start = false;
    } else if (arg === "--env-file") {
      options.envFile = resolve(ROOT_DIR, value());
    } else if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else {
      fail(`option inconnue : ${arg}. Consultez --help.`);
    }
  }

  if (!options.local && !options.dbUrl) fail("--db-url est requis hors mode local.");
  if (!options.envFile.startsWith(`${ROOT_DIR}/`)) {
    fail("--env-file doit rester dans ce clone pour éviter d'écrire un fichier inattendu.");
  }
  return options;
}

export function help() {
  return `Usage: pnpm bootstrap:supabase [-- --local | --db-url <postgres-url>] [options]

Options:
  --local              Prépare la pile Docker locale (défaut).
  --db-url <url>       Applique les migrations à une pile distante déjà démarrée.
  --skip-start         Ne lance pas \`supabase start\` en mode local.
  --env-file <path>    Fichier local à compléter (défaut : .env.local).
  --dry-run            Contrôle les prérequis sans écrire ni appliquer.
  -h, --help           Affiche cette aide.

Mode distant : fournissez aussi NEXT_PUBLIC_SUPABASE_URL,
NEXT_PUBLIC_SUPABASE_ANON_KEY et SUPABASE_SERVICE_ROLE_KEY dans le shell. Les
cinq secrets applicatifs manquants sont générés dans .env.local.`;
}

export function listMigrations(directory = MIGRATIONS_DIR) {
  if (!existsSync(directory)) fail(`répertoire de migrations absent : ${directory}`);
  const files = readdirSync(directory)
    .filter((file) => file.endsWith(".sql"))
    .sort();
  if (files.length === 0) fail("aucune migration SQL trouvée.");

  const seenVersions = new Set();
  for (const file of files) {
    const match = /^(\d{14})_[a-z0-9_]+\.sql$/.exec(file);
    if (!match) fail(`nom de migration invalide : ${file} (attendu : YYYYMMDDHHMMSS_nom.sql).`);
    if (seenVersions.has(match[1])) fail(`version de migration dupliquée : ${match[1]}.`);
    seenVersions.add(match[1]);
  }

  const contents = files.map((file) => readFileSync(resolve(directory, file), "utf8")).join("\n");
  if (!/create extension if not exists\s+"?vector"?\s+with schema\s+"?extensions"?/i.test(contents)) {
    fail("l'extension vector n'est plus déclarée dans les migrations.");
  }
  return files;
}

export function parseEnv(text) {
  const values = new Map();
  for (const line of text.split(/\r?\n/)) {
    const match = /^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
    if (!match) continue;
    values.set(match[1], match[2]);
  }
  return values;
}

function unquoteEnvValue(value) {
  const trimmed = value.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return trimmed.slice(1, -1);
    }
  }
  return trimmed;
}

function envLine(key, value) {
  // Hex, URL et clés JWT n'ont pas besoin de quoting. L'échappement protège les
  // valeurs externes inhabituelles sans transformer le fichier en shell script.
  const rendered = /^[A-Za-z0-9._~:/?#[\]@!$&'()*+,;=%-]+$/.test(value)
    ? value
    : JSON.stringify(value);
  return `${key}=${rendered}`;
}

export function appendMissingEnv(file, values) {
  const before = existsSync(file) ? readFileSync(file, "utf8") : "";
  const existing = parseEnv(before);
  const additions = [];
  for (const [key, value] of Object.entries(values)) {
    if (existing.has(key)) continue;
    additions.push(envLine(key, value));
  }
  if (additions.length === 0) return [];
  const prefix = before.length === 0 ? "# Généré par pnpm bootstrap:supabase — ne pas committer.\n" : before.endsWith("\n") ? "" : "\n";
  writeFileSync(file, `${before}${prefix}${additions.join("\n")}\n`, { mode: 0o600 });
  return additions.map((line) => line.slice(0, line.indexOf("=")));
}

export function generatedSecrets() {
  return Object.fromEntries(GENERATED_SECRET_KEYS.map((key) => [key, randomBytes(32).toString("hex")]));
}

export function run(command, args, { dryRun = false, env } = {}) {
  if (dryRun) {
    console.log(`→ ${command} ${args.map((arg) => (arg.includes("postgres") ? "<database-url>" : arg)).join(" ")}`);
    return { stdout: "", stderr: "" };
  }
  const result = spawnSync(command, args, {
    cwd: ROOT_DIR,
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
  if (result.error?.code === "ENOENT") {
    fail(`commande absente : ${command}. Installez-la puis relancez.`);
  }
  if (result.status !== 0) {
    const details = (result.stderr || result.stdout || "erreur sans sortie").trim();
    fail(`${command} a échoué (code ${result.status}) : ${details}`);
  }
  return result;
}

export function readLocalStatus({ dryRun = false } = {}) {
  if (dryRun) {
    return {
      API_URL: "http://127.0.0.1:54321",
      ANON_KEY: "<anon-key>",
      SERVICE_ROLE_KEY: "<service-role-key>",
      DB_URL: "<database-url>",
    };
  }
  const { stdout } = run("supabase", ["status", "--output", "env"]);
  const status = Object.fromEntries(
    stdout
      .split(/\r?\n/)
      .map((line) => /^([A-Z0-9_]+)=(.*)$/.exec(line))
      .filter(Boolean)
      .map((match) => [match[1], unquoteEnvValue(match[2])])
  );
  const missing = ["API_URL", "ANON_KEY", "SERVICE_ROLE_KEY", "DB_URL"].filter((key) => !status[key]);
  if (missing.length > 0) {
    fail(`la pile locale ne fournit pas ${missing.join(", ")}. Vérifiez \`supabase status\`.`);
  }
  return status;
}

function remoteAppValues() {
  const required = [
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
  ];
  const missing = required.filter((key) => !process.env[key]?.trim());
  if (missing.length > 0) {
    fail(
      `${missing.join(", ")} manque dans le shell. Ces valeurs viennent de la pile Supabase ` +
        "auto-hébergée ; elles ne peuvent pas être déduites de l'URL PostgreSQL."
    );
  }
  return Object.fromEntries(required.map((key) => [key, process.env[key].trim()]));
}

async function reconcileAndVerify({ dbUrl, appValues, dryRun, local }) {
  const reconcile = resolve(SCRIPT_DIR, "reconcile-storage-buckets.mjs");
  const verify = resolve(SCRIPT_DIR, "verify-supabase-bootstrap.mjs");
  // Les URL et clé de service restent dans l'environnement des sous-processus,
  // jamais dans leur ligne de commande (visible par les autres processus du
  // poste sur certains systèmes).
  const env = {
    MDY_BOOTSTRAP_SUPABASE_URL: appValues.NEXT_PUBLIC_SUPABASE_URL,
    MDY_BOOTSTRAP_SERVICE_ROLE_KEY: appValues.SUPABASE_SERVICE_ROLE_KEY,
  };
  if (!local) env.MDY_BOOTSTRAP_DB_URL = dbUrl;
  run(process.execPath, [reconcile, "--from-bootstrap-env"], { dryRun, env });
  run(process.execPath, [verify, "--from-bootstrap-env", ...(local ? ["--local"] : [])], { dryRun, env });
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.help) {
    console.log(help());
    return;
  }

  const migrations = listMigrations();
  console.log(`→ ${migrations.length} migrations validées, de ${migrations[0]} à ${migrations.at(-1)}.`);
  run("supabase", ["--version"], { dryRun: options.dryRun });

  let dbUrl;
  let appValues;
  if (options.local) {
    // La CLI télécharge/contrôle les services via Docker. Le diagnostiquer avant
    // `supabase start` évite le très vague « Cannot connect to Docker daemon ».
    run("docker", ["info"], { dryRun: options.dryRun });
    if (options.start) run("supabase", ["start"], { dryRun: options.dryRun });
    const status = readLocalStatus({ dryRun: options.dryRun });
    dbUrl = status.DB_URL;
    appValues = {
      NEXT_PUBLIC_SUPABASE_URL: status.API_URL,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: status.ANON_KEY,
      SUPABASE_SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY,
    };
  } else {
    dbUrl = options.dbUrl;
    appValues = remoteAppValues();
  }

  const generated = { ...appValues, ...generatedSecrets() };
  if (options.dryRun) {
    console.log(`→ compléterait ${basename(options.envFile)} sans remplacer de valeurs existantes.`);
  } else {
    const added = appendMissingEnv(options.envFile, generated);
    console.log(added.length === 0 ? `→ ${basename(options.envFile)} est déjà complet.` : `→ ${basename(options.envFile)} complété : ${added.join(", ")}.`);
  }

  const pushArgs = options.local
    ? ["db", "push", "--local", "--yes"]
    : ["db", "push", "--db-url", dbUrl, "--yes"];
  run("supabase", pushArgs, { dryRun: options.dryRun });
  await reconcileAndVerify({ dbUrl, appValues, dryRun: options.dryRun, local: options.local });
  console.log("✓ Instance Supabase prête : migrations, stockage, valeurs initiales et prérequis vérifiés.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
