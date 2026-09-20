import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript-api";
import { describe, expect, it, vi } from "vitest";
import { issueIdentifier } from "./issue-constants";
import {
  buildIssueCustomPrompt,
  buildIssuePlanPrompt,
  buildIssuePrompt,
  buildIssueVerifyPrompt,
} from "./issue-prompt";
import { resolveRelationsByIssue } from "./relation-constants";
import type { ChipRelation } from "@/components/relation-chips";
import type { Issue, IssueRelation, Objective } from "./types";

function evaluateInitializer<T>(file: string, name: string, scope: Record<string, unknown>): T {
  const source = ts.createSourceFile(
    file,
    readFileSync(resolve(import.meta.dirname, "..", "components", file), "utf8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  let expression: string | undefined;
  function visit(node: ts.Node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === name) {
      expression = node.initializer?.getText(source);
    } else {
      ts.forEachChild(node, visit);
    }
  }
  visit(source);
  if (!expression) throw new Error(`Missing initializer: ${name}`);
  const compiled = ts.transpileModule(`const result = ${expression};`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  return new Function(...Object.keys(scope), `${compiled}\nreturn result;`)(...Object.values(scope)) as T;
}

const issue = {
  id: "issue", project_id: "project", number: 42, title: "Keyboard navigation",
  status: "todo", priority: "high", category_ids: ["category"], plan: null,
} as Issue;
const other = { ...issue, id: "other", number: 7, title: "Command palette" };
const objective = { id: "objective", name: "Accessible workspace", status: "planned" } as Objective;
const objectiveMap = new Map([[objective.id, objective]]);
const allIssueMap = new Map([issue, other].map((value) => [value.id, value]));
const relations: IssueRelation[] = [
  { id: "incoming", source_id: "objective", source_type: "objective", target_id: "issue", target_type: "issue", type: "blocks" },
  { id: "outgoing", source_id: "issue", source_type: "issue", target_id: "objective", target_type: "objective", type: "blocks" },
  { id: "related", source_id: "objective", source_type: "objective", target_id: "issue", target_type: "issue", type: "related" },
  { id: "issue-link", source_id: "other", source_type: "issue", target_id: "issue", target_type: "issue", type: "blocks" },
] as IssueRelation[];

function boardRelations(file: string) {
  return evaluateInitializer<Map<string, ChipRelation[]>>(file, "relationsByIssue", {
    useMemo: (callback: () => unknown) => callback(),
    issues: [issue], relations, allIssueMap, resolveRelationsByIssue,
  }).get(issue.id)!;
}

function promptContext(rows?: ChipRelation[], objectives = objectiveMap) {
  return evaluateInitializer<() => object>("issue-card.tsx", "promptContext", {
    issue, projectKey: "MIN", relations: rows, objectiveMap: objectives,
    getCandidateIssues: () => [...allIssueMap.values()],
    categoryMap: new Map([["category", { name: "UI" }]]), issueIdentifier,
  });
}

describe.each(["kanban-board.tsx", "global-kanban-board.tsx"])("%s copied prompt relations", (file) => {
  it.each(["copyPrompt", "copyPlanPrompt", "copyVerifyPrompt", "runCustomPrompt"])("includes objective and hidden issue targets in %s", async (handlerName) => {
    const rows = boardRelations(file);
    expect(rows).toHaveLength(4);
    expect(rows.filter((row) => row.otherType === "objective")).toHaveLength(3);
    const writeText = vi.fn().mockResolvedValue(undefined);
    const handler = evaluateInitializer<(...args: unknown[]) => Promise<void>>("issue-card.tsx", handlerName, {
      issue, projectId: "project", projectKey: "MIN", issueHasPlan: false,
      promptContext: promptContext(rows), buildIssuePrompt, buildIssuePlanPrompt,
      buildIssueVerifyPrompt, buildIssueCustomPrompt,
      handOffIssueApi: vi.fn(), resolvePromptCopyAutoStart: () => false,
      shouldAutoStartOnPromptCopy: () => false, user: null,
      navigator: { clipboard: { writeText } }, toast: { success: vi.fn() },
      t: (key: string) => key, tPlan: (key: string) => key,
    });
    await handler("Check keyboard navigation", "copy");
    const prompt = writeText.mock.calls[0][0] as string;
    for (const type of ["blocks", "blocked_by", "related"]) {
      expect(prompt).toContain(`<relation type="${type}" target="objective">\n      <identifier></identifier>\n      <title>Accessible workspace</title>`);
    }
    expect(prompt).toContain("<identifier>MIN-7</identifier>\n      <title>Command palette</title>");
    expect(prompt).toContain("<category>UI</category>");
    expect(prompt).not.toContain("MIN-0");
  });

  it("keeps objective relations out of compact chips", () => {
    const active = evaluateInitializer<ChipRelation[]>("relation-chips.tsx", "active", {
      relations: boardRelations(file),
    });
    expect(active.map((row) => row.otherId)).toEqual(["other"]);
  });
});

describe("issue card prompt context", () => {
  it("reads updated objective names and supports pre-hydrated names without a map entry", () => {
    const rows = boardRelations("kanban-board.tsx");
    const renamed = new Map([[objective.id, { ...objective, name: "Updated goal" }]]);
    expect(buildIssuePlanPrompt({ issue, projectId: "project", projectKey: "MIN", ...promptContext(rows, renamed)() }))
      .toContain("<title>Updated goal</title>");
    expect(promptContext([{ ...rows[0], otherName: "Fallback goal" }], new Map())())
      .toMatchObject({ relations: [{ objective: true, identifier: "", title: "Fallback goal" }] });
  });

  it("handles absent relations and legacy issue endpoints", () => {
    expect(promptContext()()).toMatchObject({ relations: [], categories: ["UI"] });
    expect(promptContext([{ id: "legacy", relation: "related", otherId: "other", otherNumber: 7, resolved: false }])())
      .toMatchObject({ relations: [{ objective: false, identifier: "MIN-7", title: "Command palette" }] });
  });

  it("preserves objective context when the plan prompt switches to review", () => {
    const prompt = buildIssuePlanPrompt({
      issue: { ...issue, plan: "- [ ] Verify keyboard navigation" },
      projectId: "project", projectKey: "MIN",
      ...promptContext(boardRelations("kanban-board.tsx"))(),
    });
    expect(prompt).toContain("Review the implementation plan");
    expect(prompt).toContain('target="objective"');
    expect(prompt).toContain("<title>Accessible workspace</title>");
  });
});
