import type { NumoWatchGrant } from "@/lib/numo-watches";
import { MCP_MAX_RESULT_BYTES } from "@/lib/mcp-client-tools";
import type { ProjectCapability } from "@/lib/server/project-access";
import {
  ROUTINE_LIST_RESULT_CHAR_LIMIT,
  ROUTINE_RUNS_TOOL_RESULT_CHAR_LIMIT,
  ROUTINE_TOOL_RESULT_CHAR_LIMIT,
} from "./routine-tool-result";

/**
 * What each Numo tool is, in one table: what it needs, where its target comes
 * from, how the durable ledger replays it, how much of its result the model
 * reads, and what an unattended or background turn may do with it. The tool
 * schemas (`tools.ts`), the executor, the background guard, the loop and the
 * thread lines are typed by these names, so a tool missing here, or listed
 * here without a schema or a handler, does not compile or fails
 * `tool-policy.test.ts`. The instance administration tools (MIN-829) are a
 * separate registry (`admin-tools.ts`), offered only to an admin session.
 */

/**
 * What a tool needs (MIN-693, docs/security/project-roles.md), classified by
 * actual effect. `personal`: the user's own data or the outside world, read
 * only. `personal_write`: the user's own data, written. A project capability
 * is checked in the targeted project once its access is resolved; a
 * `per_item` tool checks it on each item, because each item names its project.
 */
type NumoToolCapability = "personal" | "personal_write" | ProjectCapability;

/** The categories a memory, or a recurring reminder's grant, may allow (MIN-929, MIN-953). */
export type SensitiveCategory = NumoWatchGrant;

/** The objects a project write changes, read from the arguments that tool uses (MIN-929). */
export interface WriteTargets {
  issues: unknown[];
  pages: unknown[];
  objectives: unknown[];
  feedback: unknown[];
}
type Args = Record<string, unknown>;
type TargetsOf = (args: Args) => Partial<WriteTargets>;

const list = (value: unknown): Args[] =>
  Array.isArray(value) ? value.filter((item): item is Args => !!item && typeof item === "object") : [];
export const flat = (...values: unknown[]): unknown[] =>
  values.flatMap((value) => Array.isArray(value) ? value : value === undefined ? [] : [value]);

const ISSUE_ID: TargetsOf = (a) => ({ issues: [a.issue_id] });
const PAGE_ID: TargetsOf = (a) => ({ pages: [a.page_id] });
const OBJECTIVE_ID: TargetsOf = (a) => ({ objectives: [a.objective_id] });
const FEEDBACK_ID: TargetsOf = (a) => ({ feedback: [a.feedback_post_id] });

/**
 * The ceiling of a tool without its own: about 4K tokens. At 4,000 characters
 * most list reads (pages, cycle, feedback, settings) were cut mid-array, and
 * the model then guessed the ids it did not see (MIN-974).
 */
export const DEFAULT_TOOL_RESULT_CHAR_LIMIT = 16_000;

/**
 * Documents Numo reads to act on: their text must arrive whole, or the model
 * works from the first sections only (MIN-779). A plan, a description and the
 * notebook each hold up to 65,536 characters, and an issue read carries its
 * plan, its description and its comments together. This ceiling (about 25K
 * tokens) keeps such a read whole, JSON escaping included, and stays below the
 * smallest compaction threshold Numo uses for an unknown model (MIN-974).
 */
export const DOCUMENT_READ_RESULT_CHAR_LIMIT = 100_000;

/**
 * Issue lists must never reach the model truncated mid-array: a partial id
 * list makes the model hallucinate issue ids on the next write.
 */
const ISSUE_LIST_RESULT_CHAR_LIMIT = 24_000;

