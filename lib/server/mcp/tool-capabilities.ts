import "server-only";

import { AsyncLocalStorage } from "node:async_hooks";
import type { ProjectCapability } from "@/lib/server/project-access";

/**
 * The project capability every MCP tool needs (MIN-693,
 * docs/security/project-roles.md).
 *
 * Classified by ACTUAL effect, not by annotation: a tool that reads
 * reader-sensitive data (integration summaries) needs `write`, and a tool
 * annotated read-only that reconciles content would need `write` too.
 *
 * - `user`: personal tools (inbox, scratchpad, the personal cycle) that take
 *   no project; they must not call `requireProject`/`resolveProject`.
 * - `read`: anyone with access, readers included.
 * - `comment`: members, owners, and readers allowed to comment.
 * - `write`: owners and members.
 * - `admin`: the project owner only.
 *
 * Enforcement cannot drift: `registerMinddyTools` refuses to register a tool
 * missing from this table, and runs each handler inside the declared
 * capability, which `requireProject`/`resolveProject` enforce.
 */
export type McpToolCapability = ProjectCapability | "user";

export const MCP_TOOL_CAPABILITIES = {
  // Personal, cross-project.
  minddy_list_projects: "user",
  minddy_list_inbox: "user",
  minddy_get_scratchpad: "user",
  minddy_set_scratchpad: "user",
  minddy_update_scratchpad_task: "user",
  minddy_add_scratchpad_tasks: "user",
  // The cycle core only reconciles and fills projects where the user can
  // still write, so the personal cycle tools stay open to everyone.
  minddy_get_cycle: "user",
  minddy_fill_cycle: "user",

  // Reads.
  minddy_get_project: "read",
  minddy_list_issues: "read",
  minddy_get_issue: "read",
  minddy_get_pull_request: "read",
  minddy_list_members: "read",
  minddy_list_categories: "read",
  minddy_list_objectives: "read",
  minddy_get_objective: "read",
  minddy_get_resource: "read",
  minddy_list_feedback: "read",
  minddy_get_feedback: "read",
  // Readers get the board settings without its public URL and token.
  minddy_get_feedback_board: "read",
  minddy_list_routines: "read",
  minddy_list_pages: "read",
  minddy_search_pages: "read",
  minddy_get_page: "read",

  // Internal comments.
  minddy_add_comment: "comment",
  minddy_add_objective_comment: "comment",
  minddy_add_feedback_comment: "comment",
  minddy_add_page_comment: "comment",

  // Content writes.
  minddy_link_pull_request: "write",
  minddy_create_issue: "write",
  minddy_update_issues: "write",
  minddy_update_plan_task: "write",
  minddy_append_to_plan: "write",
  minddy_edit_issue_text: "write",
  minddy_add_resource: "write",
  minddy_link_issues: "write",
  minddy_create_objective: "write",
  minddy_update_objective: "write",
  minddy_add_to_cycle: "write",
  minddy_move_to_cycle: "write",
  minddy_remove_from_cycle: "write",
  minddy_update_feedback: "write",
  minddy_promote_feedback: "write",
  minddy_link_feedback_objective: "write",
  minddy_link_feedback: "write",
  minddy_unlink_feedback: "write",
  // A public reply signed by the team.
  minddy_respond_feedback: "write",
  // Read-only, but integration summaries (webhook URLs, key prefixes) are
  // hidden from readers.
  minddy_list_integrations: "write",
  minddy_create_page: "write",
  minddy_update_page_database: "write",
  minddy_update_page: "write",
  minddy_append_to_page: "write",
  minddy_edit_page_text: "write",

  // Owner-only administration.
  minddy_update_integration_objective: "admin",
  minddy_configure_feedback_board: "admin",
  minddy_create_integration: "admin",
  minddy_configure_webhook: "admin",
  minddy_create_routine: "admin",
  minddy_update_routine: "admin",
  minddy_delete_routine: "admin",
  minddy_revoke_integration: "admin",
} as const satisfies Record<string, McpToolCapability>;

export type McpToolName = keyof typeof MCP_TOOL_CAPABILITIES;

export function mcpToolCapability(name: string): McpToolCapability | null {
  return Object.hasOwn(MCP_TOOL_CAPABILITIES, name)
    ? MCP_TOOL_CAPABILITIES[name as McpToolName]
    : null;
}

const currentCapability = new AsyncLocalStorage<McpToolCapability>();

/** Runs a tool handler inside its declared capability. */
export function runWithToolCapability<T>(
  capability: McpToolCapability,
  run: () => T
): T {
  return currentCapability.run(capability, run);
}

/**
 * The project capability the running tool declared. Outside a declared tool,
 * or for a personal tool that reaches a project anyway, it fails closed to
 * `admin`.
 */
export function declaredProjectCapability(): ProjectCapability {
  const capability = currentCapability.getStore();
  return capability === undefined || capability === "user" ? "admin" : capability;
}
