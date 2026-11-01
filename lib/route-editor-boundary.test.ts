import { existsSync, readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import ts from "typescript-api";
import { describe, expect, it } from "vitest";

/**
 * The boards open no editor at load: they reach it only through deferred
 * loaders (components/editor/document-editor-lazy.tsx,
 * lib/use-description-collaboration.ts). One value import of the engine in
 * their static graph put tiptap, prosemirror and the block catalog (~100 to
 * ~300 KB gzip) back into their first load (MIN-875): the rectangle selection
 * read a class name from the editor's block rectangle, and the description
 * session built its schema at import time. Triage, objectives and feedback
 * show an editor on first paint and import the engine on purpose.
 *
 * This walks each route's static imports the way the bundler does: type-only
 * imports and `import()` are not edges.
 */
const ROOT = resolve(import.meta.dirname, "..");
const ROUTES = [
  "app/(app)/projects/[id]/page.tsx",
  "app/(app)/all/page.tsx",
];
// lowlight is not listed: rendered Markdown (comments, the Numo answers)
// highlights code with it outside any editor.
const ENGINE = /^(@tiptap\/|prosemirror-|yjs$|y-prosemirror$|katex$)/;
const EXTENSIONS = [".ts", ".tsx", "/index.ts", "/index.tsx"];

function resolveLocal(from: string, specifier: string): string | null {
  const base = specifier.startsWith("@/") ? resolve(ROOT, specifier.slice(2))
    : specifier.startsWith(".") ? resolve(dirname(from), specifier) : null;
  if (!base) return null;
  if (/\.(ts|tsx)$/.test(base) && existsSync(base)) return base;
  for (const extension of EXTENSIONS) if (existsSync(base + extension)) return base + extension;
  return null;
}

/** Value imports and re-exports of a module (what survives type erasure). */
function valueImports(file: string): string[] {
  const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const out: string[] = [];
  for (const statement of source.statements) {
    if (ts.isImportDeclaration(statement)) {
      const clause = statement.importClause;
      if (clause?.isTypeOnly) continue;
      const bindings = clause?.namedBindings;
      const onlyTypes = !!clause && !clause.name && !!bindings && ts.isNamedImports(bindings) &&
        bindings.elements.length > 0 && bindings.elements.every((element) => element.isTypeOnly);
      if (!onlyTypes) out.push((statement.moduleSpecifier as ts.StringLiteral).text);
    } else if (ts.isExportDeclaration(statement) && statement.moduleSpecifier && !statement.isTypeOnly) {
      out.push((statement.moduleSpecifier as ts.StringLiteral).text);
    }
  }
  return out;
}

/** The first static path from `entry` to a module importing the editor engine. */
function enginePath(entry: string): string[] | null {
  const start = resolve(ROOT, entry);
  const previous = new Map<string, string | null>([[start, null]]);
  const queue = [start];
  while (queue.length) {
    const file = queue.shift()!;
    for (const specifier of valueImports(file)) {
      if (ENGINE.test(specifier)) {
        const path = [specifier];
        for (let at: string | null = file; at; at = previous.get(at) ?? null) path.unshift(relative(ROOT, at));
        return path;
      }
      const next = resolveLocal(file, specifier);
      if (next && !previous.has(next)) {
        previous.set(next, file);
        queue.push(next);
      }
    }
  }
  return null;
}

describe("route bundles without the editor engine", () => {
  it.each(ROUTES)("%s imports no editor engine module statically", (route) => {
    expect(enginePath(route)).toBeNull();
  });

  it("follows value imports and ignores type-only ones", () => {
    // The engine is reachable from a module that hosts the live editor.
    expect(enginePath("components/editor/block-marquee.ts")).not.toBeNull();
    // lib/types.ts names tiptap's JSONContent as a type only.
    expect(enginePath("lib/types.ts")).toBeNull();
  });
});
