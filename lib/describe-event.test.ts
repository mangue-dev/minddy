import { readFileSync } from "node:fs";
import { createTranslator } from "next-intl";
import ts from "typescript-api";
import { describe, expect, it } from "vitest";
import en from "@/messages/en.json";
import fr from "@/messages/fr.json";
import {
  describeEvent,
  describeObjectiveEvent,
  type EventContext,
  type EventTranslators,
} from "./describe-event";
import type { Issue, IssueEvent, Objective } from "./types";

const ctx: EventContext = {
  members: [],
  categories: [],
  objectives: [{ id: "objective-target", name: "Release readiness" } as Objective],
  issues: [{ id: "issue-target", number: 513 } as Issue],
  projectKey: "MIN",
};

function event(overrides: Partial<IssueEvent> = {}): IssueEvent {
  return {
    id: "event",
    issue_id: "issue-source",
    actor_id: "actor",
    type: "relation_added",
    field: "blocks",
    from_value: null,
    to_value: "objective-target",
    created_at: "2026-09-17T00:00:00Z",
    ...overrides,
  };
}

function translators(locale: "en" | "fr"): EventTranslators {
  return {
    t: createTranslator({ locale, messages: locale === "en" ? en : fr, namespace: "Activity" }) as EventTranslators["t"],
    tStatus: (value) => value,
    tPriority: (value) => value,
    tObjectiveStatus: (value) => `objective:${value}`,
    formatDue: (value) => value ?? "",
  };
}

describe.each(["en", "fr"] as const)("relation activity in %s", (locale) => {
  const tr = translators(locale);
  describe.each([
    { parent: "issue", render: describeEvent },
    { parent: "objective", render: describeObjectiveEvent },
  ])("$parent timeline", ({ parent, render }) => {
    it.each(["blocks", "blocked_by", "related"])("renders %s add/remove with either target kind", (field) => {
      for (const [type, prefix] of [["relation_added", "relationAdded"], ["relation_removed", "relationRemoved"]]) {
        for (const [to_value, ref] of [["objective-target", "Release readiness"], ["issue-target", "MIN-513"]]) {
          const row = event({ type, field, to_value, issue_id: parent === "issue" ? "source" : null, objective_id: parent === "objective" ? "source" : null });
          expect(render(row, ctx, tr)).toBe(tr.t(`${prefix}_${field}`, { ref }));
          expect(render(row, ctx, tr)).toContain(ref);
        }
      }
    });

    it("preserves the legacy fallback for absent targets and relation fields", () => {
      for (const to_value of [null, "missing-target"]) {
        expect(render(event({ field: null, to_value }), ctx, tr)).toBe(
          tr.t("relationAdded_related", { ref: tr.t("issueSome") }),
        );
      }
    });
  });

  it("does not reinterpret issue-only activity references as objectives", () => {
    expect(describeEvent(event({ type: "sub_issue_added" }), ctx, tr)).toBe(
      tr.t("subIssueAdded", { ref: tr.t("issueSome") }),
    );
  });

  it("preserves objective creation, field updates and unknown-event fallback", () => {
    expect(describeObjectiveEvent(event({ type: "created" }), ctx, tr)).toBe(tr.t("objectiveCreated"));
    expect(describeObjectiveEvent(event({ type: "updated", field: "name" }), ctx, tr)).toBe(tr.t("objectiveNameChanged"));
    expect(describeObjectiveEvent(event({ type: "updated", field: "status", from_value: "planned", to_value: "done" }), ctx, tr)).toBe(
      tr.t("objectiveStatusChanged", { from: "objective:planned", to: "objective:done" }),
    );
    expect(describeObjectiveEvent(event({ type: "unknown" }), ctx, tr)).toBe(tr.t("objectiveUpdated"));
  });
});

it("hydrates the objective timeline context from project data and tracks updates", () => {
  const text = readFileSync(new URL("../components/objective-detail.tsx", import.meta.url), "utf8");
  const source = ts.createSourceFile("objective-detail.tsx", text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let initializer: ts.CallExpression | undefined;
  const visit = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === "eventCtx") {
      initializer = node.initializer as ts.CallExpression;
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  if (!initializer) throw new Error("Objective activity context was not found");
  const dependencies = initializer.arguments[1] as ts.ArrayLiteralExpression;
  expect(dependencies.elements.map((node) => node.getText(source))).toEqual(["members", "objectives", "issues", "projectKey"]);
  const compiled = ts.transpileModule(`const result = ${initializer.getText(source)};`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const build = new Function("useMemo", "members", "objectives", "issues", "projectKey", `${compiled}\nreturn result;`);
  const hydrated = build((callback: () => unknown) => callback(), ctx.members, ctx.objectives, ctx.issues, ctx.projectKey) as EventContext;
  expect(hydrated).toEqual(ctx);
  expect(describeObjectiveEvent(event(), hydrated, translators("en"))).toBe("marked this as blocking Release readiness");
  expect(text).toContain("const { objectives } = useObjectivesQuery(projectId)");
  expect(text).toContain("ctx={eventCtx}");
});