interface PolicyTraits {
  /** A read the durable ledger runs again after a crash; any other call is reconciled. */
  replay?: "retry";
  /** Characters of the serialized result the model reads. */
  resultLimit?: number | ((args: Args) => number);
  /** A read whose text can show images: its result lists them for view_image (MIN-728). */
  readsDocument?: true;
  /** A read whose database transport a stopped turn cancels. */
  cancellableRead?: true;
  /** Waits for the user (a question, a proposal to review): refused to an unattended turn. */
  waitsForUser?: true;
  /**
   * Offered only where the turn allows it: the memory and the history search
   * (MIN-915, MIN-956), the journal (MIN-927), the reminders (MIN-923), whose
   * writes are set only at the user's request in a conversation.
   */
  surface?: "memory" | "journal" | "reminder" | "reminder_write";
  /** Sensitive whatever it targets: a background turn needs a memory or a grant (MIN-929). */
  sensitive?: SensitiveCategory;
  /**
   * How the background guard treats a write that is not sensitive. `own`: the
   * user's own planning, never checked. `changes_nothing`: classified `write`
   * for another reason, changes nothing. `own_rule`: the guard has a rule of
   * its own for it. A project write without one is checked on what it
   * `touches`, and fails closed when it names nothing.
   */
  background?: "own" | "changes_nothing" | "own_rule";
  /** The objects a project write changes; without it, the write changes the project itself. */
  touches?: TargetsOf;
}

/**
 * Where a tool's target comes from, which decides its `project_id` parameter
 * and where the executor runs it:
 * - `personal`: the user's own data or the outside world, no `project_id`;
 * - `per_item`: no `project_id`, each item names its own project;
 * - `project`: a required `project_id`, resolved and capability-gated;
 * - `project_or_personal`: a project, or null for the user alone (MIN-982);
 * - `view`: a project's views, or null for the user's cross-project views.
 */
type NumoToolPolicy = PolicyTraits & (
  | { scope: "personal" | "view"; capability: "personal" | "personal_write" }
  | { scope: "per_item"; capability: "write" }
  | { scope: "project" | "project_or_personal"; capability: ProjectCapability }
);

