import { readFileSync } from "node:fs";
import { join } from "node:path";

// `typescript-api` is an alias to `typescript@5` (see package.json): from
// MIN-180 the repository checks with `typescript@7`, which no longer ships the API
// compiler. Source-structure tests use the TypeScript 5 API alias for this reason.
import ts from "typescript-api";
import { describe, expect, it } from "vitest";

import {
  AGENT_TOOLS,
  NOTEBOOK_AGENT_TOOLS,
  CANONICAL_AGENT_TOOLS,
  type AgentToolDef,
} from "./tools";

/**
 * ANY TOOL SERVED TO THE AGENT HAS HIS LINE IN THE THREAD.
 *
 * `TOOL_META` ([tool-call-display.tsx](../../../components/assistant/tool-call-display.tsx))
 * is the table that gives a call its icon and phrase. A tool that is not there
 * does not raise anything: it falls back to `getDefaultLabel`, that is to say
 * "Processing..." then "Finished", under the grid icon of the fallback.
 *
 * What it cost. `create_pr` was not there — the MOST visible act of a run,
 * the one that does the work, appeared as an anonymous line in the middle of
 * twelve named file reads, them. Eleven other tools were in the same case: the three writes of a proofreading session, the six tools of the project's pull requests, the verdict of a chain, the reading of a page and that of a return from the board. No type-check says this: `TOOL_META` is a
 * `Record<string, ToolMeta>`, it accepts any set of keys.
 *
 * A STRUCTURAL test, because the component is from the React client and the suite
 * does not mount anything (`environment: "node"`, `include: ["lib/**"]`). We therefore do not render
 * the line: we read the keys of the table in the syntactic tree, and we oppose them to the sets of tools that the server really uses.
 */

const DISPLAY_PATH = join(
  process.cwd(),
  "components/assistant/tool-call-display.tsx",
);

/** The keys of the literal object `TOOL_META`, read from the tree. */
function toolMetaKeys(): Set<string> {
  const src = ts.createSourceFile(
    DISPLAY_PATH,
    readFileSync(DISPLAY_PATH, "utf8"),
    ts.ScriptTarget.ESNext,
    true,
  );
  let literal: ts.ObjectLiteralExpression | null = null;
  const visit = (node: ts.Node) => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === "TOOL_META" &&
      node.initializer &&
      ts.isObjectLiteralExpression(node.initializer)
    ) {
      literal = node.initializer;
    }
    ts.forEachChild(node, visit);
  };
  visit(src);
  const found = literal as ts.ObjectLiteralExpression | null;
  if (!found)
    throw new Error("TOOL_META introuvable dans tool-call-display.tsx");
  const keys = new Set<string>();
  for (const prop of found.properties) {
    const name = prop.name;
    if (!name) continue;
    if (ts.isIdentifier(name) || ts.isStringLiteral(name)) keys.add(name.text);
  }
  return keys;
}

const names = (tools: AgentToolDef[]) => tools.map((t) => t.function.name);

describe("les lignes du fil d'un run", () => {
  it("nomme les 3 jeux de tools de l'agent, sans exception", () => {
    const keys = toolMetaKeys();
    const served = new Set([
      ...names(AGENT_TOOLS),
      ...names(NOTEBOOK_AGENT_TOOLS),
      ...names(CANONICAL_AGENT_TOOLS),
    ]);
    /**
     * `update_plan` and `ask_user` are CONTROL tools: the first never
     * ever becomes a `tool_call` (it starts as an `plan_update` event, rendered by the
     * card above the composer), the second becomes an event `question`. They
     * therefore do not have a line to carry — `ask_user` has one anyway, for the
     * past questions from Numo's thread.
     */
    served.delete("update_plan");
    expect([...served].filter((name) => !keys.has(name)).sort()).toEqual([]);
  });

  it("nomme `webfetch`, qui arrive sous le nom d'opencode", () => {
    // Only thread tool that does not have a house opposite: it is not in any game
    // of `tools.ts` (it is an opencode integrated, cf. `ourToolName`), so the
    // control above doesn't see it.
    expect(toolMetaKeys().has("webfetch")).toBe(true);
  });
});
