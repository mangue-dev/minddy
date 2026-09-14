import { CONVERSATION_ASSISTANT_TOOLS } from "./tools";
import { describe, expect, it } from "vitest";

import {
  ASSISTANT_TOOLS,
  GLOBAL_ASSISTANT_TOOLS,
  PROJECT_ASSISTANT_TOOLS,
  PROJECT_SCOPED_TOOLS,
} from "./tools";

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

  it("advertises read-only user statistics tools without parameters (MIN-501)", () => {
    for (const name of ["get_user_stats", "get_plan_usage"]) {
      const stats = tool(name);

      expect(stats, name).toBeDefined();
      expect(stats?.function.parameters.properties).toEqual({});
      expect(stats?.function.parameters.required).toBeUndefined();
      // Both are reads of the user's own numbers: they must never be
      // advertised as able to change settings, plan or budget.
      expect(stats?.function.description).toMatch(/read-only/i);
      expect(stats?.function.description).not.toMatch(/update_|create_|launch_/i);
    }

    const stats = tool("get_user_stats");
    expect(stats?.function.description).toMatch(/active days/i);
    expect(stats?.function.description).toMatch(/completed/i);
    expect(stats?.function.description).toMatch(/median time per ticket/i);

    const usage = tool("get_plan_usage");
    expect(usage?.function.description).toMatch(/budget/i);
    expect(usage?.function.description).toMatch(/routine/i);
  });

  it("keeps worker model and reasoning out of delegation tools", () => {
    for (const name of ["launch_code_agent", "create_routine", "update_routine"]) {
      const properties = tool(name)?.function.parameters.properties;
      expect(properties, name).not.toHaveProperty("model");
      expect(properties, name).not.toHaveProperty("reasoning_level");
      if (name !== "launch_code_agent") {
        expect(properties, name).not.toHaveProperty("base_branch");
      }
    }

    const accountProperties = tool("update_account_settings")?.function.parameters.properties;
    expect(accountProperties).not.toHaveProperty("default_model");
    expect(accountProperties).not.toHaveProperty("default_reasoning_level");
  });

  it("describes routines as repository-optional Numo conversations", () => {
    const create = tool("create_routine");
    expect(create?.function.description).toMatch(/Numo conversation/i);
    expect(create?.function.description).toMatch(/does not need a linked repository/i);
    expect(create?.function.description).toMatch(/delegates to a code worker only/i);
  });

  it("requires a complete structured brief for code delegation", () => {
    const launch = tool("launch_code_agent");
    expect(launch?.function.parameters.required).toEqual([
      "mode",
      "objective",
      "source_references",
      "constraints",
      "authorized_work",
    ]);
    expect(launch?.function.parameters.properties).toHaveProperty("expected_output");
    expect(launch?.function.parameters.properties).toHaveProperty("continuation_run_id");
    expect(launch?.function.description).toMatch(/owned by this Numo turn/i);
    expect(launch?.function.description).toMatch(/returns here/i);
  });

  it("keeps pull request review and fixes anchored to the selected PR", () => {
    const launch = tool("launch_code_agent");
    const mode = launch?.function.parameters.properties.mode as {
      enum?: string[];
    };
    expect(mode.enum).toEqual(
      expect.arrayContaining(["review", "fix"]),
    );
    expect(launch?.function.parameters.properties).toHaveProperty(
      "pull_request_id",
    );

    const read = tool("read_pull_request");
    expect(read?.function.parameters.properties).toHaveProperty(
      "pull_request_id",
    );
    expect(read?.function.parameters.required ?? []).not.toContain(
      "issue_id",
    );
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

  it("lets a project conversation discover the user's accessible projects", () => {
    const projects = PROJECT_ASSISTANT_TOOLS.find(
      (candidate) => candidate.function.name === "list_projects",
    );

    expect(projects).toBeDefined();
    expect(projects?.function.description).toMatch(/owner or member/i);
    expect(projects?.function.parameters.properties).not.toHaveProperty(
      "project_id",
    );
  });

  it("makes alternate project targeting optional in project conversations", () => {
    for (const name of PROJECT_SCOPED_TOOLS) {
      const scoped = PROJECT_ASSISTANT_TOOLS.find(
        (candidate) => candidate.function.name === name,
      );
      expect(scoped, name).toBeDefined();
      expect(scoped?.function.parameters.properties, name).toHaveProperty(
        "project_id",
      );
      expect(scoped?.function.parameters.required ?? [], name).not.toContain(
        "project_id",
      );
    }
  });

  it("continues to require explicit project targeting in global mode", () => {
    for (const name of PROJECT_SCOPED_TOOLS) {
      if (["list_views", "create_view", "update_view"].includes(name)) continue;
      const scoped = GLOBAL_ASSISTANT_TOOLS.find(
        (candidate) => candidate.function.name === name,
      );
      expect(scoped?.function.parameters.required, name).toContain("project_id");
    }
  });

  it("exposes an explicit current-or-next cycle move", () => {
    const move = tool("move_issues");

    expect(move?.function.parameters.required).toEqual([
      "issue_ids",
      "target_cycle",
    ]);
    expect(move?.function.parameters.properties.target_cycle).toMatchObject({
      enum: ["current", "next"],
    });
    expect(move?.function.description).toMatch(/never changes status/i);
    expect(move?.function.description).toMatch(/assignment changes per item/i);
  });
});


it("requires an explicit target on every conversation project action and worker", () => {
  for (const name of PROJECT_SCOPED_TOOLS) {
    const tool = CONVERSATION_ASSISTANT_TOOLS.find((candidate) => candidate.function.name === name);
    expect(tool?.function.parameters.required, name).toContain("project_id");
  }
});
