import { describe, expect, it } from "vitest";
import { DARK_THEME_PRESETS, LIGHT_THEME_PRESETS } from "@/lib/theme-presets";
import { ROUTINE_CONDITION_GROUP_LEVELS } from "@/lib/server/routine-tool-schema";

import { ASSISTANT_TOOLS } from "./tools";

const tool = (name: string) =>
  ASSISTANT_TOOLS.find((candidate) => candidate.function.name === name);

describe("Numo tool contracts", () => {
  it("keeps the required fields of each read and passage-edit tool on that tool (MIN-800)", () => {
    // A misplaced `required` once made get_page demand old_string: reads stay
    // id-only, edits require the first replacement and only ADD `edits`.
    expect(tool("get_page")?.function.parameters.required).toEqual(["page_id"]);
    expect(tool("edit_page_text")?.function.parameters.required).toEqual(["page_id", "old_string", "new_string"]);
    expect(tool("edit_issue_text")?.function.parameters.required).toEqual(["issue_id", "field", "old_string", "new_string"]);
    expect(tool("edit_scratchpad_text")?.function.parameters.required).toEqual(["old_string", "new_string"]);
    for (const name of ["edit_page_text", "edit_issue_text", "edit_scratchpad_text"]) {
      expect(tool(name)?.function.parameters.properties).toHaveProperty("edits");
    }
    expect(tool("update_objective")?.function.parameters.properties).toHaveProperty("description_edits");
  });

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

  it("advertises independent Smart Fill monitoring controls", () => {
    const settings = tool("update_account_settings")?.function.parameters.properties;
    expect(settings).toHaveProperty("smart_fill");
    expect(settings).toHaveProperty("smart_fill_created");
    expect(settings).toHaveProperty("smart_fill_triage");
  });

  it("only advertises deterministic Smart Triage rules", () => {
    const update = tool("update_project");
    const mode = update?.function.parameters.properties
      .smart_triage_mode as { enum?: string[]; description?: string };

    expect(mode).toBeDefined();
    expect(mode?.enum).toEqual(["rules"]);
  });

  it("advertises every account preference the settings screen writes", () => {
    const settings = tool("update_account_settings")?.function.parameters.properties;
    for (const name of [
      "send_shortcut",
      "dictation_cleanup",
      "week_start",
      "analytics_consent",
      "theme_light",
      "theme_dark",
      "theme_transparency",
    ]) {
      expect(settings, name).toHaveProperty(name);
    }
  });

  it("offers each mode only its own palettes (MIN-696)", () => {
    const settings = tool("update_account_settings")?.function.parameters.properties as
      Record<string, { enum?: unknown[] }>;
    expect(settings.theme_light.enum).toEqual([...LIGHT_THEME_PRESETS, null]);
    expect(settings.theme_dark.enum).toEqual([...DARK_THEME_PRESETS, null]);
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

  it("keeps issue board views and database views apart", () => {
    // On a database page, "create a view" once produced an issue board view.
    for (const name of ["list_views", "create_view", "update_view"]) {
      expect(tool(name)?.function.description).toMatch(/ISSUE BOARD/);
      expect(tool(name)?.function.description).toMatch(/page_database_views/);
    }
    expect(tool("update_page_database_views")?.function.parameters.properties).toHaveProperty("filters");
    expect(tool("update_page_database_views")?.function.parameters.properties)
      .not.toHaveProperty("filter_property_id");
  });

  it("offers a dedicated database tool a small model fills completely (MIN-917)", () => {
    const create = tool("create_page_database");
    // Small models skip optional fields: every field is required, nullable when optional.
    expect(create?.function.parameters.required).toEqual(
      ["title", "icon", "parent_page_id", "title_column", "properties", "rows"],
    );
    const properties = create?.function.parameters.properties as Record<string, {
      items?: { required?: string[]; properties?: Record<string, unknown> };
    }>;
    expect(properties.properties.items?.required).toEqual(["name", "type", "number_format", "currency", "options"]);
    expect(properties.rows.items?.required).toEqual(["title", "values"]);
    // create_page sends any collection to the database tool.
    expect(tool("create_page")?.function.description).toContain("use create_page_database instead");
  });

  // The prompt says tools documented as OWNER ONLY remain owner-only.
  it("advertises the owner-only backlog proposal", () => {
    expect(tool("propose_backlog")?.function.description).toMatch(
      /OWNER ONLY/i,
    );
  });

  it("sends no schema reference, which some upstreams reject (MIN-950)", () => {
    // Meta's Muse models answer 400 "Recursive JSON schemas are not currently
    // supported", and every tool rides on every round, so one reference
    // breaks the whole conversation.
    const withReferences = ASSISTANT_TOOLS
      .filter((candidate) => /"\$(?:ref|defs)"/.test(JSON.stringify(candidate.function.parameters)))
      .map((candidate) => candidate.function.name);
    expect(withReferences).toEqual([]);
  });

  it("still advertises nested AND/OR routine conditions, bounded (MIN-950)", () => {
    const eventTrigger = (name: string) => {
      const trigger = tool(name)?.function.parameters.properties.trigger as {
        anyOf: { properties: Record<string, unknown> }[];
      };
      return trigger.anyOf.find((branch) => "event" in branch.properties)!;
    };
    type Condition = { anyOf?: Condition[]; properties?: Record<string, { items?: Condition }> };
    const groupLevels = (condition: Condition): number => {
      const group = condition.anyOf?.find((option) => option.properties?.children);
      return group ? 1 + groupLevels(group.properties!.children!.items!) : 0;
    };

    for (const name of ["create_routine", "update_routine"]) {
      const conditions = eventTrigger(name).properties.conditions as Condition;
      expect(groupLevels(conditions)).toBe(ROUTINE_CONDITION_GROUP_LEVELS);
      expect(JSON.stringify(conditions)).toContain("\"field\"");
    }
  });

  it("loads routine instructions only when a routine is targeted", () => {
    const listRoutines = tool("list_routines");

    expect(listRoutines?.function.parameters.properties).toHaveProperty(
      "routine_id",
    );
  });

  it("advertises read-only access to routine runs (MIN-589)", () => {
    const listRuns = tool("list_routine_runs");
    expect(listRuns).toBeDefined();
    expect(listRuns?.function.parameters.required).toEqual(["routine_id"]);
    expect(listRuns?.function.parameters.properties).toHaveProperty("limit");

    const readOccurrence = tool("read_routine_occurrence");
    expect(readOccurrence).toBeDefined();
    expect(readOccurrence?.function.parameters.required).toEqual([
      "occurrence_id",
    ]);
    expect(readOccurrence?.function.parameters.properties).not.toHaveProperty(
      "routine_id",
    );
  });

  it("advertises read-only user statistics tools without parameters (MIN-501)", () => {
    for (const name of ["get_user_stats", "get_plan_usage"]) {
      const stats = tool(name);

      expect(stats, name).toBeDefined();
      expect(stats?.function.parameters.properties).toEqual({});
      expect(stats?.function.parameters.required).toBeUndefined();
    }
    // Usage is told to the user in percent, never in dollars.
    expect(tool("get_plan_usage")?.function.description).toMatch(/never in dollars/i);
  });

  it("offers no code-agent setting (MIN-721)", () => {
    for (const name of ["create_routine", "update_routine"]) {
      const properties = tool(name)?.function.parameters.properties;
      expect(properties, name).not.toHaveProperty("model");
      expect(properties, name).not.toHaveProperty("reasoning_level");
      expect(properties, name).not.toHaveProperty("base_branch");
    }

    const accountProperties = tool("update_account_settings")?.function.parameters.properties;
    for (const name of ["default_model", "default_reasoning_level", "sandbox_region", "sandbox_size", "branch_prefix"]) {
      expect(accountProperties).not.toHaveProperty(name);
    }
  });

  it("reads the selected pull request by its id", () => {
    const read = tool("read_pull_request");
    expect(read?.function.parameters.properties).toHaveProperty(
      "pull_request_id",
    );
    expect(read?.function.parameters.required ?? []).not.toContain(
      "issue_id",
    );
  });

  it("advertises direct PR management tools that never touch the code (MIN-550)", () => {
    for (const name of [
      "merge_pull_request",
      "update_pull_request",
      "post_pull_request_comment",
      "edit_own_pull_request_comment",
      "resolve_pull_request_threads",
    ]) {
      const pr = tool(name);
      expect(pr, name).toBeDefined();
      // One target, exactly: the same resolution as read_pull_request.
      expect(pr?.function.parameters.properties).toHaveProperty("issue_id");
      expect(pr?.function.parameters.properties).toHaveProperty(
        "pull_request_id",
      );
    }
  });

  it("reaches a pull request attached to no issue from any page (MIN-1004)", () => {
    const list = tool("list_pull_requests");
    expect(list).toBeDefined();
    expect(list?.function.parameters.required ?? []).toEqual([]);

    // Every PR tool also takes the number or URL the user names.
    for (const name of [
      "read_pull_request",
      "merge_pull_request",
      "update_pull_request",
      "post_pull_request_comment",
      "edit_own_pull_request_comment",
      "resolve_pull_request_threads",
    ]) {
      expect(tool(name)?.function.parameters.properties, name).toHaveProperty("pull_request");
    }
  });

  it("lets Numo close review conversations itself, keyed on the read threads", () => {
    const resolve = tool("resolve_pull_request_threads");

    // The thread identity is the one read_pull_request lists — the root
    // comment id — never an opaque forge id the model would have to guess.
    expect(resolve?.function.parameters.required).toEqual(["comment_ids"]);
    const ids = resolve?.function.parameters.properties.comment_ids as {
      description?: string;
    };
    expect(ids.description).toMatch(/read_pull_request/);
  });

  it("keeps the merge guardrail explicit: irreversible, confirmed, never against a red CI", () => {
    const merge = tool("merge_pull_request");

    expect(merge?.function.description).toMatch(/IRREVERSIBLE/i);
    expect(merge?.function.description).toMatch(/confirm the intent with the user/i);
    expect(merge?.function.description).toMatch(/red or running CI/i);
  });

  it("scopes the comment edit to comments Numo posted itself", () => {
    const edit = tool("edit_own_pull_request_comment");

    expect(edit?.function.description).toMatch(/never a comment written by a human/i);
    expect(edit?.function.parameters.required).toEqual(["comment_id", "body"]);
  });

  it("lets Numo notify only the user it works for, about a record of the project (MIN-914)", () => {
    const notify = tool("notify_me");
    const parameters = notify?.function.parameters;
    expect(parameters?.required).toEqual(["title", "body"]);
    // No recipient parameter: another member's Numo would notify them twice.
    expect(Object.keys(parameters?.properties ?? {}).sort()).toEqual(["body", "link", "title"]);
    const link = parameters?.properties.link as
      | { properties: { type: { enum: string[] } } }
      | undefined;
    expect(link?.properties.type.enum).toEqual(
      ["issue", "objective", "page", "pull_request", "routine"]);
    expect(tool("update_account_settings")?.function.parameters.properties)
      .toHaveProperty("notif_numo");
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

  it("exposes an explicit current-or-next cycle move", () => {
    const move = tool("move_issues");

    expect(move?.function.parameters.required).toEqual([
      "issue_ids",
      "target_cycle",
    ]);
    expect(move?.function.parameters.properties.target_cycle).toMatchObject({
      enum: ["current", "next"],
    });
  });

  it("lets Numo set up MCP connections without a project (MIN-541)", () => {
    for (const name of ["list_mcp_presets", "configure_mcp_connection"]) {
      expect(tool(name), name).toBeDefined();
    }

    // The research-before-create discipline is part of the contract: the tool
    // must send the model to the provider's prerequisites BEFORE creating.
    const configure = tool("configure_mcp_connection");
    expect(configure?.function.description).toMatch(/RESEARCH FIRST/);
    expect(configure?.function.description).toMatch(/web_search/);
    expect(configure?.function.parameters.properties).toHaveProperty("preset_id");
    expect(configure?.function.parameters.properties).toHaveProperty(
      "connection_id",
    );
    expect(configure?.function.parameters.properties).toHaveProperty("token");
    expect(configure?.function.parameters.properties).toHaveProperty(
      "oauth_client_secret",
    );
  });
});
