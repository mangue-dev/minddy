import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";

import { CHANGELOG_ENTRIES } from "@/lib/changelog";
import en from "@/messages/en.json";
import fr from "@/messages/fr.json";

/**
 * Le contrat entre le CATALOGUE et le CODE : un message à placeholder doit être
 * appelé avec ses valeurs.
 *
 * Pourquoi un test et pas un type. Le typage strict de next-intl (`global.d.ts`)
 * vérifie les NOMS de clés, mais pas leurs arguments : les messages sont importés
 * depuis du JSON, et TypeScript élargit toute valeur de chaîne JSON en `string`.
 * La signature `TranslateArgs` de use-intl prend alors sa branche
 * `string extends Value`, où `values` est optionnel. Autrement dit le
 * compilateur ne peut pas voir ce bug-là, quelle que soit la configuration.
 *
 * Ce que ça coûte de ne pas le voir, mesuré sur le cas qui a motivé ce test :
 * `t("deleteViewTitle")` sur le message `"Delete “{name}”?"` ne lève rien, ne
 * journalise rien — next-intl retombe sur le chemin de la clé, et le dialog de
 * suppression de vue affichait `Board.deleteViewTitle` en guise de titre.
 *
 * La détection n'utilise aucune heuristique sur la syntaxe ICU : elle appelle le
 * VRAI formateur de next-intl sans valeurs et regarde s'il proteste. Un message
 * à `{name}`, à `{count, plural, …}` ou à balises riches est donc classé comme
 * exigeant des valeurs parce qu'il l'exige réellement, pas parce qu'une regex
 * l'a cru.
 */

const ROOT = join(import.meta.dirname, "..");
const SOURCE_DIRS = ["app", "components", "lib", "i18n"];
const IGNORED_DIRS = new Set(["node_modules", ".next", ".git", "dist", "build"]);

type Catalog = Record<string, unknown>;

/** Chemins pointés (`Board.deleteViewTitle`) de toutes les feuilles du catalogue. */
function leafPaths(node: Catalog, prefix = ""): string[] {
  const out: string[] = [];
  for (const [key, value] of Object.entries(node)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "string") out.push(path);
    else if (value && typeof value === "object") out.push(...leafPaths(value as Catalog, path));
  }
  return out;
}

/**
 * Les clés qui EXIGENT des valeurs, d'après next-intl lui-même : on formate sans
 * rien passer et on retient celles qui déclenchent une erreur de formatage.
 */
function keysRequiringValues(messages: Catalog): Set<string> {
  const required = new Set<string>();
  let failed = false;
  const t = createTranslator({
    locale: "en",
    messages: messages as never,
    onError: () => {
      failed = true;
    },
  });
  for (const path of leafPaths(messages)) {
    failed = false;
    // `t` accepte ici n'importe quel chemin : le catalogue est passé en `never`
    // pour court-circuiter le typage strict, dont c'est justement la limite.
    (t as unknown as (key: string) => string)(path);
    if (failed) required.add(path);
  }
  return required;
}

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

/** `const t = useTranslations("Board")` → `t` vaut le namespace `Board`. */
const NAMESPACE_BINDING =
  /(?:const|let)\s+([A-Za-z0-9_]+)\s*=\s*(?:await\s+)?(?:useTranslations|getTranslations)\s*\(\s*["'`]([^"'`]+)["'`]/g;

/** `t("cle")` — la parenthèse fermante SUIT la clé, donc aucune valeur n'est passée. */
const CALL_WITHOUT_VALUES = /\b([A-Za-z0-9_]+)\s*\(\s*["'`]([A-Za-z0-9_.]+)["'`]\s*\)/g;

interface Violation {
  file: string;
  line: number;
  key: string;
}

function findViolations(required: Set<string>): Violation[] {
  const violations: Violation[] = [];
  for (const file of sourceFiles()) {
    const src = readFileSync(file, "utf8");
    if (!src.includes("useTranslations") && !src.includes("getTranslations")) continue;

    const namespaceOf = new Map<string, string>();
    for (const [, variable, namespace] of src.matchAll(NAMESPACE_BINDING)) {
      namespaceOf.set(variable, namespace);
    }
    if (namespaceOf.size === 0) continue;

    for (const match of src.matchAll(CALL_WITHOUT_VALUES)) {
      const namespace = namespaceOf.get(match[1]);
      if (namespace === undefined) continue;
      const key = `${namespace}.${match[2]}`;
      if (!required.has(key)) continue;
      violations.push({
        file: file.slice(ROOT.length + 1),
        line: src.slice(0, match.index).split("\n").length,
        key,
      });
    }
  }
  return violations;
}

describe("contrat i18n catalogue ↔ code", () => {
  const requiredEn = keysRequiringValues(en as Catalog);
  const requiredFr = keysRequiringValues(fr as Catalog);
  const required = new Set([...requiredEn, ...requiredFr]);

  it("le catalogue de référence porte bien des messages à placeholder", () => {
    // Garde-fou du test lui-même : si la détection cassait, elle renverrait un
    // ensemble vide et le test principal passerait sans rien vérifier.
    expect(requiredEn.size).toBeGreaterThan(100);
    expect(requiredEn.has("Board.deleteViewTitle")).toBe(true);
  });

  it("aucun message à placeholder n'est appelé sans ses valeurs", () => {
    const violations = findViolations(required);
    const report = violations
      .map((v) => `  ${v.file}:${v.line} — ${v.key} attend des valeurs`)
      .join("\n");
    expect(violations, `Appels sans valeurs :\n${report}`).toEqual([]);
  });

  /**
   * Les clés construites à l'exécution échappent au typage : elles sont castées
   * au point d'appel (convention de lib/i18n-keys.ts), et le compilateur ne
   * garantit alors plus leur existence. Ces familles-là vivent sur des pages
   * PUBLIQUES — une clé manquante y afficherait `Changelog.entry_x_title` à un
   * visiteur. On vérifie donc leur existence ici, à la source.
   */
  it.each([
    ["Changelog", CHANGELOG_ENTRIES.map((e) => e.id), ["entry_%_title", "entry_%_body"]],
  ] as const)("le namespace %s couvre toutes ses clés construites", (namespace, ids, shapes) => {
    const flat = new Set(leafPaths((namespace === "Changelog" ? en.Changelog : {}) as Catalog));
    const missing = ids
      .flatMap((id) => shapes.map((shape) => shape.replace("%", id)))
      .filter((key) => !flat.has(key));
    expect(missing, `Clés absentes de ${namespace} : ${missing.join(", ")}`).toEqual([]);
  });

  it("fr et en exigent les mêmes valeurs pour une même clé", () => {
    // Une divergence signifie qu'une des deux traductions a perdu (ou gagné) un
    // placeholder : le message est alors cassé dans une seule langue, ce qu'une
    // relecture monolingue ne voit jamais.
    const diverging = [...new Set([...requiredEn, ...requiredFr])]
      .filter((key) => requiredEn.has(key) !== requiredFr.has(key))
      .sort();
    expect(diverging).toEqual([]);
  });
});