export const NUMO_TOOL_POLICY = {
  // ── The user's own data and the outside world ───────────────────────
  list_mcp_tools: { scope: "personal", capability: "personal", resultLimit: MCP_MAX_RESULT_BYTES },
  call_mcp_tool: {
    scope: "personal", capability: "personal_write", sensitive: "external", resultLimit: MCP_MAX_RESULT_BYTES,
  },
  list_mcp_presets: { scope: "personal", capability: "personal" },
  configure_mcp_connection: { scope: "personal", capability: "personal_write", sensitive: "external" },
  list_projects: { scope: "personal", capability: "personal", replay: "retry", cancellableRead: true },
  list_global_filter_options: { scope: "personal", capability: "personal", replay: "retry" },
  // A manual article runs to about 70,000 characters (the issues guide).
  get_help: {
    scope: "personal", capability: "personal", replay: "retry", resultLimit: DOCUMENT_READ_RESULT_CHAR_LIMIT,
  },
  list_inbox: {
    scope: "personal", capability: "personal", replay: "retry", resultLimit: ISSUE_LIST_RESULT_CHAR_LIMIT,
  },
  list_conversation_attachments: {
    scope: "personal", capability: "personal", replay: "retry", resultLimit: 24_000,
  },
  read_conversation_attachment: {
    scope: "personal", capability: "personal", replay: "retry", resultLimit: 24_000,
  },
  // Writes only the user's private chat storage, which the chat upload door
  // opens to every role: a Reader may export what they can read.
  create_file: { scope: "personal", capability: "personal" },
  // Access is decided from the image's own project, or the notebook's owner.
  view_image: { scope: "personal", capability: "personal", replay: "retry" },
  web_search: { scope: "personal", capability: "personal", replay: "retry" },
  ask_user: { scope: "personal", capability: "personal", waitsForUser: true },
  get_account_settings: { scope: "personal", capability: "personal", replay: "retry" },
  update_account_settings: { scope: "personal", capability: "personal_write", sensitive: "account" },
  get_user_stats: { scope: "personal", capability: "personal", replay: "retry" },
  get_plan_usage: { scope: "personal", capability: "personal", replay: "retry" },
  // The trash spans every project the user can reach (MIN-133);
  // lib/server/trash.ts checks each item.
  list_trash: { scope: "personal", capability: "personal", replay: "retry" },
  move_to_trash: { scope: "per_item", capability: "write", sensitive: "trash" },
  restore_from_trash: { scope: "per_item", capability: "write", sensitive: "trash" },
  // The cycle is the user's own, across projects (MIN-32); its core
  // reconciles only projects where the user can still write.
  get_cycle: { scope: "personal", capability: "personal", replay: "retry" },
  fill_cycle: { scope: "personal", capability: "personal_write", background: "own" },
  // Adding an issue to the user's cycle assigns it to the user, so the
  // background guard checks whose issue it is.
  add_issues_to_cycle: { scope: "per_item", capability: "write", background: "own_rule" },
  move_issues: { scope: "per_item", capability: "write", background: "own" },
  remove_issues_from_cycle: { scope: "per_item", capability: "write", background: "own" },
  get_scratchpad: {
    scope: "personal", capability: "personal", replay: "retry",
    resultLimit: DOCUMENT_READ_RESULT_CHAR_LIMIT, readsDocument: true,
  },
  add_scratchpad_tasks: { scope: "personal", capability: "personal_write", background: "own" },
  update_scratchpad_tasks: { scope: "personal", capability: "personal_write", background: "own" },
  set_scratchpad: { scope: "personal", capability: "personal_write", background: "own" },
  edit_scratchpad_text: { scope: "personal", capability: "personal_write", background: "own" },
  // Numo's memory (MIN-915) writes only the user's own memory: a Reader
  // keeps it too, since it changes no project.
  remember: { scope: "personal", capability: "personal", surface: "memory" },
  forget: { scope: "personal", capability: "personal", surface: "memory" },
  // The search in earlier conversations (MIN-956) reads only the user's own
  // Numo history, and goes with the memory.
  search_conversations: { scope: "personal", capability: "personal", surface: "memory" },
  // A page of a past conversation: read_conversation bounds the page itself
  // and says where the next one starts, so the cut never applies.
  read_conversation: { scope: "personal", capability: "personal", surface: "memory", resultLimit: 32_000 },
  // Numo's journal (MIN-927) is the user's own as well: an entry may name a
  // project the user can open, but it changes nothing in it.
  journal_write: { scope: "personal", capability: "personal", surface: "journal", background: "own" },
  journal_close: { scope: "personal", capability: "personal", surface: "journal", background: "own" },
  // Numo's reminders (MIN-923) are the user's own too. Listing, changing and
  // cancelling change no project; setting one reads its target, so it needs
  // read access to that project, unless it is personal (MIN-982).
  list_watches: { scope: "personal", capability: "personal", surface: "reminder" },
  cancel_watch: { scope: "personal", capability: "personal", surface: "reminder_write" },
  update_watch: { scope: "personal", capability: "personal", surface: "reminder_write" },
  create_watch: { scope: "project_or_personal", capability: "read", surface: "reminder_write" },
  // Writes only the requesting user's own inbox, about a project they read.
  notify_me: { scope: "project_or_personal", capability: "read", background: "own_rule" },
  // A personal view is the user's own; a shared one is gated where the view
  // tools run, and by the background guard.
  list_views: { scope: "view", capability: "personal", replay: "retry" },
  create_view: { scope: "view", capability: "personal_write", background: "own_rule" },
  update_view: { scope: "view", capability: "personal_write", background: "own_rule" },

  // ── Project reads ───────────────────────────────────────────────────
  list_issues: {
    scope: "project", capability: "read", replay: "retry", resultLimit: ISSUE_LIST_RESULT_CHAR_LIMIT,
    cancellableRead: true,
  },
  search_issues: {
    scope: "project", capability: "read", replay: "retry", resultLimit: ISSUE_LIST_RESULT_CHAR_LIMIT,
  },
  get_issue: {
    scope: "project", capability: "read", replay: "retry",
    resultLimit: DOCUMENT_READ_RESULT_CHAR_LIMIT, readsDocument: true,
  },
  list_members: { scope: "project", capability: "read", replay: "retry" },
  get_project_stats: { scope: "project", capability: "read", replay: "retry" },
  get_objective: {
    scope: "project", capability: "read", resultLimit: DOCUMENT_READ_RESULT_CHAR_LIMIT, readsDocument: true,
  },
  list_objectives: { scope: "project", capability: "read", replay: "retry" },
  list_categories: { scope: "project", capability: "read", replay: "retry" },
  list_pages: { scope: "project", capability: "read", replay: "retry" },
  search_pages: { scope: "project", capability: "read", replay: "retry" },
  get_page: {
    scope: "project", capability: "read", replay: "retry",
    resultLimit: DOCUMENT_READ_RESULT_CHAR_LIMIT, readsDocument: true,
  },
  list_page_database_views: { scope: "project", capability: "read" },
  // Readers get the board settings without its public URL and token.
  get_feedback_board: { scope: "project", capability: "read", replay: "retry" },
  list_feedback: { scope: "project", capability: "read", replay: "retry" },
  get_feedback: {
    scope: "project", capability: "read", replay: "retry",
    resultLimit: DOCUMENT_READ_RESULT_CHAR_LIMIT, readsDocument: true,
  },
  // A targeted routine may hold a 20,000-character instruction: the default
  // call stays compact, and a call with routine_id keeps the full JSON so
  // the instruction can be replaced safely.
  list_routines: {
    scope: "project", capability: "read", replay: "retry",
    resultLimit: (args) => typeof args.routine_id === "string" && args.routine_id.length > 0
      ? ROUTINE_TOOL_RESULT_CHAR_LIMIT
      : ROUTINE_LIST_RESULT_CHAR_LIMIT,
  },
  // A routine's run history stays whole: a truncated tail would hide the
  // most recent occurrences, which are the ones the user asks about.
  list_routine_runs: {
    scope: "project", capability: "read", replay: "retry", resultLimit: ROUTINE_RUNS_TOOL_RESULT_CHAR_LIMIT,
  },
  read_routine_occurrence: {
    scope: "project", capability: "read", replay: "retry", resultLimit: ROUTINE_RUNS_TOOL_RESULT_CHAR_LIMIT,
  },
  // The pull request's body, up to 30 conversation comments of 2,000
  // characters, its review threads and file patches of 4,000 characters.
  read_pull_request: { scope: "project", capability: "read", replay: "retry", resultLimit: 64_000 },

  // ── Internal comments ───────────────────────────────────────────────
  add_comment: { scope: "project", capability: "comment", touches: ISSUE_ID },
  add_objective_comment: { scope: "project", capability: "comment", touches: OBJECTIVE_ID },
  add_feedback_comment: { scope: "project", capability: "comment", touches: FEEDBACK_ID },

  // ── Content writes ──────────────────────────────────────────────────
  // Read-only, but integration summaries (webhook URLs) are hidden from readers.
  list_integrations: { scope: "project", capability: "write", replay: "retry", background: "changes_nothing" },
  // The receiver of the resource; `page_id` is the page attached, not changed.
  add_resource: {
    scope: "project", capability: "write",
    touches: (a) => ({ issues: flat(a.issue_id), objectives: flat(a.objective_id) }),
  },
  create_issue: { scope: "project", capability: "write" },
  update_issues: {
    scope: "project", capability: "write",
    touches: (a) => ({ issues: flat(a.issue_ids, list(a.updates).map((u) => u.issue_id)) }),
  },
  append_to_plan: { scope: "project", capability: "write", touches: ISSUE_ID },
  update_plan_tasks: { scope: "project", capability: "write", touches: ISSUE_ID },
  edit_issue_text: { scope: "project", capability: "write", touches: ISSUE_ID },
  set_issue_categories: { scope: "project", capability: "write", touches: ISSUE_ID },
  // A relation shows on both sides: both ends must be the user's.
  link_issues: {
    scope: "project", capability: "write",
    touches: (a) => {
      const links = [a, ...list(a.links)];
      return {
        issues: flat(...links.map((l) => [l.issue_id, l.target_issue_id])),
        objectives: flat(...links.map((l) => [l.source_objective_id, l.target_objective_id])),
      };
    },
  },
  triage_decision: { scope: "project", capability: "write", touches: ISSUE_ID },
  create_page: { scope: "project", capability: "write" },
  create_page_database: { scope: "project", capability: "write" },
  update_page: {
    scope: "project", capability: "write", touches: (a) => ({ pages: flat(a.page_id, a.parent_page_id) }),
  },
  append_to_page: { scope: "project", capability: "write", touches: PAGE_ID },
  edit_page_text: { scope: "project", capability: "write", touches: PAGE_ID },
  update_page_database: { scope: "project", capability: "write", touches: PAGE_ID },
  update_page_database_views: { scope: "project", capability: "write", touches: PAGE_ID },
  create_objective: { scope: "project", capability: "write" },
  update_objective: { scope: "project", capability: "write", touches: OBJECTIVE_ID },
  create_category: { scope: "project", capability: "write" },
  update_category: { scope: "project", capability: "write" },
  reorder_categories: { scope: "project", capability: "write" },
  promote_feedback_to_issue: { scope: "project", capability: "write" },
  link_feedback_to_objective: {
    scope: "project", capability: "write",
    touches: (a) => ({ feedback: [a.feedback_post_id], objectives: [a.objective_id] }),
  },
  link_feedback_to_issue: {
    scope: "project", capability: "write",
    touches: (a) => ({ feedback: [a.feedback_post_id], issues: [a.issue_id] }),
  },
  unlink_feedback: { scope: "project", capability: "write", touches: FEEDBACK_ID },
  // A public reply signed by the team.
  respond_to_feedback: { scope: "project", capability: "write", sensitive: "public_reply" },
  link_pull_request: { scope: "project", capability: "write", sensitive: "pull_request" },
  merge_pull_request: { scope: "project", capability: "write", sensitive: "pull_request" },
  update_pull_request: { scope: "project", capability: "write", sensitive: "pull_request" },
  post_pull_request_comment: { scope: "project", capability: "write", sensitive: "pull_request" },
  edit_own_pull_request_comment: { scope: "project", capability: "write", sensitive: "pull_request" },
  resolve_pull_request_threads: { scope: "project", capability: "write", sensitive: "pull_request" },

  // ── Owner-only administration ───────────────────────────────────────
  // Writes nothing: the thread shows the proposal, which the user creates.
  propose_backlog: { scope: "project", capability: "admin", replay: "retry", waitsForUser: true },
  configure_feedback_board: { scope: "project", capability: "admin" },
  update_integration_objective: { scope: "project", capability: "admin" },
  create_integration: { scope: "project", capability: "admin" },
  update_integration_webhook: { scope: "project", capability: "admin" },
  revoke_integration: { scope: "project", capability: "admin", sensitive: "delete" },
  update_project: { scope: "project", capability: "admin" },
  invite_member: { scope: "project", capability: "admin" },
  remove_member: { scope: "project", capability: "admin", sensitive: "delete" },
  update_member_role: { scope: "project", capability: "admin" },
  cancel_invitation: { scope: "project", capability: "admin", sensitive: "delete" },
  create_routine: { scope: "project", capability: "admin" },
  update_routine: { scope: "project", capability: "admin" },
} as const satisfies Record<string, NumoToolPolicy>;

