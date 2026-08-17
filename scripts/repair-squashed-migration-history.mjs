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
  const options = { apply: false, linked: false, manualSchema: false };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === "--") continue;
    if (flag === "--db-url") {
      const value = argv[++index];
      if (!value || value.startsWith("--")) fail("--db-url attend une valeur.");
      options.dbUrl = value;
    } else if (flag === "--apply") {
      options.apply = true;
    } else if (flag === "--linked") {
      options.linked = true;
    } else if (flag === "--allow-manual-schema") {
      options.manualSchema = true;
    } else if (flag === "--confirm-history") {
      const value = argv[++index];
      if (!value || value.startsWith("--")) fail("--confirm-history attend une empreinte SHA-256.");
      options.confirmHistory = value;
    } else if (flag === "--help" || flag === "-h") {
      options.help = true;
    } else {
      fail(`option inconnue : ${flag}.`);
    }
  }
  if (!options.help && !options.dbUrl && !options.linked) {
    fail("--db-url ou --linked est requis.");
  }
  if (options.dbUrl && options.linked) fail("--db-url et --linked sont exclusifs.");
  return options;
}

export function help() {
  return `Usage: pnpm repair:squashed-migrations -- (--db-url <postgres-url> | --linked) [options]

Sans --apply, vérifie uniquement que l'instance porte exactement les 211
versions de l'ancien historique. Avec --apply, retire les 210 versions
antérieures au baseline 20270106090000 de la table d'historique ; le schéma et
les données ne sont jamais modifiés. --linked utilise le projet lié à la CLI.
Pour une base dont les migrations ont été appliquées manuellement, contrôlez
d'abord le schéma avec \`supabase db diff --linked\`, puis ajoutez
\`--allow-manual-schema\`. Avec \`--apply\`, cette voie exige en plus
\`--confirm-history <empreinte affichée>\`. Faites une sauvegarde restaurable avant.`;
}

function command(command, args) {
  const result = spawnSync(command, args, { encoding: "utf8" });
  if (result.error?.code === "ENOENT") fail(`commande absente : ${command}.`);
  if (result.status !== 0) fail(`${command} a échoué : ${(result.stderr || result.stdout).trim()}`);
  return result.stdout;
}

export function linkedVersions(output) {
  return output
    .split(/\r?\n/)
    .map((line) => /^\s*[^|]*\|\s*(\d{14})\s*\|/.exec(line)?.[1])
    .filter(Boolean);
}

function listRemoteVersions(options) {
  if (options.linked) {
    return linkedVersions(command("supabase", ["migration", "list", "--linked"]));
  }
  return command("psql", [
    options.dbUrl,
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

function historyDigest(versions) {
  return createHash("sha256").update(`${[...new Set(versions)].sort().join("\n")}\n`).digest("hex");
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
  const versions = listRemoteVersions(options);
  let summary;
  let manualSchema = false;
  try {
    summary = validateHistory(versions);
  } catch (error) {
    if (!options.manualSchema) throw error;
    summary = summariseHistory(versions);
    if (summary.malformed.length > 0 || summary.newer.length > 0) {
      throw error;
    }
    manualSchema = true;
    console.log(
      `→ Historique manuel accepté : ${summary.legacy.length} version(s), empreinte ${historyDigest(versions)}.`
    );
  }
  if (!manualSchema) {
    console.log(`→ Instance vérifiée : baseline + ${summary.legacy.length} versions historiques.`);
  }
  if (!options.apply) {
    console.log(
      manualSchema
        ? "→ Simulation seulement. Vérifiez le diff de schéma, puis ajoutez --apply --confirm-history <empreinte>."
        : "→ Simulation seulement. Ajoutez --apply après sauvegarde restaurable pour réparer l'historique."
    );
    return;
  }
  if (manualSchema && options.confirmHistory !== historyDigest(versions)) {
    fail("--confirm-history doit correspondre exactement à l'empreinte affichée par la simulation.");
  }

  const repairArgs = [
    "migration",
    "repair",
    "--status",
    "reverted",
    ...summary.legacy,
    "--yes",
  ];
  if (options.linked) repairArgs.splice(2, 0, "--linked");
  else repairArgs.splice(2, 0, "--db-url", options.dbUrl);
  command("supabase", repairArgs);
  if (!summary.hasBaseline) {
    const applyArgs = ["migration", "repair", "--status", "applied", BASELINE_VERSION, "--yes"];
    if (options.linked) applyArgs.splice(2, 0, "--linked");
    else applyArgs.splice(2, 0, "--db-url", options.dbUrl);
    command("supabase", applyArgs);
  }
  const remaining = listRemoteVersions(options);
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
