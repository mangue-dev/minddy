import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { SETTINGS_SECTIONS } from "@/lib/settings-sections";

/**
 * The contract between the CATALOG of settings and the MAPS that render them.
 *
 * An entry in `SETTINGS_SECTIONS` serves twice: it produces a line in
 * ⌘K, and it names the DOM anchor that the shell unrolls. The typing makes one sense
 * (`anchor={SETTINGS_SECTIONS.…}` accepts nothing other than an entry from the
 * catalog) but not the other: adding an entry without putting it on a card
 * compiles perfectly, and gives a palette line which opens the right tab
 * then does not unroll anything — five seconds of waiting, none error, no log.
 *
 * Hence this test: each entry in the catalog must be anchored somewhere
 * in `app/` or `components/`.
 */

const ROOT = join(import.meta.dirname, "..");
/** The catalog lives in `lib/`: looking for it there would be like quoting yourself. */
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

describe("settings section catalog", () => {
  const sources = sourceFiles().map((file) => readFileSync(file, "utf8"));

  it("places each catalog entry on a card", () => {
    const orphans = Object.keys(SETTINGS_SECTIONS).filter((name) => {
      const anchor = `anchor={SETTINGS_SECTIONS.${name}}`;
      return !sources.some((src) => src.includes(anchor));
    });
    expect(orphans, "sections du catalogue qu'aucun <SettingsGroup> ne rend").toEqual(
      [],
    );
  });

  it("gives each section a unique identifier", () => {
    const ids = Object.values(SETTINGS_SECTIONS);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
