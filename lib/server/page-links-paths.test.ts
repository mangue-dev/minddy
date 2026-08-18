import { readFileSync } from "node:fs";
import { join } from "node:path";

// `typescript-api` is an alias to `typescript@5` (see package.json and CLAUDE.md):
// since MIN-180 the repository checks with `typescript@7`, which no longer ships the API
// from the compiler. Structural tests therefore have their own TypeScript, in JS.
import ts from "typescript-api";
import { describe, expect, it } from "vitest";

/**
 * MIN-279 — trackbacks are written by ALL write paths, or they
 * lie.
 *
 * `page_links` is a DERIVED table, like `pages.search_text` (MIN-276) and
 * like history (MIN-277). Nothing, neither in the schema nor in the types,
 * forces a write path to keep it up to date. And the default here has one more unpleasant property: it is invisible **from the surface that we have just written**. A ticket whose description quotes "@Spec" displays
 * perfectly; it's the Spec page, somewhere else, at someone else's, which
 * will forever be unaware that it's being relied on.
 *
 * This is exactly the kind of hole that a behavior test doesn't find:
 * you'd have to have GUESSED the missing path to write the case that does covers.
 * Hence a STRUCTURAL test, which GOES through the files instead of listing
 * scenarios, and which contains one rule per family:
 *
 * • **a DESCRIPTION** — in create-issue.ts, update-issue.ts and
 * objectives.ts, any function that calls `notifyDescriptionMentions`
 * calls `queuePageLinks`. The marker is not arbitrary: it is already the
 * point of convergence of "a description has just been written", the one by
 * which the route, the MCP (`minddy_edit_issue_text`,
 * `minddy_update_objective`), Numo and the code agent pass — all pass again by
 * `updateIssueFields` / `updateObjective`.
 *
 * • **a page BODY** — in pages.ts, any function that calls
 * `queueSearchText` calls `queuePageBodyLinks`. Same marker as MIN-276,
 * for the same reason: both derive from the same text, at the same time.
 *
 * What the test does not claim to cover: that the derivation produces the GOOD
 * links. This is `page-links.test.ts`, which runs the real module on a
 * table in memory.
 */

function parse(relative: string): ts.SourceFile {
  const path = join(process.cwd(), relative);
  return ts.createSourceFile(
    path,
    readFileSync(path, "utf8"),
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

/**
 * The functions of a file which call this function, by their name.
 *
 * The ENCLOSING function and not the immediate function: in create-issue.ts and
 * update-issue.ts, the side effects live in a closure `runSideEffects`
 * declared inside the gesture — it is indeed the gesture that we want to name, but
 * the closure is a stable name which designates it, and the two markers fall there
 * together. That's all the rule asks for: both in the SAME place.
 */
function callersOf(src: ts.SourceFile, callee: string): Set<string> {
  const found = new Set<string>();
  const visit = (node: ts.Node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === callee
    ) {
      found.add(enclosingFunction(node));
    }
    ts.forEachChild(node, visit);
  };
  visit(src);
  return found;
}

describe("les chemins d'écriture d'une description", () => {
  const FILES = [
    "lib/server/create-issue.ts",
    "lib/server/update-issue.ts",
    "lib/server/objectives.ts",
  ];

  it("réécrivent tous les pages qu'ils citent", () => {
    const missing: string[] = [];
    let seen = 0;

    for (const file of FILES) {
      const src = parse(file);
      const writes = callersOf(src, "notifyDescriptionMentions");
      const links = callersOf(src, "queuePageLinks");
      seen += writes.size;
      for (const fn of writes) {
        if (!links.has(fn)) missing.push(`${file} → ${fn}`);
      }
    }

    // The test is only valid if it SEES the paths: a redesign which would make them
    // invisible to analysis would let it pass silently. Four today
    // — creation and modification of a ticket and a goal.
    expect(seen).toBeGreaterThanOrEqual(4);

    expect(
      missing,
      `Ces fonctions écrivent une description sans rejouer ses rétroliens : ` +
        `${missing.join(", ")}. Appelez queuePageLinks avec la source et le ` +
        `texte, sinon les pages qu'elle cite ignoreront qu'elles le sont.`
    ).toEqual([]);
  });
});

describe("les chemins d'écriture du corps d'une page", () => {
  it("réécrivent tous les pages qu'ils citent", () => {
    const src = parse("lib/server/pages.ts");
    const writes = callersOf(src, "queueSearchText");
    const links = callersOf(src, "queuePageBodyLinks");

    expect(writes.size).toBeGreaterThanOrEqual(4);

    const missing = [...writes].filter((fn) => !links.has(fn));
    expect(
      missing,
      `Ces fonctions de lib/server/pages.ts écrivent le corps d'une page sans ` +
        `rejouer ses liens : ${missing.join(", ")}. Appelez queuePageBodyLinks ` +
        `avec les ids écrits, à côté de queueSearchText — les deux dérivent du ` +
        `même texte au même instant.`
    ).toEqual([]);
  });
});
