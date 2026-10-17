import type { ProjectCapability } from "@/lib/server/project-access";
import type { AssistantToolDef } from "./tools";

/**
 * What each Numo tool needs (MIN-693, docs/security/project-roles.md),
 * classified by ACTUAL effect.
 *
 * - `personal`: the user's own data or the outside world, read-only
 *   (inbox, statistics, help, the web, personal cycle overview).
 * - `personal_write`: the user's own data, written (account settings,
 *   scratchpad, personal cycle fill, external MCP connections, personal
 *   views; a shared view is gated where the view tools run).
 * - `read` / `comment` / `write` / `admin`: the capability required in the
 *   targeted project, enforced once in `executeTool` after the project
 *   access is resolved. The trash and cycle-move tools are classified
 *   `write` and enforced per item, because each item names its own project.
 *
 * `numo-tool-capabilities.test.ts` checks this table covers every tool.
 */
export type NumoToolCapability =
  | "personal"
  | "personal_write"
  | ProjectCapability;

export const NUMO_TOOL_CAPABILITIES: Record<string, NumoToolCapability> = {
  // Personal and cross-project.
  ask_user: "personal",
  get_help: "personal",
  web_search: "personal",
  list_projects: "personal",
  list_global_filter_options: "personal",
  list_conversation_attachments: "personal",
  read_conversation_attachment: "personal",
  list_inbox: "personal",
  get_account_settings: "personal",
  get_user_stats: "personal",
  get_plan_usage: "personal",
  list_trash: "personal",
  // The cycle core reconciles only projects where the user can still write.
  get_cycle: "personal",
  get_scratchpad: "personal",
  list_views: "personal",
  update_account_settings: "personal_write",
  fill_cycle: "personal_write",
  add_scratchpad_tasks: "personal_write",
  update_scratchpad_tasks: "personal_write",
  set_scratchpad: "personal_write",
  create_view: "personal_write",
  update_view: "personal_write",
  list_mcp_tools: "personal",
  call_mcp_tool: "personal_write",
  list_mcp_presets: "personal",
  configure_mcp_connection: "personal_write",

  // Per-item project writes.
  move_to_trash: "write",
  restore_from_trash: "write",
  add_issues_to_cycle: "write",
  move_issues: "write",
  remove_issues_from_cycle: "write",

  // Project reads.
  list_issues: "read",
  search_issues: "read",
  get_issue: "read",
  list_members: "read",
  get_objective: "read",
  list_objectives: "read",
  list_categories: "read",
  list_pages: "read",
  search_pages: "read",
  get_page: "read",
  // Readers get the board settings without its public URL and token.
  get_feedback_board: "read",
  list_feedback: "read",
  get_feedback: "read",
  list_routines: "read",
  list_routine_runs: "read",
  read_routine_occurrence: "read",
  read_pull_request: "read",

  // Internal comments.
  add_comment: "comment",
  add_feedback_comment: "comment",

  // Content writes.
  // Read-only, but integration summaries (webhook URLs) are hidden from readers.
  list_integrations: "write",
  add_resource: "write",
  create_issue: "write",
  update_issues: "write",
  append_to_plan: "write",
  update_plan_tasks: "write",
  edit_issue_text: "write",
  create_page: "write",
  update_page_database: "write",
  update_page: "write",
  append_to_page: "write",
  edit_page_text: "write",
  set_issue_categories: "write",
  link_issues: "write",
  create_objective: "write",
  update_objective: "write",
  create_category: "write",
  update_category: "write",
  triage_decision: "write",
  promote_feedback_to_issue: "write",
  link_feedback_to_objective: "write",
  link_feedback_to_issue: "write",
  unlink_feedback: "write",
  // A public reply signed by the team.
  respond_to_feedback: "write",
  link_pull_request: "write",
  merge_pull_request: "write",
  update_pull_request: "write",
  post_pull_request_comment: "write",
  edit_own_pull_request_comment: "write",
  resolve_pull_request_threads: "write",

  // Owner-only administration.
  propose_backlog: "admin",
  configure_feedback_board: "admin",
  update_integration_objective: "admin",
  create_integration: "admin",
  update_integration_webhook: "admin",
  revoke_integration: "admin",
  update_project: "admin",
  invite_member: "admin",
  remove_member: "admin",
  cancel_invitation: "admin",
  create_routine: "admin",
  update_routine: "admin",
};

/** Unknown tools fail closed. */
export function numoToolCapability(toolName: string): NumoToolCapability {
  return Object.hasOwn(NUMO_TOOL_CAPABILITIES, toolName)
    ? NUMO_TOOL_CAPABILITIES[toolName]
    : "admin";
}

export const READ_ONLY_PROJECT_MESSAGE =
  "The user is a Reader in this project: it is read-only for them, so this " +
  "action is not available. Tell the user plainly; do not retry and do not " +
  "look for a workaround. The project owner can change their role.";

export const COMMENT_NOT_ALLOWED_MESSAGE =
  "The user is a Reader in this project and is not allowed to comment. Tell " +
  "the user plainly; do not retry. The project owner can allow comments.";

/**
 * The tools a turn bound to a project where the user is a Reader may use:
 * reads (personal and project), plus comments when the owner allowed them.
 */
export function readerToolSet(
  tools: AssistantToolDef[],
  canComment: boolean,
): AssistantToolDef[] {
  return tools.filter((tool) => {
    const capability = numoToolCapability(tool.function.name);
    return (
      capability === "personal" ||
      capability === "read" ||
      (canComment && capability === "comment")
    );
  });
}
