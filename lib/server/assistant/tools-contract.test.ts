import { describe, expect, it } from "vitest";

import { ASSISTANT_TOOLS, GLOBAL_ASSISTANT_TOOLS } from "./tools";

const tool = (name: string) =>
  ASSISTANT_TOOLS.find((candidate) => candidate.function.name === name);

describe("Numo tool contracts", () => {
  it("does not advertise creation-only smart_fill on issue updates", () => {
    const update = tool("update_issues");
    const create = tool("create_issue");

    expect(update?.function.parameters.properties.fields).not.toHaveProperty(
      "smart_fill",
    );
    expect(create?.function.parameters.properties).toHaveProperty("smart_fill");
  });

  it("lets the account setting own where created issues land", () => {
    // Regression guard: advertising a fixed landing zone ('triage') makes the
    // model pass a status itself and override the user's Numo landing-status
    // setting. The field stays exposed so an explicit user ask still goes
    // through — execute-tool falls back to the configured default whenever
    // the model leaves it out.
    const status = tool("create_issue")?.function.parameters.properties
      .status as { description?: string } | undefined;

    expect(status?.description).toMatch(/account setting/i);
    expect(status?.description).not.toContain("triage");
  });

  it("advertises the internal feedback comment tool", () => {
    const comment = tool("add_feedback_comment");

    expect(comment).toBeDefined();
    expect(comment?.function.parameters.properties).toHaveProperty("body");
    expect(comment?.function.parameters.required).toEqual(["body"]);
    expect(comment?.function.parameters.properties).toHaveProperty(
      "feedback_post_id",
    );
  });

  it("advertises the owner-only backlog proposal", () => {
    expect(tool("propose_backlog")?.function.description).toMatch(
      /OWNER ONLY/i,
    );
  });

  it("loads routine instructions only when a routine is targeted", () => {
    const listRoutines = tool("list_routines");

    expect(listRoutines?.function.parameters.properties).toHaveProperty(
      "routine_id",
    );
    expect(listRoutines?.function.description).toMatch(/compact list/i);
    expect(listRoutines?.function.description).toMatch(/full instruction/i);
  });

  it("keeps feedback comment guidance aligned with the comment service", () => {
    const comment = tool("add_feedback_comment");

    expect(comment?.function.description).not.toMatch(
      /1000 characters|no headings/i,
    );
    const body = comment?.function.parameters.properties.body as {
      description?: string;
    };

    expect(body.description).not.toMatch(/1000 characters|no headings/i);
  });

  it("makes product knowledge available without requiring a project", () => {
    expect(tool("get_help")?.function.parameters.required).toEqual(["topic"]);
    const global = GLOBAL_ASSISTANT_TOOLS.find(
      (candidate) => candidate.function.name === "get_help",
    );

    expect(global?.function.parameters.properties).not.toHaveProperty(
      "project_id",
    );
  });

  it("makes the user's inbox readable without requiring a project", () => {
    const inbox = tool("list_inbox");
    expect(inbox?.function.parameters.properties.state).toBeDefined();
    expect(inbox?.function.parameters.properties.category).toBeDefined();

    const global = GLOBAL_ASSISTANT_TOOLS.find(
      (candidate) => candidate.function.name === "list_inbox",
    );
    expect(global?.function.parameters.properties).not.toHaveProperty(
      "project_id",
    );
  });

  it("requires the get_issue revision when updating plan task indices", () => {
    const updatePlanTasks = tool("update_plan_tasks");
    expect(updatePlanTasks?.function.parameters.required).toContain(
      "expected_rev",
    );
    expect(updatePlanTasks?.function.parameters.properties).toHaveProperty(
      "expected_rev",
    );
  });
});