export type NumoToolName = keyof typeof NUMO_TOOL_POLICY;
type PolicyOf<Name extends NumoToolName> = (typeof NUMO_TOOL_POLICY)[Name];

/** The tools the executor runs before resolving a project: every scope but `project`. */
export type UserScopedToolName = {
  [Name in NumoToolName]: PolicyOf<Name>["scope"] extends "project" ? never : Name
}[NumoToolName];

/** The tools the executor runs inside a resolved, capability-gated project. */
export type ProjectScopedToolName = {
  [Name in NumoToolName]: PolicyOf<Name>["scope"] extends "project" | "project_or_personal" ? Name : never
}[NumoToolName];

export const NUMO_TOOL_NAMES = Object.keys(NUMO_TOOL_POLICY) as NumoToolName[];

function isNumoToolName(name: string): name is NumoToolName {
  return Object.hasOwn(NUMO_TOOL_POLICY, name);
}

/** The policy of a tool, or null for a name Numo does not have. */
export function numoToolPolicy(name: string): NumoToolPolicy | null {
  return isNumoToolName(name) ? NUMO_TOOL_POLICY[name] : null;
}

/** Unknown tools fail closed. */
export function numoToolCapability(name: string): NumoToolCapability {
  return numoToolPolicy(name)?.capability ?? "admin";
}

/** The tools whose policy matches, as a set of names. */
function numoToolsWhere(match: (policy: NumoToolPolicy) => boolean): ReadonlySet<string> {
  return new Set(NUMO_TOOL_NAMES.filter((name) => match(NUMO_TOOL_POLICY[name])));
}

/** Tools that wait for an answer: nobody is there to give one in an unattended turn. */
export const WAITS_FOR_USER_TOOLS = numoToolsWhere((policy) => policy.waitsForUser === true);
export const MEMORY_TOOLS = numoToolsWhere((policy) => policy.surface === "memory");
export const JOURNAL_TOOLS = numoToolsWhere((policy) => policy.surface === "journal");
export const REMINDER_WRITE_TOOLS = numoToolsWhere((policy) => policy.surface === "reminder_write");
export const REMINDER_TOOLS = numoToolsWhere((policy) =>
  policy.surface === "reminder" || policy.surface === "reminder_write");

