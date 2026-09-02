import { describe, expect, it } from "vitest";

import { agentToolsFor } from "./tools";
import type { AgentAnchor } from "./prompt";
import {
  anchorForRun,
  PLATFORM_TOOL_NAMES,
  PLATFORM_TOOLS_BY_ANCHOR,
} from "./platform-tool-names";

/**
 * MIN-326 — TOOLSET IS A PROPERTY OF THE ANCHOR, and there is only one.
 *
 * Two places decide what a run can call: the one that ANNOUNCES it to the
 * model (`agentToolsFor`, from which the microVM draws its tools files) and the one
 * which SERVES it (`runPlatformTool` from the control plane, by the table de
 * `platform-tool-names.ts`). As long as they didn't come from the same source, the
 * second was a NAME routing: a replay session, from which everything
 * it reads comes from an unknown fork, called `create_routine` by a POST
 * from its shell.
 *
 * This test matches them name by name. It fails when we add a tool without
 * deciding its anchoring — that's exactly what we're asking it to do.
 */

const ANCHORS: AgentAnchor[] = ["issue", "notebook", "pr"];

/** Everything that the anchor ANNOUNCES, all options open: `web_search` served,
 * string run (`report_verdict`) and interactive (`create_routine`, `ask_user`).
 * A tool that no combination announces has nothing to do in the table. */
const announced = (anchor: AgentAnchor) =>
  new Set(
    agentToolsFor({ anchor, webSearch: true, chain: true, interactive: true })
      .map((t) => t.function.name)
      .filter((name) => PLATFORM_TOOL_NAMES.has(name)),
  );

/**
 * The BEFORE names that the table keeps when no one announces them anymore:
 * a resumed checkpoint replays the old call, and it must continue walking there
 * where its successor walks. `read_attachment` is the `read_resource` before
 * MIN-184. Any other discrepancy is a default.
 */
const LEGACY_ALIASES = new Set(["read_attachment"]);

describe("the platform catalog is identical for every anchor", () => {
  for (const anchor of ANCHORS) {
    it(`serves exactly what the ${anchor} anchor announces`, () => {
      const served = PLATFORM_TOOLS_BY_ANCHOR[anchor];
      const offered = announced(anchor);
      // Nothing announced that is not served: the model would see a tool that refuses.
      expect([...offered].filter((name) => !served.has(name))).toEqual([]);
      // Nothing served that is not announced, historical aliases aside: it is
      // this way a writing tool entered a proofreading session.
      expect(
        [...served].filter(
          (name) => !offered.has(name) && !LEGACY_ALIASES.has(name),
        ),
      ).toEqual([]);
    });
  }

  it("keeps Minddy writes available during pull-request reviews", () => {
    for (const name of [
      "update_issue",
      "create_issue",
      "write_issue_plan",
      "append_to_plan",
      "edit_issue_text",
      "create_page",
      "update_page",
      "create_objective",
      "update_objective",
      "comment_objective",
      "create_routine",
      "read_scratchpad",
      "set_scratchpad",
      "add_scratchpad_tasks",
      "update_scratchpad_task",
      "create_pr",
      "review_pull_request",
      "set_pull_request_state",
    ]) {
      expect(
        PLATFORM_TOOLS_BY_ANCHOR.pr.has(name),
        `${name} missing from a review`,
      ).toBe(true);
    }
  });

  it("keeps readers and anchored pull-request writes available", () => {
    for (const name of [
      "read_issue",
      "search_issues",
      "read_feedback",
      "read_resource",
      "read_page",
      "read_objective",
      "comment_pr",
      "comment_pr_line",
      "reply_pr_thread",
    ]) {
      expect(
        PLATFORM_TOOLS_BY_ANCHOR.pr.has(name),
        `${name} missing from a review`,
      ).toBe(true);
    }
  });
});

describe("l'ancrage se lit sur la ligne du run", () => {
  it("ticket, relecture, carnet", () => {
    expect(anchorForRun({ issue_id: "i-1", pull_request_id: null })).toBe(
      "issue",
    );
    expect(anchorForRun({ issue_id: null, pull_request_id: "pr-1" })).toBe(
      "pr",
    );
    expect(anchorForRun({ issue_id: null, pull_request_id: null })).toBe(
      "notebook",
    );
    // The ticket wins, as in `execute.ts`.
    expect(anchorForRun({ issue_id: "i-1", pull_request_id: "pr-1" })).toBe(
      "issue",
    );
  });
});

describe("repository context does not alter the announced catalog", () => {
  const names = (anchor: AgentAnchor) =>
    agentToolsFor({
      anchor,
      webSearch: true,
      chain: true,
      interactive: true,
      repo: false,
    }).map((t) => t.function.name);

  it("keeps forge tools visible without a linked repository", () => {
    for (const anchor of ["issue", "notebook"] as AgentAnchor[]) {
      const offered = names(anchor);
      expect(offered, anchor).toContain("create_pr");
      for (const pr of [
        "list_pull_requests",
        "read_pull_request",
        "comment_pull_request",
        "comment_pull_request_line",
        "reply_pull_request_thread",
        "review_pull_request",
        "set_pull_request_state",
      ]) {
        expect(offered, `${anchor}: ${pr}`).toContain(pr);
      }
    }
  });

  it("keeps ticket, notebook, page, and objective tools", () => {
    const offered = new Set(names("issue"));
    for (const name of [
      "search_issues",
      "read_issue",
      "update_issue",
      "read_scratchpad",
    ]) {
      expect(offered.has(name), name).toBe(true);
    }
  });
});
