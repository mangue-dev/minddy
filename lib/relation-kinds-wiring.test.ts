import { readFileSync } from "node:fs";
import { join } from "node:path";

// `typescript-api` is an alias to `typescript@5` (see package.json and CLAUDE.md):
// since MIN-180 the repository checks with `typescript@7`, which no longer ships
// the compiler API. Structural tests therefore have their own TypeScript, in JS.
import ts from "typescript-api";
import { describe, expect, it } from "vitest";

/**
 * MIN-513 — a relation may now end on an objective (`source_type` /
 * `target_type`), and every surface that relays a relation must carry the
 * endpoint kinds or the cross-kind row is written wrong.
 *
 * Most of these sites are React components and hooks the node test environment
 * cannot mount (side panels, boards, the `/api/me/board` route with its auth
 * and Supabase surface). Behavior tests would need the whole UI harness, so
 * this file follows the structural-test convention already used for
 * `lib/server/pages.ts` (see pages-search-paths.test.ts): parse the sources and
 * assert the wiring that the MIN-513 migration requires. A regression that
 * drops the kinds at any of these sites makes one of these rules fail.
 */

const ROOT = process.cwd();

function parse(relativePath: string): ts.SourceFile {
  const absolute = join(ROOT, relativePath);
  return ts.createSourceFile(
    absolute,
    readFileSync(absolute, "utf8"),
    ts.ScriptTarget.ESNext,
    true
  );
}

function visit(root: ts.Node, onNode: (node: ts.Node) => void): void {
  const walk = (node: ts.Node): void => {
    onNode(node);
    node.forEachChild(walk);
  };
  root.forEachChild(walk);
}

function collectArrowFunctions(sourceFile: ts.SourceFile): ts.ArrowFunction[] {
  const arrows: ts.ArrowFunction[] = [];
  visit(sourceFile, (node) => {
    if (ts.isArrowFunction(node)) arrows.push(node);
  });
  return arrows;
}

/** The arrow whose parameter list starts with these names, in order. */
function findArrow(
  arrows: ts.ArrowFunction[],
  ...parameterNames: string[]
): ts.ArrowFunction | undefined {
  return arrows.find(
    (arrow) =>
      arrow.parameters.length >= parameterNames.length &&
      parameterNames.every(
        (name, index) =>
          ts.isIdentifier(arrow.parameters[index].name) &&
          arrow.parameters[index].name.text === name
      )
  );
}

describe("relation endpoint kinds travel (MIN-513)", () => {
  const prPanel = parse("components/pull-requests/pr-issue-panel.tsx");
  const feedbackPage = parse("components/feedback/feedback-team-page.tsx");
  const globalBoard = parse("components/global-board.tsx");
  const globalQuery = parse("lib/use-global-board-query.ts");
  const meBoardRoute = parse("app/api/me/board/route.ts");
  const sidePanel = parse("components/issue-side-panel.tsx");

  it("the PR issue panel adapter forwards the endpoint kinds", () => {
    const arrow = findArrow(
      collectArrowFunctions(prPanel),
      "sourceId",
      "type",
      "targetId",
      "kinds"
    );
    expect(arrow).toBeDefined();
    expect(arrow!.body.getText()).toContain("kinds");
  });

  it("the feedback team page adapter forwards the endpoint kinds", () => {
    const arrow = findArrow(
      collectArrowFunctions(feedbackPage),
      "sourceId",
      "type",
      "targetId",
      "kinds"
    );
    expect(arrow).toBeDefined();
    expect(arrow!.body.getText()).toContain("kinds");
  });

  it("the global board adapter forwards the endpoint kinds with the project", () => {
    const arrow = findArrow(
      collectArrowFunctions(globalBoard),
      "sourceId",
      "type",
      "targetId",
      "projectId",
      "kinds"
    );
    expect(arrow).toBeDefined();
    expect(arrow!.body.getText()).toContain("kinds");
  });

  it("useGlobalBoardQuery.addRelation accepts and transports the kinds", () => {
    const arrow = findArrow(
      collectArrowFunctions(globalQuery),
      "sourceId",
      "type",
      "targetId",
      "kinds"
    );
    expect(arrow).toBeDefined();
    const body = arrow!.body.getText();
    expect(body).toContain("kinds?.sourceType");
    expect(body).toContain("kinds?.targetType");
  });

  it("the /api/me/board SELECT reads the endpoint kind columns", () => {
    const selects: string[] = [];
    visit(meBoardRoute, (node) => {
      if (
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        node.expression.name.text === "select"
      ) {
        selects.push(node.arguments[0]?.getText() ?? "");
      }
    });
    expect(selects).toContainEqual(
      '"id, source_id, target_id, type, source_type, target_type"'
    );
  });

  it("the issue side panel resolves blockages with the objective status map", () => {
    const calls: ts.CallExpression[] = [];
    visit(sidePanel, (node) => {
      if (
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === "resolveRelations"
      ) {
        calls.push(node);
      }
    });
    expect(calls).toHaveLength(1);
    expect(calls[0].arguments).toHaveLength(4);
  });
});
