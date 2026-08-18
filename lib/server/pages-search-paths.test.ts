import { readFileSync } from "node:fs";
import { join } from "node:path";

// `typescript-api` is an alias to `typescript@5` (see package.json and CLAUDE.md):
// since MIN-180 the repository checks with `typescript@7`, which no longer ships the API
// from the compiler. Structural tests therefore have their own TypeScript, in JS.
import ts from "typescript-api";
import { describe, expect, it } from "vitest";

/**
 * MIN-276 — `search_text` is written by ALL write paths in the body,
 * or it lies.
 *
 * The derived column is the only thing the search reads. It is written
 * by a catch-up (`queueSearchText`), and not by the base: nothing, in the
 * schema as in the types, forces a writing path to call it. A
 * `insert` or a `update` that carries `content` without its override does not break
 * anything visible — it just makes a page unfindable by its content, in
 * silent, and forever. This is exactly the kind of hole that a test of
 * behavior does not find: you would have to have GUESSED the missing path for
 * write the case which covers it.
 *
 * Hence a STRUCTURAL test, and its rule, which can be reread without tracing the calls :
 * **in `lib/server/pages.ts`, any function that writes `content` calls
 * `queueSearchText`.** A path added later without its catchup makes
 * fail this test by naming the offending function.
 *
 * What it does not claim to cover: that the catch-up writes the RIGHT text. This,
 * is `pages.test.ts`, which runs the real kernel on a table in
 * memory.
 */

const PAGES_PATH = join(process.cwd(), "lib/server/pages.ts");

function parsePages(): ts.SourceFile {
  return ts.createSourceFile(
    PAGES_PATH,
    readFileSync(PAGES_PATH, "utf8"),
    ts.ScriptTarget.ESNext,
    true
  );
}

/** The name of the function that contains this node — what we call it in failure. */
function enclosingFunction(node: ts.Node): string {
  let cursor: ts.Node | undefined = node;
  while (cursor) {
    if (ts.isFunctionDeclaration(cursor) && cursor.name) return cursor.name.text;
    if (
      (ts.isFunctionExpression(cursor) || ts.isArrowFunction(cursor)) &&
      cursor.parent &&
      ts.isVariableDeclaration(cursor.parent) &&
      ts.isIdentifier(cursor.parent.name)
    ) {
      return cursor.parent.name.text;
    }
    cursor = cursor.parent;
  }
  return "<module>";
}

/** Does the line write a body? `{ content: … }` or `row.content = …`. */
function mentionsContent(node: ts.Node): boolean {
  let found = false;
  const visit = (n: ts.Node) => {
    if (found) return;
    if (ts.isPropertyAssignment(n) && n.name.getText() === "content") found = true;
    if (
      ts.isBinaryExpression(n) &&
      n.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      ts.isPropertyAccessExpression(n.left) &&
      n.left.name.text === "content"
    ) {
      found = true;
    }
    ts.forEachChild(n, visit);
  };
  visit(node);
  return found;
}

/** The function node that contains this node, to only inspect its body. */
function enclosingNode(node: ts.Node): ts.Node {
  let cursor: ts.Node | undefined = node;
  while (cursor) {
    if (
      ts.isFunctionDeclaration(cursor) ||
      ts.isFunctionExpression(cursor) ||
      ts.isArrowFunction(cursor)
    ) {
      return cursor;
    }
    cursor = cursor.parent;
  }
  return node;
}

/**
 * The TABLE targeted by a `.insert(…)` / `.update(…)` — `service.from("pages")`.
 *
 * Without it, the analysis would count the insertion of a HISTORY line
 * (`page_versions`, which also has a `content` column) as a page write path
 *, and would require the archiver to archive itself.
 */
function targetTable(node: ts.CallExpression): string | null {
  let cursor: ts.Expression = node.expression;
  while (ts.isPropertyAccessExpression(cursor) || ts.isCallExpression(cursor)) {
    if (
      ts.isCallExpression(cursor) &&
      ts.isPropertyAccessExpression(cursor.expression) &&
      cursor.expression.name.text === "from"
    ) {
      const arg = cursor.arguments[0];
      return arg && ts.isStringLiteral(arg) ? arg.text : null;
    }
    cursor = ts.isCallExpression(cursor) ? cursor.expression : cursor.expression;
  }
  return null;
}

/**
 * The functions which WRITE the body, and those which catch the text.
 *
 * What we are looking for: a call `.insert(…)` / `.update(…)` which carries `content`.
 * It carries it in two ways, and both count — in the literal that we pass to it (`{ content: doc }`, the mirror of the parent), or in a VARIABLE
 * constructed above (`patch`, `rows`), in which case it is `content:` or
 * `.content =` from the same function that says it.
 *
 * The distinction is what keeps the test fair: the trash and
 * restore also write the table, but never the body — so they don't have to be required to catch anything either.
 */
function scan() {
  const src = parsePages();
  const writes = new Set<string>();
  const syncs = new Set<string>();

  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const method = node.expression.name.text;
      if (
        (method === "insert" || method === "update") &&
        targetTable(node) === "pages"
      ) {
        const writesBody = node.arguments.some((arg) =>
          ts.isIdentifier(arg) ? mentionsContent(enclosingNode(node)) : mentionsContent(arg)
        );
        if (writesBody) writes.add(enclosingFunction(node));
      }
    }
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "queueSearchText"
    ) {
      syncs.add(enclosingFunction(node));
    }
    ts.forEachChild(node, visit);
  };
  visit(src);

  return { writes, syncs };
}

describe("les chemins d'écriture du corps d'une page", () => {
  it("écrivent tous leur texte de recherche", () => {
    const { writes, syncs } = scan();

    // The test is only valid if it SEES the paths: a redesign which would make them
    // invisible to analysis would let it pass silently.
    expect(writes.size).toBeGreaterThanOrEqual(4);

    const missing = [...writes].filter((fn) => !syncs.has(fn));
    expect(
      missing,
      `Ces fonctions de lib/server/pages.ts écrivent le corps d'une page sans ` +
        `rejouer sa projection : ${missing.join(", ")}. Appelez queueSearchText ` +
        `avec les ids écrits, sinon la page reste introuvable par son contenu.`
    ).toEqual([]);
  });

  it("couvrent les quatre gestes connus", () => {
    const { writes } = scan();
    // A guardrail of the guardrail: if one of these names disappears, it is because the
    // module has moved, and the rule above should be reread rather than believed.
    for (const fn of ["createPage", "duplicatePage", "updatePage", "syncParentBody"]) {
      expect(writes.has(fn), `${fn} n'est plus vu comme un chemin d'écriture`).toBe(
        true
      );
    }
  });
});
