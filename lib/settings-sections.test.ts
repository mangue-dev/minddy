import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { SETTINGS_SECTIONS } from "@/lib/settings-sections";

/**
 * Le contrat entre le CATALOGUE des réglages et les CARTES qui les rendent.
 *
 * Une entrée de `SETTINGS_SECTIONS` sert deux fois : elle produit une ligne dans
 * ⌘K, et elle nomme l'ancre DOM que le shell déroule. Le typage tient un sens
 * (`anchor={SETTINGS_SECTIONS.…}` n'accepte rien d'autre qu'une entrée du
 * catalogue) mais pas l'autre : ajouter une entrée sans la poser sur une carte
 * compile parfaitement, et donne une ligne de palette qui ouvre le bon onglet
 * puis ne déroule rien — cinq secondes de guette, aucune erreur, aucun log.
 *
 * D'où ce test : chaque entrée du catalogue doit être posée en ancre quelque
 * part dans `app/` ou `components/`.
 */

const ROOT = join(import.meta.dirname, "..");
/** Le catalogue vit dans `lib/` : le chercher là reviendrait à se citer soi-même. */
const SOURCE_DIRS = ["app", "components"];
const IGNORED_DIRS = new Set(["node_modules", ".next", ".git", "dist", "build"]);

function sourceFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      if (IGNORED_DIRS.has(entry)) continue;
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(full);
    }
  };
  for (const dir of SOURCE_DIRS) walk(join(ROOT, dir));
  return out;
}

describe("catalogue des sections de réglages", () => {
  const sources = sourceFiles().map((file) => readFileSync(file, "utf8"));

  it("pose chaque entrée du catalogue sur une carte", () => {
    const orphans = Object.keys(SETTINGS_SECTIONS).filter((name) => {
      const anchor = `anchor={SETTINGS_SECTIONS.${name}}`;
      return !sources.some((src) => src.includes(anchor));
    });
    expect(orphans, "sections du catalogue qu'aucun <SettingsGroup> ne rend").toEqual(
      [],
    );
  });

  it("donne à chaque section un identifiant unique", () => {
    const ids = Object.values(SETTINGS_SECTIONS);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
