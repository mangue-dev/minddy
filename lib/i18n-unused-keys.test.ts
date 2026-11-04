import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import en from "@/messages/en.json";

/**
 * Every catalog key must be read by some code (MIN-799).
 *
 * A key nobody calls costs six translations to maintain and keeps a stale
 * label alive in reviews and glossary checks. Nothing else notices when a
 * component stops using one: the strict next-intl types only check the keys
 * that ARE called.
 *
 * The scan is deliberately permissive, so it only fails on keys that no source
 * file can plausibly reach. A key counts as read when one of these appears in
 * `app`, `components`, `lib`, `i18n`, `scripts` or `captures`:
 *
 * - a string literal equal to its path or to a dotted suffix of it
 *   (`"deleteViewTitle"`, `"instance.title"`, `"Board.deleteViewTitle"`);
 * - a template literal whose static parts match it (`` `status.${s}` ``,
 *   `` `operation_${key}_title` ``);
 * - a property access on a catalog object (`messages.Landing.heroTitle`), or
 *   any identifier in a file that reads a catalog object directly
 *   (`copy.routeTitle` once `messages.SelfHostingInstall` is passed down);
 * - a string literal equal to a parent object, for a subtree read as a whole.
 *
 * Keys assembled from fragments the scan cannot match (`prEventKey(e, "Opened")`
 * builds `prOpened` or `mrOpened`) go in `RUNTIME_KEYS` with the reason.
 */

const ROOT = join(import.meta.dirname, "..");
const SOURCE_DIRS = ["app", "components", "lib", "i18n", "scripts", "captures"];
const IGNORED_DIRS = new Set(["node_modules", ".next", ".git", "dist", "build", "output", "out"]);

/** Keys built at runtime from fragments, with the code that builds them. */
const RUNTIME_KEYS: { pattern: RegExp; reason: string }[] = [
  { pattern: /^Activity\.(pr|mr)[A-Z]\w*$/, reason: "lib/describe-event.ts prEventKey(): provider prefix + event suffix" },
  { pattern: /^MentionPreview\.pr_\w+$/, reason: "components/mention-preview-cards.tsx: `pr_${preview.state}`" },
  { pattern: /^Alternative\w+\.better(Them|Us)_\d$/, reason: "comparison pages: prefix + COMPARISON_POINTS index" },
];

type Catalog = { [key: string]: string | Catalog };

function paths(node: Catalog, prefix = ""): { leaves: string[]; parents: string[] } {
  const leaves: string[] = [];
  const parents: string[] = [];
  for (const [key, value] of Object.entries(node)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "string") leaves.push(path);
    else {
      parents.push(path);
      const nested = paths(value, path);
      leaves.push(...nested.leaves);
      parents.push(...nested.parents);
    }
  }
  return { leaves, parents };
}

function sourceFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      if (IGNORED_DIRS.has(entry)) continue;
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.(tsx?|mjs)$/.test(entry) && !/\.test\.(tsx?|mjs)$/.test(entry)) out.push(full);
    }
  };
  for (const dir of SOURCE_DIRS) walk(join(ROOT, dir));
  return out;
}

/** `a.b.c` → `a.b.c`, `b.c`, `c`. */
function suffixes(path: string): string[] {
  const segments = path.split(".");
  return segments.map((_, index) => segments.slice(index).join("."));
}

function referenceIndex(namespaces: Set<string>) {
  const literals = new Set<string>();
  const templates: RegExp[] = [];
  for (const file of sourceFiles()) {
    const src = readFileSync(file, "utf8");
    for (const match of src.matchAll(/"((?:[^"\\\n]|\\.)*)"|'((?:[^'\\\n]|\\.)*)'/g)) {
      literals.add(match[1] ?? match[2]);
    }
    for (const match of src.matchAll(/`((?:[^`\\]|\\.)*)`/g)) {
      const body = match[1];
      if (!body.includes("${")) {
        literals.add(body);
        continue;
      }
      const parts = body.split(/\$\{[^}]*\}/);
      // `${a}.${b}` would match every key: require some static text.
      if (parts.join("").replace(/[^A-Za-z]/g, "").length < 3) continue;
      if (!parts.every((part) => /^[A-Za-z0-9_.]*$/.test(part))) continue;
      const escaped = parts.map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
      templates.push(new RegExp(`^${escaped.join("[A-Za-z0-9_-]*")}$`));
    }
    for (const match of src.matchAll(/\b([A-Z][A-Za-z]+(?:\.[A-Za-z_]\w*)+)/g)) {
      if (namespaces.has(match[1].split(".")[0])) literals.add(match[1]);
    }
    if (/messages\/[A-Za-z-]+\.json|Messages\[|messages\.[A-Z]/.test(src)) {
      for (const match of src.matchAll(/[A-Za-z_]\w*/g)) literals.add(match[0]);
    }
  }
  return { literals, templates };
}

describe("translation catalog keys", () => {
  it("are all read by some source file", () => {
    const catalog = en as unknown as Catalog;
    const { leaves, parents } = paths(catalog);
    const { literals, templates } = referenceIndex(new Set(Object.keys(catalog)));

    // A subtree read as a whole: `t.raw("faq")`, a nested namespace. The
    // top-level namespace itself does not count, or every key would pass.
    const readParents = new Set(
      parents.filter((parent) => suffixes(parent).slice(1).some((suffix) => literals.has(suffix))),
    );

    const unused = leaves.filter((path) => {
      if (RUNTIME_KEYS.some(({ pattern }) => pattern.test(path))) return false;
      const all = suffixes(path);
      if (all.some((suffix) => literals.has(suffix))) return false;
      if (all.slice(1).some((suffix) => templates.some((template) => template.test(suffix)))) return false;
      const segments = path.split(".");
      for (let end = segments.length - 1; end >= 2; end--) {
        if (readParents.has(segments.slice(0, end).join("."))) return false;
      }
      return true;
    });

    expect(
      unused,
      "Remove these keys from every messages/*.json catalog, or add a RUNTIME_KEYS entry naming the code that builds them",
    ).toEqual([]);
  });
});
