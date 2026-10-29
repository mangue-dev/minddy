import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as React from "react";
import ts from "typescript-api";
import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import { relationPickerRequest, type RelationPickerLabels, type RelationPickerOptions } from "@/components/palette-picker-rows";
import type { IssueCard } from "@/components/issue-card";
import type { KanbanBoard } from "@/components/kanban-board";
import type { KanbanColumn } from "@/components/kanban-column";
import type { GlobalKanbanBoard } from "@/components/global-kanban-board";
import type { GlobalKanbanColumn } from "@/components/global-kanban-column";
import type { ChipRelation } from "@/components/relation-chips";
import type { Issue, IssueRelationType, Objective } from "./types";
import type { RelationMenuKind } from "./issue-hierarchy";
import type { RelationKinds } from "./use-issue-relations-query";
import { isClosedStatus } from "./issue-constants";
import { hasDirectRelation } from "./issue-shortcut-targets";
import { hierarchyCandidates, hierarchyPatches, isHierarchyRelation } from "./issue-hierarchy";
import en from "@/messages/en.json";

vi.mock("@/components/issue-indicators", () => ({
  StatusIndicator: "issue-status", ObjectiveStatusIndicator: "objective-status", RelationIcon: "relation-icon",
}));

beforeEach(() => vi.stubGlobal("React", React));
afterEach(() => vi.unstubAllGlobals());

type PickIssue = RelationPickerOptions["onPickIssue"];
type PickObjective = RelationPickerOptions["onPickObjective"];
/** A choice in the card's relation picker: an issue or an objective row. */
type CardSelect = (targetId: string, kind: "issue" | "objective") => void;
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

const labels: RelationPickerLabels = {
  issues: en.Issue.entityPlural,
  objectives: en.Relations.objectives,
  loading: en.Common.loading,
  pick: (type) => en.Relations[`pick_${type}`],
};

/** The card's request for `relation`, wired to its own pick handlers. */
function cardRequest(relation: RelationMenuKind, select: CardSelect, extra: Partial<RelationPickerOptions> = {}) {
  return relationPickerRequest({
    scope: "card", step: relation, projectKey: "MIN", projectId: issue.project_id,
    ...candidates(relation),
    onPickIssue: (_type, targetId) => select(targetId, "issue"),
    onPickObjective: (_type, objectiveId) => select(objectiveId, "objective"),
    onClose: vi.fn(),
    ...extra,
  }, labels);
}

const issue = { id: "issue", project_id: "project", number: 1, title: "Source", status: "todo" } as Issue;
const other = { ...issue, id: "other", number: 2, title: "Target issue" };
const objective = { id: "objective", project_id: "project", name: "Target objective", status: "planned" } as Objective;
const types: IssueRelationType[] = ["blocks", "blocked_by", "related"];
const useMemo = (callback: () => unknown) => callback();

function candidates(
  relationType: RelationMenuKind | null,
  relations: ChipRelation[] = [],
  targets: Issue[] = [issue],
  relationsById: Record<string, ChipRelation[]> = {},
) {
  const issues = [issue, other, { ...other, id: "closed", status: "done" }, { ...other, id: "foreign", project_id: "elsewhere" }];
  const objectives = [objective, { ...objective, id: "active", status: "in_progress" }, { ...objective, id: "done", status: "done" }, { ...objective, id: "canceled", status: "canceled" }, { ...objective, id: "foreign", project_id: "elsewhere" }];
  const scope = {
    useMemo, relationType, relations, issue, isClosedStatus, hasDirectRelation,
    isHierarchyRelation, hierarchyCandidates,
    relationTargets: () => targets,
    relationsOf: (id: string) => (id === issue.id ? relations : relationsById[id]),
    getCandidateIssues: () => issues,
    objectiveMap: new Map(objectives.map((item) => [item.id, item])),
  };
  const relationCandidates = evaluate<Issue[]>(initializer("issue-card.tsx", "relationCandidates"), scope);
  const relationObjectiveCandidates = evaluate<Objective[]>(initializer("issue-card.tsx", "relationObjectiveCandidates"), scope);
  const values = { relationCandidates, relationObjectiveCandidates };
  return {
    issues: evaluate<Issue[]>(prop("issue-card.tsx", "RelationPalettePicker", "issues"), values),
    objectives: evaluate<Objective[]>(prop("issue-card.tsx", "RelationPalettePicker", "objectives"), values),
  };
}

