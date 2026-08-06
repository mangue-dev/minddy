#!/usr/bin/env node
// Vide les caches de build et dit ce qu'on a récupéré.
// Les tailles sont mesurées avant la suppression : après, il n'y a plus rien à peser.

import { lstatSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const TARGETS = [".next", ".turbo", "node_modules/.cache"];

// Les *.tsbuildinfo de la racine (le glob du shell ne s'applique plus ici).
for (const entry of readdirSync(process.cwd(), { withFileTypes: true })) {
  if (entry.isFile() && entry.name.endsWith(".tsbuildinfo")) TARGETS.push(entry.name);
}

/** Taille sur disque, sans suivre les liens symboliques. 0 si le chemin n'existe pas. */
function sizeOf(path) {
  const stat = lstatSync(path, { throwIfNoEntry: false });
  if (!stat) return 0;
  if (!stat.isDirectory()) return stat.size;

  let total = 0;
  let entries;
  try {
    entries = readdirSync(path, { withFileTypes: true });
  } catch {
    return total;
  }
  for (const entry of entries) total += sizeOf(join(path, entry.name));
  return total;
}

function human(bytes) {
  const units = ["o", "Ko", "Mo", "Go"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  const digits = unit === 0 || value >= 100 ? 0 : 1;
  return `${value.toFixed(digits).replace(".", ",")} ${units[unit]}`;
}

const removed = [];
for (const target of TARGETS) {
  const bytes = sizeOf(target);
  if (bytes === 0 && !lstatSync(target, { throwIfNoEntry: false })) continue;
  rmSync(target, { recursive: true, force: true });
  removed.push({ target, bytes });
}

if (removed.length === 0) {
  console.log("Rien à retirer : les caches sont déjà vides.");
  process.exit(0);
}

const width = Math.max(...removed.map(({ target }) => target.length));
const sizes = removed.map(({ bytes }) => human(bytes));
const sizeWidth = Math.max(...sizes.map((size) => size.length));

removed.forEach(({ target }, index) => {
  console.log(`  ${target.padEnd(width)}  ${sizes[index].padStart(sizeWidth)}`);
});

const total = removed.reduce((sum, { bytes }) => sum + bytes, 0);
console.log(`\n${human(total)} libérés.`);
