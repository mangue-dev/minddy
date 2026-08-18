#!/usr/bin/env node
/**
 * Adds an entry to the public changelog (MIN-93).
 *
 * An entry lives in three places: its ID and date in
 * `lib/changelog.ts`, its title and text in `messages/en.json` and
 * `messages/fr.json`. Three files, four keys, an order to respect — it's
 * exactly the kind of writing that you fail by hand one day out of three, and
 * whose failure is only seen in production.
 *
 * Hence this script. It does all three entries or none, and it refuses anything that would not pass rereading: an identifier already taken, a date back,
 * an em dash, text that is too long.
 *
 * It deploys NOTHING. The entry appears on `/changelog`, in the RSS feed,
 * in the Markdown version, and in the `lastModified` of the sitemap at the next
 * deployment — all of this is derived, there's nothing else to wire up.
 *
 * Usage:
 *
 * node scripts/changelog-add.mjs \
 * --id search-everywhere \
 * --title-en "Search issues and objectives from anywhere" \
 * --body-en "The command palette now searches every issue you have access to." \
 * --title-fr "Search tickets and objectives from anywhere" \
 * --body-fr "The palette now searches in all accessible tickets."
 *
 * `--date` is today by default. `--dry-run` displays without writing.
 */

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ENTRIES_FILE = path.join(ROOT, "lib", "changelog.ts");
const CATALOGUES = { en: path.join(ROOT, "messages", "en.json"), fr: path.join(ROOT, "messages", "fr.json") };

/** Beyond that, it is no longer a changelog entry but an article. */
const MAX_TITLE = 70;
const MAX_BODY = 320;

/** The anchor after which entry keys begin, in catalogs. */
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
    if (value === undefined || value.startsWith("--")) fail(`--${name} expects a value.`);
    args[name] = value;
    i += 1;
  }
  return args;
}

/** Today's date in short ISO, in the local zone — this is the delivery date. */
function today() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function validate({ id, date, texts }) {
  if (!id || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id)) {
    fail(`--id must use lowercase kebab-case; received: ${JSON.stringify(id ?? null)}`);
  }
  // The format THEN the validity: `2026-13-45` passes the form, and builds the
  // date before checking it raises `toISOString()` on an invalid date
  // — the script would die on a trace instead of saying what's wrong.
  const parsed = new Date(`${date}T00:00:00Z`);
  const wellFormed = /^\d{4}-\d{2}-\d{2}$/.test(date);
  const real = !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
  if (!wellFormed || !real) fail(`--date must be a real YYYY-MM-DD date; received: "${date}"`);
  for (const [field, value] of Object.entries(texts)) {
    if (!value?.trim()) fail(`--${field} is required.`);
    // The public site no longer has a single em-dash, and it's not here
    // that we are going to reintroduce one.
    if (value.includes("—")) fail(`--${field} contains an em dash. Use a colon, period, or comma.`);
    const max = field.startsWith("title") ? MAX_TITLE : MAX_BODY;
    if (value.length > max) fail(`--${field} is ${value.length} characters long; the maximum is ${max}.`);
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
if (!entriesSource.includes(ANCHOR)) fail(`CHANGELOG_ENTRIES declaration not found in ${ENTRIES_FILE}.`);
if (entriesSource.includes(`id: "${id}"`)) fail(`Identifier "${id}" is already taken.`);

// The list is sorted from newest to oldest, and a test checks it:
// an entry earlier than the first would break the sorting and `lastModified`.
const newest = entriesSource.match(/\{ id: "[^"]+", date: "(\d{4}-\d{2}-\d{2})" \}/);
if (newest && date < newest[1]) {
  fail(`--date ${date} is earlier than the latest entry (${newest[1]}). The list must remain sorted.`);
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
  if (!block || !(KEYS_ANCHOR in block)) fail(`Changelog namespace or key ${KEYS_ANCHOR} not found in ${file}.`);

  // Rebuild the namespace by inserting both keys immediately after the anchor:
  // entries stay grouped, with the newest first, like the list.
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

// ── Writing ─────────────────────────────────────────────────────────────────

if (args.dryRun) {
  console.log(`(dry-run) entry "${id}" dated ${date}`);
  for (const locale of Object.keys(CATALOGUES)) {
    console.log(`  ${locale}: ${texts[`title-${locale}`]}`);
    console.log(`      ${texts[`body-${locale}`]}`);
  }
  process.exit(0);
}

writeFileSync(ENTRIES_FILE, nextEntries);
for (const { file, content } of Object.values(catalogues)) writeFileSync(file, content);

console.log(`✓ entry "${id}" added, dated ${date}`);
console.log(`  lib/changelog.ts, messages/en.json, messages/fr.json`);
console.log("");
console.log("  Verify:    npx vitest run lib/changelog.test.ts");
console.log("  Then commit. The entry appears on /changelog, in the RSS feed,");
console.log("  in the Markdown version, and in the sitemap at the next deployment.");