function cardSelection(
  relationType: RelationMenuKind | null,
  onAddRelation: CardAdd,
  targets: Issue[] = [issue],
  relationsById: Record<string, ChipRelation[]> = {},
  setParentFromTargets = vi.fn(),
) {
  const closeRelationPicker = vi.fn();
  const addRelationFromTargets = evaluate(initializer("issue-card.tsx", "addRelationFromTargets"), {
    onAddRelation, hasDirectRelation,
    linked: (run: () => void) => run(),
    relationTargets: () => targets,
    relationsOf: (id: string) => relationsById[id],
  });
  const scope = { addRelationFromTargets, closeRelationPicker, isHierarchyRelation, setParentFromTargets };
  const pickIssue = evaluate<PickIssue>(prop("issue-card.tsx", "RelationPalettePicker", "onPickIssue"), scope);
  const pickObjective = evaluate<PickObjective>(prop("issue-card.tsx", "RelationPalettePicker", "onPickObjective"), scope);
  // The card only shows targets once a relation is chosen.
  const onSelect: CardSelect = (targetId, kind) => {
    if (!relationType) return;
    if (kind === "issue") pickIssue(relationType, targetId, other);
    else pickObjective(relationType, targetId, objective);
  };
  return { onSelect, closeRelationPicker };
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

describe("card relation picker (MIN-844)", () => {
  it("preserves endpoint kinds in every callback contract", () => {
    expectTypeOf<Parameters<CardAdd>[3]>().toEqualTypeOf<RelationKinds | undefined>();
    expectTypeOf<Parameters<ProjectAdd>[3]>().toEqualTypeOf<RelationKinds | undefined>();
    expectTypeOf<Parameters<ProjectColumnAdd>[3]>().toEqualTypeOf<RelationKinds | undefined>();
    expectTypeOf<Parameters<GlobalAdd>[4]>().toEqualTypeOf<RelationKinds | undefined>();
    expectTypeOf<Parameters<GlobalColumnAdd>[4]>().toEqualTypeOf<RelationKinds | undefined>();
  });

  it.each(types)("filters project-only candidates, closed issues included, for %s without excluding other relation types", (type) => {
    const linked = (relation: IssueRelationType): ChipRelation[] => [
      { id: "issue-link", otherId: other.id, relation, otherType: "issue", resolved: false },
      { id: "objective-link", otherId: objective.id, relation, otherType: "objective", resolved: false },
    ];
    expect(candidates(type).issues.map((item) => item.id)).toEqual([other.id, "closed"]);
    expect(candidates(type).objectives.map((item) => item.id)).toEqual([objective.id, "active"]);
    expect(candidates(type, linked(type)).issues.map((item) => item.id)).toEqual(["closed"]);
    expect(candidates(type, linked(type)).objectives.map((item) => item.id)).toEqual(["active"]);
    for (const otherType of types.filter((value) => value !== type)) {
      expect(candidates(type, linked(otherType))).toEqual(candidates(type));
    }
  });

  it.each(types)("sends actual issue and objective palette rows through both boards for %s", (relation) => {
    for (const board of ["project", "global"] as const) {
      const add = vi.fn();
      const handler = board === "project" ? projectHandler(add) : globalHandler(add);
      const { onSelect, closeRelationPicker } = cardSelection(relation, handler);
      const request = cardRequest(relation, onSelect);
      // The placeholder asks the question; the rows are grouped by kind.
      expect(request.placeholder).toBe(en.Relations[`pick_${relation}`]);
      expect(request.categories.map((category) => category.label)).toEqual([en.Issue.entityPlural, en.Relations.objectives]);
      expect(request.semanticProjectId).toBe(issue.project_id);
      for (const [rowId, target, kind] of [[`issue-${other.id}`, other.id, "issue"], [`objective-${objective.id}`, objective.id, "objective"]] as const) {
        const row = request.items.find((item) => item.id === rowId)!;
        if (kind === "issue") {
          expect(row).toMatchObject({ title: other.title, contextLabel: "MIN-2", exactKeywords: ["MIN-2", "2"], entityType: "issue" });
        } else {
          expect(row).toMatchObject({ title: objective.name, entityType: "objective" });
        }
        expect(row.execute?.()).not.toBe(false);
        const expected = [issue.id, relation, target, ...(board === "global" ? [issue.project_id] : []), { targetType: kind }];
        expect(add).toHaveBeenLastCalledWith(...expected);
      }
      expect(closeRelationPicker).toHaveBeenCalledTimes(2);
    }
  });

  it("names the relation in each step's key, so a new type clears the query", () => {
    expect(cardRequest("blocks", vi.fn()).key).not.toBe(cardRequest("related", vi.fn()).key);
  });

  it("offers a target while one selected ticket can still gain it, never a selected ticket (MIN-795)", () => {
    const sibling = { ...issue, id: "sibling" };
    const linkedToOther: ChipRelation[] = [{ id: "r", otherId: other.id, relation: "blocks", otherType: "issue", resolved: false }];
    expect(candidates("blocks", linkedToOther, [issue, sibling]).issues.map((item) => item.id)).toEqual([other.id, "closed"]);
    expect(candidates("blocks", linkedToOther, [issue, sibling], { sibling: linkedToOther }).issues.map((item) => item.id)).toEqual(["closed"]);
    expect(candidates("blocks", [], [issue, other]).issues.map((item) => item.id)).toEqual(["closed"]);
  });

  it("adds the relation from every selected ticket that lacks it (MIN-795)", () => {
    const sibling = { ...issue, id: "sibling" };
    const linkedSibling = { ...issue, id: "linked-sibling" };
    const add = vi.fn();
    const { onSelect } = cardSelection("blocks", add, [issue, sibling, linkedSibling, other], {
      [linkedSibling.id]: [{ id: "r", otherId: objective.id, relation: "blocks", otherType: "objective", resolved: false }],
    });
    onSelect(objective.id, "objective");
    expect(add.mock.calls).toEqual([
      [issue.id, "blocks", objective.id, { targetType: "objective" }],
      [sibling.id, "blocks", objective.id, { targetType: "objective" }],
      [other.id, "blocks", objective.id, { targetType: "objective" }],
    ]);
    add.mockClear();
    // The target itself is never related to itself.
    onSelect(other.id, "issue");
    expect(add.mock.calls.map(([source]) => source)).toEqual([issue.id, sibling.id, linkedSibling.id]);
  });

  it("lists issues only for the parent / sub-issue entries and writes the parent (MIN-804)", () => {
    // `other` and `closed` are top-level, without sub-issues: both ends fit.
    expect(candidates("parent_of")).toEqual({ issues: [other, expect.objectContaining({ id: "closed" })], objectives: [] });
    expect(candidates("sub_issue_of").objectives).toEqual([]);
    const add = vi.fn();
    const setParent = vi.fn();
    cardSelection("sub_issue_of", add, [issue], {}, setParent).onSelect(other.id, "issue");
    expect(setParent).toHaveBeenCalledWith("sub_issue_of", other.id);
    expect(add).not.toHaveBeenCalled();

    const writes = vi.fn();
    const setParentFromTargets = evaluate<(kind: RelationMenuKind, targetId: string) => void>(
      initializer("issue-card.tsx", "setParentFromTargets"),
      { isHierarchyRelation, hierarchyPatches, relationTargets: () => [issue], getCandidateIssues: () => [issue, other],
        linked: (run: () => void) => run(), onUpdateIssue: writes },
    );
    setParentFromTargets("parent_of", other.id);
    expect(writes).toHaveBeenCalledWith(other.id, { parent_id: issue.id });
  });

  it("lists no target before a relation is chosen and handles no objectives", () => {
    expect(candidates(null)).toEqual({ issues: [], objectives: [] });
    const request = relationPickerRequest({
      scope: "card", step: "related", issues: [other], objectives: [], projectKey: "MIN", projectId: null,
      onPickIssue: vi.fn(), onPickObjective: vi.fn(), onClose: vi.fn(),
    }, labels);
    expect(request.items.map((item) => item.id)).toEqual([`issue-${other.id}`]);
    expect(request.semanticProjectId).toBeNull();
    const add = vi.fn();
    cardSelection(null, add).onSelect(objective.id, "objective");
    expect(add).not.toHaveBeenCalled();
  });
});
