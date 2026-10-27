import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import ts from "typescript-api";
import { expect, it } from "vitest";

/**
 * The intl provider's `now` is captured once per document and ages in a tab
 * left open, so relative dates read through it drift into the future
 * (MIN-819). Client code reads time through `lib/use-live-now.ts` instead.
 */
const ROOT = resolve(import.meta.dirname, "..");
const CLOCK_MODULE = "lib/use-live-now.ts";
/** Files allowed to read next-intl's `useNow`, with the reason. */
const USE_NOW_EXCEPTIONS: Record<string, string> = {
  // A one-second stopwatch while a step runs; it measures a duration from its
  // own start, never the age of a stored event.
  "components/assistant/work-accordion.tsx": "stopwatch",
};

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "node_modules" ? [] : sourceFiles(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

function violations(): string[] {
  const found: string[] = [];
  for (const path of ["app", "components", "lib"].flatMap((dir) => sourceFiles(join(ROOT, dir)))) {
    const file = relative(ROOT, path);
    if (file === CLOCK_MODULE) continue;
    const text = readFileSync(path, "utf8");
    if (!text.includes("useNow") && !text.includes("relativeTime")) continue;
    const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const visit = (node: ts.Node) => {
      if (
        ts.isImportDeclaration(node)
        && ts.isStringLiteral(node.moduleSpecifier)
        && node.moduleSpecifier.text === "next-intl"
        && node.importClause?.namedBindings
        && ts.isNamedImports(node.importClause.namedBindings)
        && node.importClause.namedBindings.elements.some((element) => element.name.text === "useNow")
        && !(file in USE_NOW_EXCEPTIONS)
      ) {
        found.push(`${file}: imports useNow from next-intl`);
      }
      if (
        ts.isCallExpression(node)
        && ts.isPropertyAccessExpression(node.expression)
        && node.expression.name.text === "relativeTime"
        && node.arguments.length < 2
      ) {
        const { line } = source.getLineAndCharacterOfPosition(node.getStart(source));
        found.push(`${file}:${line + 1}: relativeTime without an explicit now`);
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return found;
}

it("keeps client relative dates off the intl provider's frozen clock", () => {
  expect(violations()).toEqual([]);
});
