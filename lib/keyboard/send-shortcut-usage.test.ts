import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * The sending shortcut is NOT rewritten by hand.
 *
 * Since it is adjustable by account (Account → Preferences → Keyboard), a
 * `e.key === "Enter" && (e.metaKey || e.ctrlKey)` copied into a composer is not
 * no longer just a duplicate: it is a field which ignores the setting, and which
 * SILENTLY ignores it — it continues to work for those who have not changed anything,
 * therefore for the author of the field. Two still existed when the preference is
 * arrived (the comment field, the plan editor), both written well
 * after `isSendShortcut`.
 *
 * Hence this test: recognition of the gesture goes through
 * [send-shortcut.ts](send-shortcut.ts) — `isSendShortcut` for a surface that
 * keeps ⌘/Ctrl no matter what (a form whose body is an editor),
 * `useIsSendShortcut` for a composer that tracks the count.
 */

const ROOT = join(import.meta.dirname, "..", "..");
const SOURCE_DIRS = ["app", "components", "lib"];
const IGNORED_DIRS = new Set(["node_modules", ".next", ".git", "dist", "build"]);

/** The module which CARRYS the rule obviously has the right to write it. */
const ALLOWED = new Set([join("lib", "keyboard", "send-shortcut.ts")]);

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

/** "Enter" and a ⌘/Ctrl modifier tested POSITIVELY on the same line.
 The negative guards (`!e.metaKey`, to say "Bare Entry") are removed
 first: they do not recognize the sending, they protect themselves from it — this is what the list of mentions does, where Enter choose a suggestion. */
const NEGATED = /![\w.]*\.(?:metaKey|ctrlKey)/g;
const INLINE_CHECK =
  /(?:metaKey|ctrlKey)[^\n]*["']Enter["']|["']Enter["'][^\n]*(?:metaKey|ctrlKey)/;

describe("le raccourci d'envoi n'est écrit qu'à un endroit", () => {
  it("ne laisse aucun composer refaire le test à la main", () => {
    const offenders: string[] = [];
    for (const file of sourceFiles()) {
      const relative = file.slice(ROOT.length + 1);
      if (ALLOWED.has(relative)) continue;
      const src = readFileSync(file, "utf8");
      src.split("\n").forEach((line, i) => {
        if (INLINE_CHECK.test(line.replace(NEGATED, "")))
          offenders.push(`${relative}:${i + 1}`);
      });
    }
    expect(
      offenders,
      "surfaces qui reconnaissent ⌘/Ctrl+Entrée elles-mêmes au lieu de passer par isSendShortcut / useIsSendShortcut",
    ).toEqual([]);
  });
});
