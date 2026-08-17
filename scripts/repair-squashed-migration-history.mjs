#!/usr/bin/env node
/**
 * MIN-379 — transition sûre des instances existantes vers le baseline compact.
 *
 * Le baseline porte volontairement la dernière version de l'ancien historique.
 * Une instance déjà à jour a donc son schéma correct ; seuls les 210 anciens
 * enregistrements de `supabase_migrations.schema_migrations` doivent être
 * retirés. Cette commande ne touche jamais au schéma ni aux données.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";

export const BASELINE_VERSION = "20270106090000";
export const LEGACY_VERSION_COUNT = 210;
// SHA-256 de la liste triée des 211 versions pré-baseline, une par ligne.
// C'est plus compact qu'une seconde copie de l'ancien historique, tout en
// empêchant de réparer une base qui n'aurait qu'un nombre semblable de versions.
export const LEGACY_HISTORY_DIGEST = "8c79c3a1afa368b63956b311fec45ec81dd9649764d27a49db9a61894c43682b";

function fail(message) {
  throw new Error(`Réparation de l'historique impossible : ${message}`);
}

export function parseArgs(argv) {
  const options = { apply: false };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === "--") continue;
    if (flag === "--db-url") {
      const value = argv[++index];
      if (!value || value.startsWith("--")) fail("--db-url attend une valeur.");
      options.dbUrl = value;
    } else if (flag === "--apply") {
      options.apply = true;
    } else if (flag === "--help" || flag === "-h") {
      options.help = true;
    } else {
      fail(`option inconnue : ${flag}.`);
    }
  }
  if (!options.help && !options.dbUrl) fail("--db-url est requis.");
  return options;
}

export function help() {
  return `Usage: pnpm repair:squashed-migrations -- --db-url <postgres-url> [--apply]

Sans --apply, vérifie uniquement que l'instance porte exactement les 211
versions de l'ancien historique. Avec --apply, retire les 210 versions
antérieures au baseline 20270106090000 de la table d'historique ; le schéma et
les données ne sont jamais modifiés. Faites une sauvegarde restaurable avant.`;
}

function command(command, args) {
  const result = spawnSync(command, args, { encoding: "utf8" });
  if (result.error?.code === "ENOENT") fail(`commande absente : ${command}.`);
  if (result.status !== 0) fail(`${command} a échoué : ${(result.stderr || result.stdout).trim()}`);
  return result.stdout;
}

function listRemoteVersions(dbUrl) {
  return command("psql", [
    dbUrl,
    "-X",
    "-v",
    "ON_ERROR_STOP=1",
    "-At",
    "-c",
    "select version from supabase_migrations.schema_migrations order by version",
  ])
    .split(/\r?\n/)
    .map((value) => value.trim())
    .filter(Boolean);
}

export function summariseHistory(versions) {
  const unique = [...new Set(versions)].sort();
  const malformed = unique.filter((version) => !/^\d{14}$/.test(version));
  const newer = unique.filter((version) => version > BASELINE_VERSION);
  const legacy = unique.filter((version) => version < BASELINE_VERSION);
  return {
    hasBaseline: unique.includes(BASELINE_VERSION),
    malformed,
    newer,
    legacy,
    ready:
      unique.length === LEGACY_VERSION_COUNT + 1 &&
      legacy.length === LEGACY_VERSION_COUNT &&
      createHash("sha256").update(`${unique.join("\n")}\n`).digest("hex") === LEGACY_HISTORY_DIGEST,
  };
}

export function validateHistory(versions) {
  const summary = summariseHistory(versions);
  if (!summary.hasBaseline) fail(`le baseline ${BASELINE_VERSION} n'est pas enregistré.`);
  if (summary.malformed.length > 0) fail(`versions inattendues : ${summary.malformed.join(", ")}.`);
  if (summary.newer.length > 0) fail(`migrations postérieures au baseline : ${summary.newer.join(", ")}.`);
  if (!summary.ready) {
    fail(
      `l'instance ne porte pas exactement l'historique historique attendu : ${summary.legacy.length} version(s) ` +
        `antérieure(s), ${LEGACY_VERSION_COUNT} attendues. Vérifiez la dérive avant toute réparation.`
    );
  }
  return summary;
}

export function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.help) {
    console.log(help());
    return;
  }
  const summary = validateHistory(listRemoteVersions(options.dbUrl));
  console.log(`→ Instance vérifiée : baseline + ${summary.legacy.length} versions historiques.`);
  if (!options.apply) {
    console.log("→ Simulation seulement. Ajoutez --apply après sauvegarde restaurable pour réparer l'historique.");
    return;
  }

  command("supabase", [
    "migration",
    "repair",
    "--db-url",
    options.dbUrl,
    "--status",
    "reverted",
    ...summary.legacy,
    "--yes",
  ]);
  const remaining = listRemoteVersions(options.dbUrl);
  if (remaining.length !== 1 || remaining[0] !== BASELINE_VERSION) {
    fail("l'historique après réparation ne contient pas uniquement le baseline ; annulez le déploiement.");
  }
  console.log("✓ Historique consolidé. Exécutez maintenant pnpm bootstrap:supabase pour appliquer la migration de données initiales.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
