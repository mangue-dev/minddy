import type { NumoToolName } from "./tool-policy";
import type { AssistantToolDef } from "./tools";

/**
 * Tools loaded on demand (MIN-1001). Every model call carries the definitions
 * of the tools it offers, and the 114 conversation tools weighed about five
 * times the system prompt. Over 60 days of production (to 2026-11-15), 1,037
 * tool calls used 56 of them and the top 20 made 88 % of the calls. A turn
 * therefore sends the CORE tools below, plus those the conversation already
 * loaded; the others stay in the turn's pool, behind `search_tools`, and a
 * compact catalog in the prompt says what they are.
 *
 * Nothing here widens access: the pool is the list `offeredTools` built for
 * the turn, with every filter of that turn (reader, routine, reminder,
 * background, administration). A tool outside it cannot be loaded or called.
 */

export const SEARCH_TOOLS_NAME = "search_tools";

/** The most a single search loads, so one vague query cannot load everything. */
export const MAX_TOOLS_PER_SEARCH = 8;

/**
 * Always sent: the tools most calls use, and those the always-on rules of the
 * prompt name (attachments, files, trash, plans, the journal, notes). Memory
 * and journal tools are offered only on the surfaces that allow them; when
 * they are, they stay loaded, because their rules ask for silent use.
 */
export const CORE_TOOL_NAMES: ReadonlySet<NumoToolName> = new Set<NumoToolName>([
  "ask_user", "get_help", "list_projects", "list_inbox",
  "search_issues", "list_issues", "get_issue", "create_issue", "update_issues",
  "edit_issue_text", "append_to_plan", "update_plan_tasks", "set_issue_categories",
  "triage_decision", "add_comment", "add_resource",
  "list_members", "list_categories", "list_objectives", "get_objective",
  "search_pages", "get_page", "list_pages",
  "list_conversation_attachments", "read_conversation_attachment", "view_image", "embed_image", "create_file",
  "web_search", "list_mcp_tools", "call_mcp_tool",
  "get_scratchpad", "add_scratchpad_tasks",
  "list_routines", "read_pull_request", "link_pull_request", "list_pull_requests",
  "move_to_trash",
  "remember", "forget", "search_conversations", "read_conversation",
  "journal_write", "journal_close", "notify_me",
]);

export interface ToolFamily {
  /** The family as the catalog names it. */
  name: string;
  /** What it is for, in one line: the model reads it to know a tool exists. */
  summary: string;
  tools: readonly string[];
}

/**
 * The deferred tools, by family. Every conversation tool outside the core
 * belongs to one (`tool-loading.test.ts`); the administration tools are
 * matched by their `admin_` prefix.
 */
