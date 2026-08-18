import { readFileSync } from "node:fs";
import { join } from "node:path";

// `typescript-api` is an alias to `typescript@5` (see package.json and CLAUDE.md):
// since MIN-180 the repository checks with `typescript@7`, which no longer ships the API
// of the compiler. Structural tests therefore have their own TypeScript, in JS.
import ts from "typescript-api";
import { describe, expect, it } from "vitest";

/**
 * MIN-277 — a page writing bears ITS AUTHOR and archives what it
 * recouvre, ou l'historique ment.
 *
 * The twin of `pages-search-paths.test.ts`, and for the same basic reason:
 * nothing, in the schema or in the types, forces a write path to
 * ask `updated_by` nor insert its `page_versions` line. A path that
 * forgetting does not break anything visible — it makes writing anonymous and
 * irreversible, which is only discovered on the day of the incident, when
 * someone asks “who wrote that” and “give me the earlier version”.
 *
 * The rule, which can be reread without tracing the calls: **in
 * `lib/server/pages.ts`, any function that writes `content` calls `writtenBy`
 * AND `stampPageWrite`.** A path added later without one of the two does
 * fail this test by naming the offending function.
 *
 * `stampPageWrite` does not archive anything on a creation (`previous: null`): the point
 * of appeal is kept there expressly, so that the rule has no exception to
 * remember — and so that this test remains a reading, not a list of cases.
 *
 * What it does not claim to cover: that the archiving keeps the GOOD state, nor that the
 * coalescence coalescence. That's `pages.test.ts`, which runs the real thing
 * kernel on a table in memory.
 *
 * MIN-278 adds a third obligation, of the same family and for the same
 * reason: **a write path ANNOUNCES what it does** (`announcePageWrite`)
 * — his line of activity, the people he just mentioned, and the launcher of the run
 * when it is the agent who writes. A path that forgets it does not break anything visible
 * either: it renders a page that changes without anything happening, which was
 * exactly the state before.
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
 * Without it, the analysis would include the insertion of a HISTORY line
 * (`page_versions`, which also has a column `content`) as a path
 * of page writing, and would require the archiver to archive itself.
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
 * The functions that WRITE the body, and those that sign/archive.
 *
 * Same analysis as for the search projection: a `.insert(…)` /
 * `.update(…)` which carries `content`, in the literal that is passed to it or in a
 * variable constructed above (`patch`, `rows`). The basket and the
 * restoration also write the table but never the body — they must not
 * donc rien signer d'autre que ce qu'elles touchent.
 */
function scan() {
  const src = parsePages();
  const writes = new Set<string>();
  const signed = new Set<string>();
  const archived = new Set<string>();
  const announced = new Set<string>();

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
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      if (node.expression.text === "writtenBy") signed.add(enclosingFunction(node));
      if (node.expression.text === "stampPageWrite") {
        archived.add(enclosingFunction(node));
      }
      if (node.expression.text === "announcePageWrite") {
        announced.add(enclosingFunction(node));
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(src);

  return { writes, signed, archived, announced };
}

describe("les chemins d'écriture du corps d'une page", () => {
  it("portent tous leur auteur", () => {
    const { writes, signed } = scan();

    // The test is only valid if it SEES the paths: a recasting which would make them
    // invisible to analysis would let it pass in silence.
    expect(writes.size).toBeGreaterThanOrEqual(4);

    const missing = [...writes].filter((fn) => !signed.has(fn));
    expect(
      missing,
      `Ces fonctions de lib/server/pages.ts écrivent le corps d'une page sans ` +
        `dire QUI : ${missing.join(", ")}. Étalez writtenBy(actorId, kind) sur la ` +
        `ligne écrite, sinon l'en-tête de la page nommera le dernier auteur connu ` +
        `— ou personne.`
    ).toEqual([]);
  });

  it("archivent tous l'état qu'ils recouvrent", () => {
    const { writes, archived } = scan();

    const missing = [...writes].filter((fn) => !archived.has(fn));
    expect(
      missing,
      `Ces fonctions de lib/server/pages.ts recouvrent le corps d'une page sans ` +
        `l'archiver : ${missing.join(", ")}. Appelez stampPageWrite avec l'état lu ` +
        `avant l'écriture (previous: null sur une création), sinon ce qu'elles ` +
        `écrasent est perdu pour de bon.`
    ).toEqual([]);
  });

  /**
   * The MIRROR (`syncParentBody`) is the only exception, and it is named here
   * rather than guessed: it is never a gesture in itself — it accompanies
   * always a basket or a restoration, which has already placed its line. In
   * holding for a second would read “X modified Folder” on each subpage
   * deleted.
   */
  const MIRROR = "syncParentBody";

  it("annoncent tous ce qu'ils font (MIN-278)", () => {
    const { writes, announced } = scan();

    const missing = [...writes].filter(
      (fn) => fn !== MIRROR && !announced.has(fn)
    );
    expect(
      missing,
      `Ces fonctions de lib/server/pages.ts écrivent une page sans rien en dire : ` +
        `${missing.join(", ")}. Appelez announcePageWrite — sinon la page change, ` +
        `personne n'est prévenu et l'activité du projet reste muette.`
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
