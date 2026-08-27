import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";

import { CHANGELOG_ENTRIES } from "@/lib/changelog";
import de from "@/messages/de.json";
import en from "@/messages/en.json";
import es from "@/messages/es.json";
import fr from "@/messages/fr.json";
import itMessages from "@/messages/it.json";
import ptBr from "@/messages/pt-BR.json";

/**
 * The contract between CATALOG and CODE: a placeholder message must be
 * called with its values.
 *
 * Why a test and not a type. Strict typing of next-intl (`global.d.ts`)
 * checks key NAMES, but not their arguments: messages are imported
 * from JSON, and TypeScript expands any JSON string value to `string`.
 * The `TranslateArgs` signature of use-intl then takes its branch
 * `string extends Value`, where `values` is optional. In other words the
 * compiler cannot see this bug, whatever the configuration.
 *
 * The cost of missing this, measured on the case that motivated the test:
 * calling `t("deleteViewTitle")` for the message `"Delete “{name}”?"` raises
 * nothing and logs nothing — next-intl falls back to the key path, so the view
 * deletion dialog displays `Board.deleteViewTitle` as its title.
 *
 * The detection does not use heuristics for ICU syntax: it calls the actual
 * next-intl formatter without values and checks whether it reports an error. A
 * message with `{name}`, `{count, plural, …}`, or rich tags is therefore classified as
 * requiring values ​​because it actually requires them, not because a regex
 * believed it to be so.
 */

const ROOT = join(import.meta.dirname, "..");
const SOURCE_DIRS = ["app", "components", "lib", "i18n"];
const IGNORED_DIRS = new Set(["node_modules", ".next", ".git", "dist", "build"]);

type Catalog = Record<string, unknown>;

/** Pointed paths (`Board.deleteViewTitle`) of all sheets in the catalog. */
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
 * Keys that REQUIRE values, according to next-intl itself: we format without
 * passing anything and we retain those which trigger a formatting error.
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
    // `t` accepts any path here: the catalog is changed to `never`
    // to bypass strict typing, which is precisely the limit.
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

/** `const t = useTranslations("Board")` → `t` is equal to the namespace `Board`. */
const NAMESPACE_BINDING =
  /(?:const|let)\s+([A-Za-z0-9_]+)\s*=\s*(?:await\s+)?(?:useTranslations|getTranslations)\s*\(\s*["'`]([^"'`]+)["'`]/g;

/** `t("key")` — the closing parenthesis follows the key, so no values are passed. */
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

describe("i18n catalog ↔ code contract", () => {
  const catalogs = { en, fr, de, "pt-BR": ptBr, it: itMessages, es } as const;
  const requiredByLocale = Object.fromEntries(
    Object.entries(catalogs).map(([locale, catalog]) => [
      locale,
      keysRequiringValues(catalog as Catalog),
    ]),
  ) as Record<keyof typeof catalogs, Set<string>>;
  const requiredEn = requiredByLocale.en;
  const required = new Set(Object.values(requiredByLocale).flatMap((keys) => [...keys]));

  it("the reference catalog contains messages with placeholders", () => {
    // Guardrail for the test itself: if detection broke, it would return an
    // empty set and the main test would pass without checking anything.
    expect(requiredEn.size).toBeGreaterThan(100);
    expect(requiredEn.has("Board.deleteViewTitle")).toBe(true);
  });

  it("no message with placeholders is called without its values", () => {
    const violations = findViolations(required);
    const report = violations
      .map((v) => `  ${v.file}:${v.line} — ${v.key} expects values`)
      .join("\n");
    expect(violations, `Calls without values:\n${report}`).toEqual([]);
  });

  /**
   * Keys built at runtime bypass typing: they are cast at the call site
   * (the convention in lib/i18n-keys.ts), so the compiler no longer guarantees
   * that they exist. These key families are used on PUBLIC pages, where a
   * missing key would display `Changelog.entry_x_title` to a visitor. We
   * therefore verify their existence here, at the source.
   */
  it.each([
    ["Changelog", CHANGELOG_ENTRIES.map((e) => e.id), ["entry_%_title", "entry_%_body"]],
  ] as const)("the %s namespace covers every constructed key", (namespace, ids, shapes) => {
    const flat = new Set(leafPaths((namespace === "Changelog" ? en.Changelog : {}) as Catalog));
    const missing = ids
      .flatMap((id) => shapes.map((shape) => shape.replace("%", id)))
      .filter((key) => !flat.has(key));
    expect(missing, `Missing ${namespace} keys: ${missing.join(", ")}`).toEqual([]);
  });

  it("all locales contain exactly the English keys", () => {
    const englishKeys = leafPaths(en as Catalog).sort();
    for (const catalog of Object.values(catalogs)) {
      expect(leafPaths(catalog as Catalog).sort()).toEqual(englishKeys);
    }
  });

  it("all locales require values for the same keys", () => {
    // A difference means that one translation lost or gained a placeholder:
    // the message is then broken in only one language, which a monolingual
    // review never catches.
    for (const [locale, requiredLocale] of Object.entries(requiredByLocale)) {
      expect([...requiredLocale].sort(), locale).toEqual([...requiredEn].sort());
    }
  });
});