export const TOOL_FAMILIES: readonly ToolFamily[] = [
  { name: "Routines", summary: "work the whole PROJECT shares, run on a schedule or triggered by project events (every member sees it): create, change and read their runs",
    tools: ["create_routine", "update_routine", "list_routine_runs", "read_routine_occurrence"] },
  { name: "Reminders", summary: "watch something for the user and act or notify when it happens: an issue reaching a status, a new comment on an issue, an objective reaching a status, a date (\"tell me when MIN-42 is done\", \"remind me on Friday\"), and the user's own recurring habits",
    tools: ["create_watch", "list_watches", "update_watch", "cancel_watch"] },
  { name: "Saved views", summary: "kanban views of a project or the cross-project board",
    tools: ["list_views", "create_view", "update_view", "list_global_filter_options"] },
  { name: "Objectives and categories", summary: "create and edit objectives and their comments, create, rename and order categories",
    tools: ["create_objective", "update_objective", "add_objective_comment", "create_category", "update_category", "reorder_categories"] },
  { name: "Issue relations and backlog", summary: "link issues (blocks, relates, duplicates) and propose a starting backlog",
    tools: ["link_issues", "propose_backlog"] },
  { name: "Cycles", summary: "the user's personal planning cycle: read, fill, add, move and remove issues",
    tools: ["get_cycle", "fill_cycle", "add_issues_to_cycle", "move_issues", "remove_issues_from_cycle"] },
  { name: "Task notebook", summary: "tick, rewrite or replace tasks of the user's notebook",
    tools: ["update_scratchpad_tasks", "set_scratchpad", "edit_scratchpad_text"] },
  { name: "Pages and databases", summary: "create and edit wiki pages, databases, their entries and views, and the calculations under their number columns; answer and resolve a page's comment threads",
    tools: ["create_page", "create_page_database", "update_page", "append_to_page", "edit_page_text",
      "update_page_database", "update_page_database_views", "list_page_database_views",
      "add_page_comment", "resolve_page_thread"] },
  { name: "Feedback", summary: "the public feedback board: read posts, answer, link, promote and configure it",
    tools: ["get_feedback_board", "list_feedback", "get_feedback", "add_feedback_comment", "promote_feedback_to_issue",
      "link_feedback_to_objective", "link_feedback_to_issue", "unlink_feedback", "respond_to_feedback", "configure_feedback_board"] },
  { name: "Integrations", summary: "API integrations and webhooks of a project",
    tools: ["list_integrations", "create_integration", "update_integration_objective", "update_integration_webhook", "revoke_integration"] },
  { name: "Pull request actions", summary: "merge, edit, comment on and resolve threads of a pull request",
    tools: ["merge_pull_request", "update_pull_request", "post_pull_request_comment", "edit_own_pull_request_comment",
      "resolve_pull_request_threads"] },
  { name: "Project settings and members", summary: "project settings and statistics, invitations, roles and members",
    tools: ["update_project", "get_project_stats", "invite_member", "remove_member", "update_member_role", "cancel_invitation"] },
  { name: "MCP connections", summary: "set up a connection to another service's MCP server",
    tools: ["list_mcp_presets", "configure_mcp_connection"] },
  { name: "Account and usage", summary: "the user's settings, statistics and AI usage",
    tools: ["get_account_settings", "update_account_settings", "get_user_stats", "get_plan_usage"] },
  { name: "Trash", summary: "list what was deleted and restore it",
    tools: ["list_trash", "restore_from_trash"] },
];

const ADMIN_FAMILY: ToolFamily = {
  name: "Instance administration",
  summary: "the instance's AI models, costs and accounts (administrators only)",
  tools: [],
};

function familyOf(name: string): ToolFamily | null {
  if (name.startsWith("admin_")) return ADMIN_FAMILY;
  return TOOL_FAMILIES.find((family) => family.tools.includes(name)) ?? null;
}

/**
 * The tools a turn sends and those it keeps behind `search_tools`. Core
 * tools come first, in the pool's order, then the loaded ones in the order
 * they were loaded: a provider's prompt cache keeps the prefix while the list
 * only grows at its end. Pure.
 */
export function splitToolPool(
  pool: readonly AssistantToolDef[],
  loaded: readonly string[],
): { active: AssistantToolDef[]; deferred: AssistantToolDef[] } {
  const byName = new Map(pool.map((tool) => [tool.function.name, tool]));
  const core = pool.filter((tool) => CORE_TOOL_NAMES.has(tool.function.name as NumoToolName));
  // A small pool (a documentation turn offers get_help alone) gains nothing.
  if (core.length === pool.length) return { active: [...pool], deferred: [] };
  const active = [...core];
  const seen = new Set(core.map((tool) => tool.function.name));
  for (const name of loaded) {
    const tool = byName.get(name);
    if (!tool || seen.has(name)) continue;
    seen.add(name);
    active.push(tool);
  }
  const deferred = pool.filter((tool) => !seen.has(tool.function.name));
  return { active, deferred: deferred.length > 0 ? deferred : [] };
}

/** `search_tools`, offered when a turn keeps tools behind it. */
export function searchToolsDefinition(): AssistantToolDef {
  return {
    type: "function",
    function: {
      name: SEARCH_TOOLS_NAME,
      description:
        "Load tools listed under \"More tools\" in your instructions, so you can call them from your next " +
        "step. Pass their exact names, or a family name or keywords. Loaded tools stay available for the " +
        `rest of the conversation. At most ${MAX_TOOLS_PER_SEARCH} per call.`,
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Tool names (comma-separated), a family name (\"Routines\") or keywords (\"merge pull request\").",
          },
        },
        required: ["query"],
      },
    },
  };
}

