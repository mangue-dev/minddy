import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as React from "react";
import ts from "typescript-api";
import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import { RelationTargetPicker } from "@/components/relation-target-picker";
import type { IssueCard } from "@/components/issue-card";
import type { KanbanBoard } from "@/components/kanban-board";
import type { KanbanColumn } from "@/components/kanban-column";
import type { GlobalKanbanBoard } from "@/components/global-kanban-board";
import type { GlobalKanbanColumn } from "@/components/global-kanban-column";
import type { ChipRelation } from "@/components/relation-chips";
import type { Issue, IssueRelationType, Objective } from "./types";
import type { RelationKinds } from "./use-issue-relations-query";
import { isClosedStatus } from "./issue-constants";
import en from "@/messages/en.json";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: keyof typeof en.Relations) => en.Relations[key],
}));
vi.mock("mangue-ui", () => ({ CommandGroup: "group", CommandItem: "item" }));
vi.mock("@/components/command-anchor", () => ({ CommandAnchor: "anchor" }));
vi.mock("@/components/issue-indicators", () => ({
  StatusIndicator: "issue-status", ObjectiveStatusIndicator: "objective-status",
}));

beforeEach(() => vi.stubGlobal("React", React));
afterEach(() => vi.unstubAllGlobals());

type PickerProps = React.ComponentProps<typeof RelationTargetPicker>;
type CardAdd = NonNullable<React.ComponentProps<typeof IssueCard>["onAddRelation"]>;
type ProjectAdd = React.ComponentProps<typeof KanbanBoard>["onAddRelation"];
type ProjectColumnAdd = React.ComponentProps<typeof KanbanColumn>["onAddRelation"];
type GlobalAdd = NonNullable<React.ComponentProps<typeof GlobalKanbanBoard>["onAddRelation"]>;
type GlobalColumnAdd = NonNullable<React.ComponentProps<typeof GlobalKanbanColumn>["onAddRelation"]>;

