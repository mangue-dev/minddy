import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Le raccourci d'envoi ne se réécrit PAS à la main.
 *
 * Depuis qu'il est réglable par compte (Compte → Préférences → Clavier), un
 * `e.key === "Enter" && (e.metaKey || e.ctrlKey)` recopié dans un composer n'est
 * plus seulement un doublon : c'est un champ qui ignore le réglage, et qui
 * l'ignore SILENCIEUSEMENT — il continue de marcher pour qui n'a rien changé,
 * donc pour l'auteur du champ. Deux existaient encore quand la préférence est
 * arrivée (le champ de commentaire, l'éditeur de plan), tous deux écrits bien
 * après `isSendShortcut`.
 *
 * D'où ce test : la reconnaissance du geste passe par
 * [send-shortcut.ts](send-shortcut.ts) — `isSendShortcut` pour une surface qui
 * garde ⌘/Ctrl quoi qu'il arrive (un formulaire dont le corps est un éditeur),
 * `useIsSendShortcut` pour un composer qui suit le compte.
 */

const ROOT = join(import.meta.dirname, "..", "..");
const SOURCE_DIRS = ["app", "components", "lib"];
const IGNORED_DIRS = new Set(["node_modules", ".next", ".git", "dist", "build"]);

/** Le module qui PORTE la règle a évidemment le droit de l'écrire. */
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

/** « Entrée » et un modificateur ⌘/Ctrl testés POSITIVEMENT sur la même ligne.
    Les gardes négatives (`!e.metaKey`, pour dire « Entrée nue ») sont retirées
    d'abord : elles ne reconnaissent pas l'envoi, elles s'en protègent — c'est ce
    que fait la liste de mentions, où Entrée choisit une suggestion. */
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
