import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript-api";
import { describe, expect, it, vi } from "vitest";
import { resolveRelations } from "./relation-constants";
import type { ChipRelation } from "@/components/relation-chips";

function source(file: string) {
  return ts.createSourceFile(file, readFileSync(resolve(import.meta.dirname, "..", file), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}

function find(root: ts.Node, predicate: (node: ts.Node) => boolean): ts.Node {
  let found: ts.Node | undefined;
  function visit(node: ts.Node) {
    if (found) return;
    if (predicate(node)) found = node;
    else ts.forEachChild(node, visit);
  }
  visit(root);
  if (!found) throw new Error("Expected source expression was not found");
  return found;
}

function initializer(file: string, name: string) {
  const root = source(file);
  const node = find(root, (node) => ts.isVariableDeclaration(node) && node.name.getText(root) === name) as ts.VariableDeclaration;
  return node.initializer!.getText(root);
}

function evaluate<T>(expression: string, scope: Record<string, unknown>): T {
  const compiled = ts.transpileModule(`const result = ${expression};`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  return new Function(...Object.keys(scope), `${compiled}\nreturn result;`)(...Object.values(scope)) as T;
}

const memo = (callback: () => unknown) => callback();
const callback = (fn: unknown) => fn;

describe("issue panel relation plumbing", () => {
  it.each([
    "components/pull-requests/pr-issue-panel.tsx",
    "components/feedback/feedback-team-page.tsx",
  ])("forwards objective kinds through %s", (file) => {
    const addRelation = vi.fn().mockResolvedValue(undefined);
    const handler = evaluate<(...args: unknown[]) => void>(initializer(file, "handleAddRelation"), {
      useCallback: callback, addRelation, toast: { error: vi.fn() },
    });
    const kinds = { targetType: "objective" };
    for (const type of ["blocks", "blocked_by", "related"]) {
      handler("issue", type, "objective", kinds);
      expect(addRelation).toHaveBeenLastCalledWith("issue", type, "objective", kinds);
    }
    handler("issue", "related", "other-issue");
    expect(addRelation).toHaveBeenLastCalledWith("issue", "related", "other-issue", undefined);
  });

  it("forwards kinds through both global-board panel wrappers", () => {
    const file = "components/global-board.tsx";
    const addRelation = vi.fn().mockResolvedValue(undefined);
    const handleAddRelation = evaluate(initializer(file, "handleAddRelation"), {
      useCallback: callback, addRelation, toast: { error: vi.fn() },
    });
    const root = source(file);
    const panel = find(root, (node) => ts.isJsxSelfClosingElement(node) && node.tagName.getText(root) === "IssueSidePanel") as ts.JsxSelfClosingElement;
    const attribute = panel.attributes.properties.find((node) => ts.isJsxAttribute(node) && node.name.getText(root) === "onAddRelation") as ts.JsxAttribute;
    const expression = (attribute.initializer as ts.JsxExpression).expression!;
    const handler = evaluate<(...args: unknown[]) => void>(expression.getText(root), { handleAddRelation, openPid: "project" });
    const kinds = { targetType: "objective" };
    handler("issue", "blocked_by", "objective", kinds);
    expect(addRelation).toHaveBeenCalledWith("project", "issue", "blocked_by", "objective", kinds);
  });

  it("hydrates objective rows and recomputes resolved state from updated objective statuses", () => {
    const expression = initializer("components/issue-side-panel.tsx", "resolvedRelations");
    const issue = { id: "issue", number: 1, status: "todo" };
    const relations = [{ id: "relation", source_id: "objective", source_type: "objective", target_id: "issue", target_type: "issue", type: "blocks" }];
    for (const [status, resolved] of [["planned", false], ["in_progress", false], ["done", true], ["canceled", true], ["planned", false]] as const) {
      const rows = evaluate<ChipRelation[]>(expression, {
        useMemo: memo, issue, allIssues: [issue], relations, resolveRelations,
        objectives: [{ id: "objective", name: "Release", status }],
      });
      expect(rows).toEqual([{
        id: "relation", relation: "blocked_by", otherId: "objective", otherType: "objective", otherName: "Release", resolved,
      }]);
    }
    const root = source("components/issue-side-panel.tsx");
    const declaration = find(root, (node) => ts.isVariableDeclaration(node) && node.name.getText(root) === "resolvedRelations") as ts.VariableDeclaration;
    const dependencies = (declaration.initializer as ts.CallExpression).arguments[1] as ts.ArrayLiteralExpression;
    expect(dependencies.elements.map((node) => node.getText(root))).toContain("objectives");
  });
});
