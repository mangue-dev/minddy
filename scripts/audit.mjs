#!/usr/bin/env node
/**
 * Le gate « vulnérabilités » du dépôt (MIN-335) — une seule définition, lue par
 * la CI ([.github/workflows/ci.yml]) comme par [deploy.sh].
 *
 * Il corrige deux angles morts de l'ancien `npm audit --omit=dev` :
 *
 * 1. **Le bon lockfile.** Le dépôt en tient trois : `pnpm-lock.yaml` (celui qui
 *    installe réellement — `node_modules` est un store pnpm), `package-lock.json`
 *    (tenu en second, cf. CLAUDE.md), et `desktop/package-lock.json` (l'app
 *    macOS, jamais auditée jusqu'ici). Une centaine de paquets se résolvent
 *    différemment entre les deux premiers : auditer `package-lock.json` seul,
 *    c'était auditer un arbre que personne n'exécute. On les audite tous les
 *    trois — chacun est installable par quelqu'un.
 *
 * 2. **`--omit=dev` cachait la chaîne de build.** Le raisonnement (« les outils
 *    de build ne sont pas exposés en prod ») ne tient pas : `esbuild` produit
 *    les bundles réellement livrés (VM de l'agent, projection des pages, coquille
 *    macOS) et `tailwindcss` produit le CSS servi aux visiteurs. Un paquet
 *    compromis dans cette chaîne n'a pas besoin d'être en `dependencies` pour
 *    finir dans ce que l'utilisateur exécute. On audite donc l'arbre ENTIER.
 *
 * Seuil : `high`. Une vuln high ou critical fait échouer le processus.
 */

import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Les trois lockfiles du dépôt, et la commande qui sait lire chacun. */
const TARGETS = [
  {
    label: "racine — pnpm-lock.yaml (l'arbre réellement installé)",
    cwd: ROOT,
    command: "pnpm",
    args: ["audit", "--audit-level=high"],
  },
  {
    label: "racine — package-lock.json (lockfile tenu en second)",
    cwd: ROOT,
    command: "npm",
    args: ["audit", "--audit-level=high"],
  },
  {
    label: "desktop — package-lock.json (coquille macOS)",
    cwd: path.join(ROOT, "desktop"),
    command: "npm",
    args: ["audit", "--audit-level=high"],
  },
];

const failed = [];

for (const target of TARGETS) {
  console.log(`\n→ Audit ${target.label}`);
  const result = spawnSync(target.command, target.args, {
    cwd: target.cwd,
    stdio: "inherit",
    shell: process.platform === "win32",
  });

  // Une commande introuvable (pnpm absent de la machine) est un échec du gate,
  // pas un succès silencieux : mieux vaut bloquer que croire avoir audité.
  if (result.error) {
    console.error(`  ✗ ${target.command} injouable : ${result.error.message}`);
    failed.push(target.label);
    continue;
  }

  if (result.status !== 0) {
    failed.push(target.label);
  }
}

if (failed.length > 0) {
  console.error(`\n✗ Audit : vulnérabilité high/critical (ou audit impossible) sur :`);
  for (const label of failed) console.error(`    - ${label}`);
  process.exit(1);
}

console.log("\n✓ Audit : aucune vulnérabilité high/critical sur les trois lockfiles.");