function source(file: string) {
  return ts.createSourceFile(file, readFileSync(resolve(import.meta.dirname, "..", "components", file), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}

function find(root: ts.Node, predicate: (node: ts.Node) => boolean): ts.Node {
  let result: ts.Node | undefined;
  function visit(node: ts.Node) {
    if (result) return;
    if (predicate(node)) result = node;
    else ts.forEachChild(node, visit);
  }
  visit(root);
  if (!result) throw new Error("Expected source expression was not found");
  return result;
}

function initializer(file: string, name: string) {
  const root = source(file);
  const node = find(root, (node) => ts.isVariableDeclaration(node) && node.name.getText(root) === name) as ts.VariableDeclaration;
  return node.initializer!.getText(root);
}

function prop(file: string, component: string, name: string) {
  const root = source(file);
  const node = find(root, (node) => ts.isJsxSelfClosingElement(node) && node.tagName.getText(root) === component) as ts.JsxSelfClosingElement;
  const attribute = node.attributes.properties.find((node) => ts.isJsxAttribute(node) && node.name.getText(root) === name) as ts.JsxAttribute;
  return (attribute.initializer as ts.JsxExpression).expression!.getText(root);
}

function evaluate<T>(expression: string, scope: Record<string, unknown>): T {
  const compiled = ts.transpileModule(`const result = ${expression};`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  return new Function(...Object.keys(scope), `${compiled}\nreturn result;`)(...Object.values(scope)) as T;
}

function elements(node: React.ReactNode): React.ReactElement<Record<string, unknown>>[] {
  return React.Children.toArray(node).flatMap((child) => {
    if (!React.isValidElement<Record<string, unknown>>(child)) return [];
    return [child, ...elements(child.props.children as React.ReactNode)];
  });
}

const issue = { id: "issue", project_id: "project", number: 1, title: "Source", status: "todo" } as Issue;
const other = { ...issue, id: "other", number: 2, title: "Target issue" };
const objective = { id: "objective", project_id: "project", name: "Target objective", status: "planned" } as Objective;
const types: IssueRelationType[] = ["blocks", "blocked_by", "related"];
const useMemo = (callback: () => unknown) => callback();

function candidates(relationType: IssueRelationType | null, relations: ChipRelation[] = []) {
  const issues = [issue, other, { ...other, id: "closed", status: "done" }, { ...other, id: "foreign", project_id: "elsewhere" }];
  const objectives = [objective, { ...objective, id: "active", status: "in_progress" }, { ...objective, id: "done", status: "done" }, { ...objective, id: "canceled", status: "canceled" }, { ...objective, id: "foreign", project_id: "elsewhere" }];
  const scope = {
    useMemo, relationType, relations, issue, isClosedStatus,
    getCandidateIssues: () => issues,
    objectiveMap: new Map(objectives.map((item) => [item.id, item])),
  };
  const relationCandidates = evaluate<Issue[]>(initializer("issue-card.tsx", "relationCandidates"), scope);
  const relationObjectiveCandidates = evaluate<Objective[]>(initializer("issue-card.tsx", "relationObjectiveCandidates"), scope);
  const values = { relationCandidates, relationObjectiveCandidates };
  return {
    issues: evaluate<Issue[]>(prop("issue-card.tsx", "RelationTargetPicker", "issues"), values),
    objectives: evaluate<Objective[]>(prop("issue-card.tsx", "RelationTargetPicker", "objectives"), values),
  };
}

function cardSelection(relationType: IssueRelationType | null, onAddRelation: CardAdd) {
  const setRelationType = vi.fn();
  const onSelect = evaluate<PickerProps["onSelect"]>(prop("issue-card.tsx", "RelationTargetPicker", "onSelect"), {
    issue, relationType, onAddRelation, setRelationType,
  });
  return { onSelect, setRelationType };
}

function projectHandler(onAddRelation: ProjectAdd): CardAdd {
  const column = evaluate<ProjectColumnAdd>(prop("kanban-board.tsx", "KanbanColumn", "onAddRelation"), { onAddRelation });
  return evaluate<CardAdd>(prop("kanban-column.tsx", "IssueCard", "onAddRelation"), { onAddRelation: column });
}

function globalHandler(onAddRelation: GlobalAdd): CardAdd {
  const column = evaluate<GlobalColumnAdd>(prop("global-kanban-board.tsx", "GlobalKanbanColumn", "onAddRelation"), { onAddRelation });
  const bind = evaluate<(projectId: string) => { onAddRelation: CardAdd }>(initializer("global-kanban-column.tsx", "bindToProject"), {
    useMemo, onAddRelation: column, getCandidateIssues: undefined,
    onUpdateIssue: vi.fn(), onSetCategories: vi.fn(), onDeleteIssue: undefined,
  });
  const bound = bind(issue.project_id);
  expect(bind(issue.project_id)).toBe(bound);
  return evaluate<CardAdd>(prop("global-kanban-column.tsx", "IssueCard", "onAddRelation"), { bound });
}

describe("card relation target picker", () => {
  it("preserves endpoint kinds in every callback contract", () => {
    expectTypeOf<Parameters<CardAdd>[3]>().toEqualTypeOf<RelationKinds | undefined>();
    expectTypeOf<Parameters<ProjectAdd>[3]>().toEqualTypeOf<RelationKinds | undefined>();
    expectTypeOf<Parameters<ProjectColumnAdd>[3]>().toEqualTypeOf<RelationKinds | undefined>();
    expectTypeOf<Parameters<GlobalAdd>[4]>().toEqualTypeOf<RelationKinds | undefined>();
    expectTypeOf<Parameters<GlobalColumnAdd>[4]>().toEqualTypeOf<RelationKinds | undefined>();
  });

  it.each(types)("filters project-only open candidates for %s without excluding other relation types", (type) => {
    const linked = (relation: IssueRelationType): ChipRelation[] => [
      { id: "issue-link", otherId: other.id, relation, otherType: "issue", resolved: false },
      { id: "objective-link", otherId: objective.id, relation, otherType: "objective", resolved: false },
    ];
    expect(candidates(type).issues.map((item) => item.id)).toEqual([other.id]);
    expect(candidates(type).objectives.map((item) => item.id)).toEqual([objective.id, "active"]);
    expect(candidates(type, linked(type)).issues).toEqual([]);
    expect(candidates(type, linked(type)).objectives.map((item) => item.id)).toEqual(["active"]);
    for (const otherType of types.filter((value) => value !== type)) {
      expect(candidates(type, linked(otherType))).toEqual(candidates(type));
    }
  });

  it.each(types)("sends actual issue and objective picker selections through both boards for %s", (relation) => {
    for (const board of ["project", "global"] as const) {
      const add = vi.fn();
      const handler = board === "project" ? projectHandler(add) : globalHandler(add);
      const { onSelect, setRelationType } = cardSelection(relation, handler);
      const onClose = vi.fn();
      const tree = RelationTargetPicker({ position: { x: 10, y: 20 }, relation, ...candidates(relation), projectKey: "MIN", onSelect, onClose });
      const nodes = elements(tree);
      expect(nodes.some((node) => node.props.heading === en.Relations.objectives)).toBe(true);
      expect(nodes.some((node) => node.props.heading === en.Relations[relation])).toBe(true);
      for (const [target, kind, keywords] of [[other.id, "issue", ["MIN-2", other.title]], [objective.id, "objective", [objective.name]]] as const) {
        const item = nodes.find((node) => node.props.value === target)!;
        expect(item.props.keywords).toEqual(keywords);
        (item.props.onSelect as () => void)();
        const expected = [issue.id, relation, target, ...(board === "global" ? [issue.project_id] : []), { targetType: kind }];
        expect(add).toHaveBeenLastCalledWith(...expected);
        expect(setRelationType).toHaveBeenLastCalledWith(null);
      }
      expect(onClose).toHaveBeenCalledTimes(2);
    }
  });

  it("stays closed without a position or relation and handles no objectives", () => {
    const props: PickerProps = { position: null, relation: "related", issues: [other], objectives: [], projectKey: "MIN", onClose: vi.fn(), onSelect: vi.fn() };
    expect(RelationTargetPicker(props)).toBeNull();
    expect(RelationTargetPicker({ ...props, position: { x: 0, y: 0 }, relation: null })).toBeNull();
    expect(candidates(null)).toEqual({ issues: [], objectives: [] });
    const nodes = elements(RelationTargetPicker({ ...props, position: { x: 0, y: 0 } }));
    expect(nodes.some((node) => node.props.heading === en.Relations.objectives)).toBe(false);
    expect(nodes.some((node) => node.props.value === other.id)).toBe(true);
    const add = vi.fn();
    cardSelection(null, add).onSelect(objective.id, "objective");
    expect(add).not.toHaveBeenCalled();
  });
});