function words(text: string): string[] {
  return text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .split(/[^a-z0-9_]+/).filter((word) => word.length > 2);
}

/**
 * The deferred tools a query names: exact tool names first, then a whole
 * family named, then the best keyword matches on name, family and
 * description. Pure; never returns a tool outside `deferred`.
 */
export function matchDeferredTools(
  query: string,
  deferred: readonly AssistantToolDef[],
): AssistantToolDef[] {
  const text = query.trim().toLowerCase();
  if (!text || deferred.length === 0) return [];
  const exact = new Set(text.split(/[\s,]+/));
  const named = deferred.filter((tool) => exact.has(tool.function.name.toLowerCase()));
  if (named.length > 0) return named.slice(0, MAX_TOOLS_PER_SEARCH);

  const family = [...TOOL_FAMILIES, ADMIN_FAMILY].find((f) => f.name.toLowerCase() === text);
  if (family) {
    const members = deferred.filter((tool) => familyOf(tool.function.name) === family);
    if (members.length > 0) return members.slice(0, MAX_TOOLS_PER_SEARCH);
  }

  const terms = words(text);
  if (terms.length === 0) return [];
  const scored = deferred.map((tool) => {
    const name = tool.function.name.toLowerCase();
    const nameWords = name.split("_");
    const familyWords = words(`${familyOf(name)?.name ?? ""} ${familyOf(name)?.summary ?? ""}`);
    const description = tool.function.description.toLowerCase();
    let score = 0;
    for (const term of terms) {
      const stem = term.replace(/s$/, "");
      if (nameWords.some((word) => word.replace(/s$/, "") === stem)) score += 4;
      if (familyWords.some((word) => word.replace(/s$/, "") === stem)) score += 2;
      if (description.includes(stem)) score += 1;
    }
    return { tool, score };
  }).filter((entry) => entry.score >= 2);
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, MAX_TOOLS_PER_SEARCH).map((entry) => entry.tool);
}

/**
 * The catalog of what `search_tools` can load, one line per family present
 * in `deferred`. Empty when nothing is deferred.
 */
export function deferredToolsCatalog(deferred: readonly AssistantToolDef[]): string {
  if (deferred.length === 0) return "";
  const families = new Map<ToolFamily | null, string[]>();
  for (const tool of deferred) {
    const family = familyOf(tool.function.name);
    families.set(family, [...(families.get(family) ?? []), tool.function.name]);
  }
  const lines = [...families.entries()].map(([family, names]) => family
    ? `- ${family.name}: ${family.summary} (${names.join(", ")})`
    : `- Other: ${names.join(", ")}`);
  return `\n\n## More tools
These tools are not sent until loaded. Before you use one you do not have yet, call ${SEARCH_TOOLS_NAME} with its name or its family; it is then yours for the rest of the conversation. Before telling the user you cannot do something, check this list: when a family might do it, load it and read its tools' descriptions. Never tell the user you cannot do something one of them does.
${lines.join("\n")}`;
}

/**
 * Tools this conversation already loaded, in load order, read from its stored
 * tool rows: the names `search_tools` loaded (kept in the row's metadata)
 * and every tool it called. Pure.
 */
export function loadedToolNames(
  rows: readonly { tool_name?: string | null; metadata?: unknown }[],
): string[] {
  const names: string[] = [];
  const add = (name: unknown) => {
    if (typeof name === "string" && name && !names.includes(name)) names.push(name);
  };
  for (const row of rows) {
    if (row.tool_name === SEARCH_TOOLS_NAME) {
      const loaded = (row.metadata as { loaded?: unknown } | null)?.loaded;
      if (Array.isArray(loaded)) loaded.forEach(add);
    } else {
      add(row.tool_name);
    }
  }
  return names;
}
