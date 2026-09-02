import type { AgentAnchor } from "./prompt";

/**
 * NAMES of PLATFORM tools — ticket, notebook, pull request.
 *
 * Three `Set`, and nothing else. They lived in the modules that RUN these
 * tools (`issue-tools.ts`, `scratchpad-tools.ts`, `pr-tools.ts`), which
 * touch the base and the forge. But since MIN-224 it is ROUTING — “is this name
 * a platform tool? » — which goes down into the microVM with the loop,
 * not execution. A router that imports its executors to know their
 * names would take `getServiceClient` into a process where the model launches from the shell.
 *
 * The three execution modules RE-EXPORT them: no existing caller
 * changes, and there is still only one list per family.
 */

/** Tools ticket (routed to `issue-tools.ts`). */
export const ISSUE_TOOL_NAMES = new Set([
  "search_issues",
  "read_issue",
  "read_resource",
  // The name before MIN-184, kept FOR EXECUTION only: it is no longer used
  // in the list of tools, but a resumed checkpoint replays the old call.
  "read_attachment",
  "read_feedback",
  "update_issue",
  "write_issue_plan",
  "append_to_plan",
  "edit_issue_text",
  "create_issue",
  "create_routine",
  "report_verdict",
  // The PAGES of the project (MIN-273) — the wiki. They travel with the tickets
  // because they have exactly the same context, the run project and its
  // actor: one more family in the routing would only have brought
  // wiring. The execution lives in `page-tools.ts`, next to `issue-tools.ts`.
  "list_pages",
  "search_pages",
  "read_page",
  "create_page",
  "update_page",
  "append_to_page",
  "edit_page_text",
  // Project OBJECTIVES (MIN-287) — the purpose for which the ticket serves. They
  // travel with the tickets for the same reason as the pages: same
  // context, the run project and its actor. Execution lives in
  // `objective-tools.ts`.
  "list_objectives",
  "read_objective",
  "create_objective",
  "update_objective",
  "comment_objective",
]);

/** Notebook tools (routed to `scratchpad-tools.ts`). */
export const SCRATCHPAD_TOOL_NAMES = new Set([
  "read_scratchpad",
  "add_scratchpad_tasks",
  "update_scratchpad_task",
  "set_scratchpad",
]);

/** Writes to the reread pull request (routed to `pr-tools.ts`). */
export const PR_TOOL_NAMES = new Set([
  "comment_pr_line",
  "comment_pr",
  "reply_pr_thread",
]);

/**
 * Pull requests FROM THE PROJECT (routed to `project-pr-tools.ts`) — the inventory and
 * what an ordinary run can do there, apart from that of the reread run.
 *
 * Two families and not one, even though they partly overlap: these
 * tools take a `pull_request` (no session is anchored for them),
 * and most importantly they are NEVER served together — replay has the three
 * above, everything else has these. Distinct names are what make the
 * routing readable on both sides (`control-plane.ts`, `exec-tool.ts`).
 */
export const PROJECT_PR_TOOL_NAMES = new Set([
  "list_pull_requests",
  "read_pull_request",
  "comment_pull_request",
  "comment_pull_request_line",
  "reply_pull_request_thread",
  "review_pull_request",
  "set_pull_request_state",
]);

/**
 * THE ANCHOR OF A RUN, read on its line (MIN-326).
 *
 * The same precedence as `execute.ts` ("`issue` ? "issue": `prRun` ? "pr" :
 * "notebook"), and it must remain so: it is this anchor which decides both what we ANNOUNCE to the model (`agentToolsFor`) and what we SERVE to it
 * (`runPlatformTool`). Two different answers to “what anchor?” » and the announced toolset
 * ceases to be the one applied — precisely the discrepancy that the table below exists to prevent.
 */
export function anchorForRun(run: {
  issue_id: string | null;
  pull_request_id: string | null;
}): AgentAnchor {
  if (run.issue_id) return "issue";
  return run.pull_request_id ? "pr" : "notebook";
}

/**
 * Every platform tool served by the canonical harness.
 *
 * Anchors only provide context. They do not select a reduced routing table:
 * the catalog announced to OpenCode and the catalog accepted by the control
 * plane must remain identical for issue, notebook, and pull-request runs.
 */
const CANONICAL_PLATFORM_TOOL_NAMES: ReadonlySet<string> = new Set([
  ...ISSUE_TOOL_NAMES,
  ...SCRATCHPAD_TOOL_NAMES,
  ...PR_TOOL_NAMES,
  ...PROJECT_PR_TOOL_NAMES,
  "create_pr",
  "web_search",
]);

/**
 * TOOLSET IS A PROPERTY OF THE RUN, not a list that the prompt is asked
 * to respect (MIN-326).
 *
 * `runPlatformTool` routed to the ONLY tool name: only the two families PR
 * were looking at an anchor. A replay session — the one that the entire
 * repository asserts is read-only, and the only one whose read content comes from an unknown
 * fork — could therefore call `update_issue`, `set_scratchpad`,
 * `create_page`, `create_routine` or `create_pr` by a simple POST to
 * `/api/agent-vm/tool/<nom>` from its shell. An instruction slipped into a
 * `AGENTS.md` was enough to cross the anchor, to the scheduled ROUTINE, which
 * gives persistence.
 *
 * This table is the CODE lock that the doctrine only had in prompt. It
 * is also the reason why a new tool can no longer be added without
 * deciding on its anchor: the `control-plane.test.ts` test confronts it, name
 * by name, with what `agentToolsFor` ANNOUNCES for each anchor — both ne
 * can no longer diverge silently.
 */
export const PLATFORM_TOOLS_BY_ANCHOR: Record<
  AgentAnchor,
  ReadonlySet<string>
> = {
  issue: CANONICAL_PLATFORM_TOOL_NAMES,
  notebook: CANONICAL_PLATFORM_TOOL_NAMES,
  pr: CANONICAL_PLATFORM_TOOL_NAMES,
};

/** ALL platform tools, anchors combined — “is this name subject to the
 * table? ". A name that is not there is not platform (file, control,
 * delegation): its handler decides, as before. */
export const PLATFORM_TOOL_NAMES: ReadonlySet<string> = new Set(
  CANONICAL_PLATFORM_TOOL_NAMES,
);
