#!/usr/bin/env node
/**
 * Ajoute une entrée au changelog public (MIN-93).
 *
 * Une entrée vit à trois endroits : son identifiant et sa date dans
 * `lib/changelog.ts`, son titre et son texte dans `messages/en.json` et
 * `messages/fr.json`. Trois fichiers, quatre clés, un ordre à respecter — c'est
 * exactement le genre d'écriture qu'on rate à la main un jour sur trois, et
 * dont l'échec ne se voit qu'en production.
 *
 * D'où ce script. Il fait les trois écritures ou aucune, et il refuse ce qui ne
 * passerait pas la relecture : un identifiant déjà pris, une date en arrière,
 * un tiret cadratin, un texte trop long.
 *
 * Il ne déploie RIEN. L'entrée apparaît sur `/changelog`, dans le flux RSS,
 * dans la version Markdown et dans le `lastModified` du sitemap au prochain
 * déploiement — tout cela est dérivé, il n'y a rien d'autre à câbler.
 *
 * Usage :
 *
 *   node scripts/changelog-add.mjs \
 *     --id search-everywhere \
 *     --title-en "Search issues and objectives from anywhere" \
 *     --body-en  "The command palette now searches every issue you have access to." \
 *     --title-fr "Chercher tickets et objectifs depuis n'importe où" \
 *     --body-fr  "La palette cherche désormais dans tous les tickets accessibles."
 *
 * `--date` vaut aujourd'hui par défaut. `--dry-run` affiche sans écrire.
 */

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ENTRIES_FILE = path.join(ROOT, "lib", "changelog.ts");
const CATALOGUES = { en: path.join(ROOT, "messages", "en.json"), fr: path.join(ROOT, "messages", "fr.json") };

/** Au-delà, ce n'est plus une entrée de changelog mais un article. */
const MAX_TITLE = 70;
const MAX_BODY = 320;

/** L'ancre après laquelle les clés d'entrée commencent, dans les catalogues. */
const KEYS_ANCHOR = "feedBannerBody";

function fail(message) {
  console.error(`✗ ${message}`);
  process.exit(1);
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const name = token.slice(2);
    if (name === "dry-run") {
      args.dryRun = true;
      continue;
    }
    const value = argv[i + 1];
    if (value === undefined || value.startsWith("--")) fail(`--${name} attend une valeur.`);
    args[name] = value;
    i += 1;
  }
  return args;
}

/** Date du jour en ISO court, dans le fuseau local — c'est la date de livraison. */
function today() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function validate({ id, date, texts }) {
  if (!id || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id)) {
    fail(`--id doit être en kebab-case minuscule, reçu : ${JSON.stringify(id ?? null)}`);
  }
  // Le format PUIS la validité : `2026-13-45` passe la forme, et construire la
  // date avant de la vérifier fait lever `toISOString()` sur une date invalide
  // — le script mourrait sur une trace au lieu de dire ce qui ne va pas.
  const parsed = new Date(`${date}T00:00:00Z`);
  const wellFormed = /^\d{4}-\d{2}-\d{2}$/.test(date);
  const real = !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
  if (!wellFormed || !real) fail(`--date doit être une vraie date AAAA-MM-JJ, reçu : "${date}"`);
  for (const [field, value] of Object.entries(texts)) {
    if (!value?.trim()) fail(`--${field} est obligatoire.`);
    // Le site public n'a plus un seul tiret cadratin, et ce n'est pas ici
    // qu'on va en réintroduire un.
    if (value.includes("—")) fail(`--${field} contient un tiret cadratin. Deux-points, point ou virgule.`);
    const max = field.startsWith("title") ? MAX_TITLE : MAX_BODY;
    if (value.length > max) fail(`--${field} fait ${value.length} caractères, le maximum est ${max}.`);
  }
}

const args = parseArgs(process.argv.slice(2));
const id = args.id;
const date = args.date ?? today();
const texts = {
  "title-en": args["title-en"],
  "body-en": args["body-en"],
  "title-fr": args["title-fr"],
  "body-fr": args["body-fr"],
};

validate({ id, date, texts });

// ── lib/changelog.ts ────────────────────────────────────────────────────────

const entriesSource = readFileSync(ENTRIES_FILE, "utf8");
const ANCHOR = "export const CHANGELOG_ENTRIES: ReadonlyArray<ChangelogEntry> = [";
if (!entriesSource.includes(ANCHOR)) fail(`Déclaration de CHANGELOG_ENTRIES introuvable dans ${ENTRIES_FILE}.`);
if (entriesSource.includes(`id: "${id}"`)) fail(`L'identifiant "${id}" est déjà pris.`);

// La liste est triée du plus récent au plus ancien, et un test le vérifie :
// une entrée antérieure à la première casserait le tri et le `lastModified`.
const newest = entriesSource.match(/\{ id: "[^"]+", date: "(\d{4}-\d{2}-\d{2})" \}/);
if (newest && date < newest[1]) {
  fail(`--date ${date} est antérieure à la dernière entrée (${newest[1]}). La liste doit rester triée.`);
}

const nextEntries = entriesSource.replace(
  ANCHOR,
  `${ANCHOR}\n  { id: "${id}", date: "${date}" },`,
);

// ── messages/{en,fr}.json ───────────────────────────────────────────────────

const catalogues = {};
for (const [locale, file] of Object.entries(CATALOGUES)) {
  const raw = readFileSync(file, "utf8");
  const data = JSON.parse(raw);
  const block = data.Changelog;
  if (!block || !(KEYS_ANCHOR in block)) fail(`Namespace Changelog ou clé ${KEYS_ANCHOR} introuvable dans ${file}.`);

  // Reconstruit le namespace en insérant les deux clés juste après l'ancre :
  // les entrées restent groupées, la plus récente en tête, comme la liste.
  const rebuilt = {};
  for (const [key, value] of Object.entries(block)) {
    rebuilt[key] = value;
    if (key === KEYS_ANCHOR) {
      rebuilt[`entry_${id}_title`] = texts[`title-${locale}`];
      rebuilt[`entry_${id}_body`] = texts[`body-${locale}`];
    }
  }
  data.Changelog = rebuilt;
  catalogues[locale] = { file, content: `${JSON.stringify(data, null, 2)}\n` };
}

// ── Écriture ────────────────────────────────────────────────────────────────

if (args.dryRun) {
  console.log(`(dry-run) entrée "${id}" du ${date}`);
  for (const locale of Object.keys(CATALOGUES)) {
    console.log(`  ${locale}: ${texts[`title-${locale}`]}`);
    console.log(`      ${texts[`body-${locale}`]}`);
  }
  process.exit(0);
}

writeFileSync(ENTRIES_FILE, nextEntries);
for (const { file, content } of Object.values(catalogues)) writeFileSync(file, content);

console.log(`✓ entrée "${id}" ajoutée, datée du ${date}`);
console.log(`  lib/changelog.ts, messages/en.json, messages/fr.json`);
console.log("");
console.log("  Vérifier :  npx vitest run lib/changelog.test.ts");
console.log("  Puis committer. L'entrée part sur /changelog, dans le flux RSS,");
console.log("  dans la version Markdown et dans le sitemap au prochain déploiement.");
