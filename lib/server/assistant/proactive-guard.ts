import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { NUMO_URGENT_NOTES_PER_DAY } from "@/lib/numo-background";
import { feedbackPostStore } from "@/lib/server/feedback-post-store";
import { issueStore } from "@/lib/server/issue-store";
import { countPendingInvitations } from "@/lib/server/members";
import { resolveIssueRef } from "@/lib/server/issue-reads";
import { objectiveStore } from "@/lib/server/objective-store";
import { getNumoMemoryScope } from "@/lib/server/numo/memory-content";
import { ADMIN_BACKGROUND_FREE_TOOLS, ADMIN_TOOL_NAMES } from "./admin-tools";
import { resolveAssistantProjectTarget } from "./project-scope";
import { numoToolCapability } from "./tool-capabilities";
import type { AssistantToolDef } from "./tools";

/**
 * What background Numo may do on its own (MIN-929). A background turn runs
 * while the user is away, on events other people caused, so it gets the same
 * tools as a conversation but the server checks every call against two rules
 * before it runs:
 *
 * - **Sensitive actions** are refused unless a memory of the user allows
 *   them: deleting or restoring from the trash, any pull request action,
 *   calling an external MCP tool, project administration, account settings,
 *   a public feedback reply and a note that is not urgent. The call names
 *   that memory in `authorized_by`; the guard checks the memory exists, is
 *   the user's and applies to the project the action touches. Whether its
 *   text really allows the action is the model's judgment, made in the open:
 *   the memory id is in the call.
 * - **Scope.** In a project with other members (or a pending invitation),
 *   a write is allowed only on what is the user's: an issue assigned to them
 *   or that they created, an objective they lead, a page they created, the
 *   feedback of a board they own. Creating content and changing the project's
 *   shared setup need a memory too. In a project where the user is alone,
 *   everything is theirs.
 *
 * The objects a write touches are read from the arguments THAT tool uses
 * (`SCOPED_WRITES`), never from any argument the call happens to carry, and
 * a write tool missing from the table is outside the scope in a shared
 * project: a new tool fails closed until it is classified here. Moving the
 * user's own issue under a teammate's objective or parent issue is accepted:
 * the change is on the user's issue.
 *
 * Instance administration (MIN-944), offered only to an admin account: the
 * model configuration and the costs are read freely, so the user can ask
 * Numo to watch them; every other admin tool needs a memory, of any scope,
 * since it acts on the instance rather than on a project.
 *
 * An urgent note (`urgent: true` with its reason) needs no memory, but the
 * user gets at most `NUMO_URGENT_NOTES_PER_DAY` of them in 24 hours, counted
 * atomically by `claim_numo_urgent_note` so that clearing a note from the
 * inbox does not give the slot back.
 *
 * Nothing changes in a conversation: the user is there to ask and to refuse.
 */

export type SensitiveCategory =
  | "trash"
  | "delete"
  | "pull_request"
  | "external"
  | "administration"
  | "account"
  | "public_reply"
  | "notification"
  | "outside_scope";

/** Tools that are sensitive whatever they target. */
export const SENSITIVE_TOOLS: Readonly<Record<string, SensitiveCategory>> = {
  move_to_trash: "trash",
  restore_from_trash: "trash",
  remove_member: "delete",
  cancel_invitation: "delete",
  revoke_integration: "delete",
  merge_pull_request: "pull_request",
  update_pull_request: "pull_request",
  post_pull_request_comment: "pull_request",
  edit_own_pull_request_comment: "pull_request",
  resolve_pull_request_threads: "pull_request",
  link_pull_request: "pull_request",
  call_mcp_tool: "external",
  configure_mcp_connection: "external",
  update_account_settings: "account",
  respond_to_feedback: "public_reply",
};

/** Tools that wait for an answer: nobody is there to give one. */
export const PROACTIVE_EXCLUDED_TOOLS: ReadonlySet<string> = new Set(["ask_user", "propose_backlog"]);

/**
 * Reminders (MIN-923) are set and cancelled at the user's request only: a
 * reminder that acts later would run outside this guard, so a background
 * turn must not set one from what it read. It may still list them.
 */
export const PROACTIVE_REQUEST_ONLY_TOOLS: ReadonlySet<string> = new Set(["create_watch", "cancel_watch"]);

/**
 * The user's own planning and notes: never sensitive. Cycle moves stay
 * within the user's own cycles; adding an issue to a cycle is not here,
 * since it assigns the issue to the user (`add_issues_to_cycle` below).
 */
const PERSONAL_TOOLS = new Set([
  "fill_cycle", "move_issues", "remove_issues_from_cycle",
  "add_scratchpad_tasks", "update_scratchpad_tasks", "set_scratchpad", "edit_scratchpad_text",
  "journal_write", "journal_close",
]);

/** Classified `write` only to hide webhook URLs from Readers: it changes nothing. */
const READ_ONLY_WRITES = new Set(["list_integrations"]);

interface Targets {
  issues: unknown[];
  pages: unknown[];
  objectives: unknown[];
  feedback: unknown[];
}

type Args = Record<string, unknown>;
type TargetsOf = (args: Args) => Partial<Targets> | "creates";

const list = (value: unknown): Args[] =>
  Array.isArray(value) ? value.filter((item): item is Args => !!item && typeof item === "object") : [];
const flat = (...values: unknown[]): unknown[] =>
  values.flatMap((value) => Array.isArray(value) ? value : value === undefined ? [] : [value]);

const ISSUE_ID: TargetsOf = (a) => ({ issues: [a.issue_id] });
const PAGE_ID: TargetsOf = (a) => ({ pages: [a.page_id] });
const OBJECTIVE_ID: TargetsOf = (a) => ({ objectives: [a.objective_id] });
const CREATES: TargetsOf = () => "creates";

/** The objects each project write changes, read from the arguments that tool uses. */
export const SCOPED_WRITES: Readonly<Record<string, TargetsOf>> = {
  add_comment: ISSUE_ID,
  append_to_plan: ISSUE_ID,
  update_plan_tasks: ISSUE_ID,
  edit_issue_text: ISSUE_ID,
  set_issue_categories: ISSUE_ID,
  triage_decision: ISSUE_ID,
  update_issues: (a) => ({ issues: flat(a.issue_ids, list(a.updates).map((u) => u.issue_id)) }),
  // A relation shows on both sides: both ends must be the user's.
  link_issues: (a) => {
    const links = [a, ...list(a.links)];
    return {
      issues: flat(...links.map((l) => [l.issue_id, l.target_issue_id])),
      objectives: flat(...links.map((l) => [l.source_objective_id, l.target_objective_id])),
    };
  },
  // The receiver of the resource; `page_id` is the page attached, not changed.
  add_resource: (a) => ({ issues: flat(a.issue_id), objectives: flat(a.objective_id) }),
  update_page: (a) => ({ pages: flat(a.page_id, a.parent_page_id) }),
  append_to_page: PAGE_ID,
  edit_page_text: PAGE_ID,
  update_page_database: PAGE_ID,
  update_page_database_views: PAGE_ID,
  update_objective: OBJECTIVE_ID,
  add_objective_comment: OBJECTIVE_ID,
  add_feedback_comment: (a) => ({ feedback: [a.feedback_post_id] }),
  unlink_feedback: (a) => ({ feedback: [a.feedback_post_id] }),
  link_feedback_to_objective: (a) => ({ feedback: [a.feedback_post_id], objectives: [a.objective_id] }),
  link_feedback_to_issue: (a) => ({ feedback: [a.feedback_post_id], issues: [a.issue_id] }),
  create_issue: CREATES,
  create_page: CREATES,
  create_page_database: CREATES,
  create_objective: CREATES,
  create_category: CREATES,
  update_category: CREATES,
  reorder_categories: CREATES,
  promote_feedback_to_issue: CREATES,
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Shortest urgency reason accepted: a real sentence, not "urgent". */
const URGENCY_REASON_MIN = 20;

export interface ProactiveGuardContext {
  userId: string;
  service: SupabaseClient;
  projectId: string | null;
  requireExplicitProjectTarget?: boolean;
  /** The background turn: an urgent note is counted against it. */
  turnId?: string | null;
}

export type ProactiveGuardResult =
  | { ok: true; args: Record<string, unknown> }
  | { ok: false; error: string };

interface GuardProject { id: string; key: string; owner_id: string }

function isProjectWrite(toolName: string): boolean {
  if (PERSONAL_TOOLS.has(toolName) || READ_ONLY_WRITES.has(toolName)) return false;
  const capability = numoToolCapability(toolName);
  return capability === "write" || capability === "comment" || capability === "admin";
}

/** Whether a background turn offers `authorized_by` on this tool. */
export function mayNeedAuthorization(toolName: string): boolean {
  if (ADMIN_TOOL_NAMES.has(toolName)) return !ADMIN_BACKGROUND_FREE_TOOLS.has(toolName);
  return toolName in SENSITIVE_TOOLS || toolName === "notify_me" || toolName === "add_issues_to_cycle"
    || toolName === "create_view" || toolName === "update_view" || isProjectWrite(toolName);
}

const AUTHORIZED_BY = {
  type: "string",
  description:
    "Background turns only: the id of the user's memory that explicitly allows this action, from your memory list. Needed for a sensitive action and for a change to what is not the user's in a shared project. Omit it when no memory allows the action: the call is then refused, and you ask in your journal instead.",
};

/**
 * The tools of a background turn: the conversation's, without those that
 * wait for an answer, with `authorized_by` on the guarded ones and the
 * urgency fields on notify_me.
 */
export function proactiveToolSet(tools: readonly AssistantToolDef[]): AssistantToolDef[] {
  return tools.filter((tool) => !PROACTIVE_EXCLUDED_TOOLS.has(tool.function.name) &&
    !PROACTIVE_REQUEST_ONLY_TOOLS.has(tool.function.name)).map((tool) => {
    const name = tool.function.name;
    if (!mayNeedAuthorization(name)) return tool;
    const properties: Record<string, unknown> = {
      ...tool.function.parameters.properties,
      authorized_by: AUTHORIZED_BY,
    };
    if (name === "notify_me") {
      properties.urgent = {
        type: "boolean",
        description: `True only for something serious that cannot wait until the user opens minddy (an outage, a security report, a deadline today). At most ${NUMO_URGENT_NOTES_PER_DAY} urgent notes in 24 hours. Without it, a note needs authorized_by.`,
      };
      properties.urgency_reason = {
        type: "string",
        description: "With urgent: one sentence on why this cannot wait.",
      };
    }
    return { ...tool, function: { ...tool.function, parameters: { ...tool.function.parameters, properties } } };
  });
}

export function proactiveRefusal(toolName: string, reason: SensitiveCategory | "invalid_authorization" | "urgent_limit"): string {
  const ask = "Do not retry and do not look for a workaround: write a journal entry that asks the user, and offer to do it on your own next time (they can tell you so in a conversation, and you will remember it).";
  switch (reason) {
    case "invalid_authorization":
      return `${toolName} refused: authorized_by must be the id of one of the user's memories that applies to the project this action touches, or to all projects. ${ask}`;
    case "urgent_limit":
      return `notify_me refused: the user already received ${NUMO_URGENT_NOTES_PER_DAY} urgent notes in the last 24 hours. Write a journal entry instead.`;
    case "notification":
      return `notify_me refused: in the background, send a note only when the user asked for it (pass that memory as authorized_by) or when it is urgent (urgent: true with urgency_reason). Otherwise write a journal entry.`;
    case "outside_scope":
      return `${toolName} refused: in a project with other members, you may change only what is the user's (issues assigned to them or that they created, objectives they lead, pages they created, the feedback of a board they own), and creating content there needs permission too, unless a memory allows it (authorized_by). ${ask}`;
    default:
      return `${toolName} refused: this action is sensitive (${reason.replace("_", " ")}) and needs a memory of the user that explicitly allows it (authorized_by). ${ask}`;
  }
}

async function projectById(ctx: ProactiveGuardContext, id: unknown): Promise<GuardProject | null> {
  if (typeof id !== "string" || !UUID_RE.test(id)) return null;
  const { data, error } = await ctx.service.from("projects").select("id, key, owner_id")
    .eq("id", id).maybeSingle();
  if (error) throw new Error("Unable to read the project for the background guard");
  return data as GuardProject | null;
}

async function projectOf(ctx: ProactiveGuardContext, args: Args): Promise<GuardProject | null> {
  const target = await resolveAssistantProjectTarget(ctx,
    ctx.requireExplicitProjectTarget ? null : ctx.projectId, args.project_id);
  return projectById(ctx, target.projectId);
}

/** Whether anyone but the user works in the project, or is invited to. */
async function isShared(ctx: ProactiveGuardContext, project: GuardProject): Promise<boolean> {
  if (project.owner_id !== ctx.userId) return true;
  const [members, invitations] = await Promise.all([
    ctx.service.from("project_members").select("user_id", { count: "exact", head: true })
      .eq("project_id", project.id).neq("user_id", ctx.userId),
    countPendingInvitations(ctx.service, project.id),
  ]);
  if (members.error) throw new Error("Unable to read the project members for the background guard");
  return (members.count ?? 0) + invitations > 0;
}

const strings = (values: unknown[] | undefined): string[] =>
  [...new Set((values ?? []).flatMap((value) => typeof value === "string" && value.trim() ? [value.trim()] : []))];

/**
 * Whether every object the write changes is the user's. A target that is not
 * a string, does not exist in the project, or a write that names none, is not.
 */
async function targetsAreTheUsers(ctx: ProactiveGuardContext, project: GuardProject,
  targets: Partial<Targets>): Promise<boolean> {
  const declared = [targets.issues, targets.pages, targets.objectives, targets.feedback]
    .flatMap((values) => values ?? []).filter((value) => value !== undefined && value !== null);
  const issues = strings(targets.issues);
  const pages = strings(targets.pages);
  const objectives = strings(targets.objectives);
  const feedback = strings(targets.feedback);
  if (declared.length === 0) return false;
  if (declared.some((value) => typeof value !== "string" || !value.trim())) return false;

  if (issues.length > 0) {
    const ids: string[] = [];
    for (const ref of issues) {
      const resolved = await resolveIssueRef(ctx.service, { projectId: project.id, projectKey: project.key }, ref);
      if ("error" in resolved) return false;
      ids.push(resolved.issue.id);
    }
    const { data, error } = await issueStore(ctx.service, ctx.userId).select("id, assignee_id, created_by")
      .in("id", ids).eq("project_id", project.id);
    if (error) throw new Error("Unable to read the issues for the background guard");
    const rows = (data ?? []) as Array<{ assignee_id: string | null; created_by: string | null }>;
    if (rows.length !== new Set(ids).size) return false;
    if (!rows.every((row) => row.assignee_id === ctx.userId || row.created_by === ctx.userId)) return false;
  }
  if (objectives.length > 0) {
    if (!objectives.every((id) => UUID_RE.test(id))) return false;
    const { data, error } = await objectiveStore(ctx.service, ctx.userId).select("id, lead_user_id")
      .in("id", objectives).eq("project_id", project.id);
    if (error) throw new Error("Unable to read the objectives for the background guard");
    const rows = (data ?? []) as Array<{ lead_user_id: string | null }>;
    if (rows.length !== objectives.length || !rows.every((row) => row.lead_user_id === ctx.userId)) return false;
  }
  if (pages.length > 0) {
    if (!pages.every((id) => UUID_RE.test(id))) return false;
    const { data, error } = await ctx.service.from("pages").select("id, created_by")
      .in("id", pages).eq("project_id", project.id);
    if (error) throw new Error("Unable to read the pages for the background guard");
    const rows = (data ?? []) as Array<{ created_by: string | null }>;
    if (rows.length !== pages.length || !rows.every((row) => row.created_by === ctx.userId)) return false;
  }
  if (feedback.length > 0) {
    // The board belongs to the project owner; the posts must be on it.
    if (project.owner_id !== ctx.userId || !feedback.every((id) => UUID_RE.test(id))) return false;
    const { data, error } = await feedbackPostStore(ctx.service, ctx.userId).select("id")
      .in("id", feedback).eq("project_id", project.id);
    if (error) throw new Error("Unable to read the feedback for the background guard");
    if ((data ?? []).length !== feedback.length) return false;
  }
  return true;
}

/**
 * The project a trash item belongs to, read from the item itself: the trash
 * tools take no project, the item names its own.
 */
async function trashItemProject(ctx: ProactiveGuardContext, args: Args): Promise<string | null> {
  const id = typeof args.id === "string" ? args.id.trim() : "";
  if (!UUID_RE.test(id)) return null;
  const read = async (query: PromiseLike<{ data: unknown; error: unknown }>) => {
    const { data, error } = await query;
    if (error) throw new Error("Unable to read the trash item for the background guard");
    return ((data as Array<{ project_id?: string | null }> | null)?.[0]?.project_id) ?? null;
  };
  switch (args.type) {
    case "project": return id;
    case "issue": return read(issueStore(ctx.service, ctx.userId).select("project_id").eq("id", id).limit(1));
    case "objective": return read(objectiveStore(ctx.service, ctx.userId).select("project_id").eq("id", id).limit(1));
    case "feedback": return read(feedbackPostStore(ctx.service, ctx.userId).select("project_id").eq("id", id).limit(1));
    case "page": return read(ctx.service.from("pages").select("project_id").eq("id", id).limit(1));
    case "routine": return read(ctx.service.from("agent_routines").select("project_id").eq("id", id).limit(1));
    default: return null;
  }
}

/**
 * Whether `authorized_by` names a memory of the user valid here. `projectId`
 * is the project the call acts on; `"any"` for a tool that acts on no
 * project (an external MCP call, account settings), where a memory of any
 * scope may allow it; `null` for a project tool whose project could not be
 * found, where only a memory for all projects does.
 */
async function authorizes(ctx: ProactiveGuardContext, value: string,
  projectId: string | null | "any"): Promise<boolean> {
  const memory = await getNumoMemoryScope(ctx.service, ctx.userId, value.toLowerCase());
  if (!memory) return false;
  return memory.project_id === null || projectId === "any" || memory.project_id === projectId;
}

/** Take one urgent-note slot of the last 24 hours, atomically. */
async function claimUrgentNote(ctx: ProactiveGuardContext): Promise<boolean> {
  const { data, error } = await ctx.service.rpc("claim_numo_urgent_note", {
    p_user_id: ctx.userId,
    p_turn_id: ctx.turnId ?? null,
    p_limit: NUMO_URGENT_NOTES_PER_DAY,
  });
  if (error) throw new Error("Unable to count the urgent notes");
  return data === true;
}

/**
 * Check one tool call of a background turn. Returns the arguments to run it
 * with (without `authorized_by`; `urgent` set only when it was accepted), or
 * the refusal the model reads.
 */
export async function guardProactiveTool(toolName: string, rawArgs: Record<string, unknown>,
  ctx: ProactiveGuardContext): Promise<ProactiveGuardResult> {
  const { authorized_by: rawAuthorizedBy, urgent, urgency_reason: urgencyReason, ...args } = rawArgs;
  if (PROACTIVE_EXCLUDED_TOOLS.has(toolName)) {
    return { ok: false, error: `${toolName} is not available in the background: nobody is there to answer. Write a journal entry instead.` };
  }
  if (PROACTIVE_REQUEST_ONLY_TOOLS.has(toolName)) {
    return { ok: false, error: `${toolName} is not available in the background: reminders are set and cancelled only when the user asks in a conversation. Write a journal entry instead.` };
  }
  // Anything but a memory id ("none", null, "") counts as no authorization.
  const authorizedBy = typeof rawAuthorizedBy === "string" && UUID_RE.test(rawAuthorizedBy.trim())
    ? rawAuthorizedBy.trim()
    : null;
  /** The call needs a memory: refuse, or check the one it names. */
  const needsMemory = async (reason: SensitiveCategory, projectId: string | null | "any"): Promise<ProactiveGuardResult> => {
    if (!authorizedBy) return { ok: false, error: proactiveRefusal(toolName, reason) };
    if (!(await authorizes(ctx, authorizedBy, projectId))) {
      return { ok: false, error: proactiveRefusal(toolName, "invalid_authorization") };
    }
    return { ok: true, args };
  };

  // Instance administration acts on no project: checked before the project
  // rules, which would look for one.
  if (ADMIN_TOOL_NAMES.has(toolName)) {
    return ADMIN_BACKGROUND_FREE_TOOLS.has(toolName) ? { ok: true, args } : needsMemory("administration", "any");
  }

  const capability = numoToolCapability(toolName);
  const fixed = SENSITIVE_TOOLS[toolName];
  if (fixed === "trash") return needsMemory(fixed, await trashItemProject(ctx, args));
  if (fixed || (capability === "admin" && !PERSONAL_TOOLS.has(toolName))) {
    const scope = capability === "personal" || capability === "personal_write"
      ? "any" as const
      : (await projectOf(ctx, args))?.id ?? null;
    return needsMemory(fixed ?? "administration", scope);
  }

  if (toolName === "notify_me") {
    const project = await projectOf(ctx, args);
    if (authorizedBy) return needsMemory("notification", project?.id ?? null);
    const reason = typeof urgencyReason === "string" ? urgencyReason.trim() : "";
    if (urgent !== true || reason.length < URGENCY_REASON_MIN) {
      return { ok: false, error: proactiveRefusal(toolName, "notification") };
    }
    if (!(await claimUrgentNote(ctx))) return { ok: false, error: proactiveRefusal(toolName, "urgent_limit") };
    return { ok: true, args: { ...args, urgent: true } };
  }

  // Adding an issue to the user's cycle assigns it to the user: in a shared
  // project, only an issue already theirs (or unassigned and theirs).
  if (toolName === "add_issues_to_cycle") {
    const ids = strings(flat(args.issue_ids));
    if (ids.length === 0 || !ids.every((id) => UUID_RE.test(id))) return { ok: true, args };
    const { data, error } = await issueStore(ctx.service, ctx.userId)
      .select("id, project_id, assignee_id, created_by").in("id", ids);
    if (error) throw new Error("Unable to read the issues for the background guard");
    for (const row of (data ?? []) as Array<{ project_id: string; assignee_id: string | null; created_by: string | null }>) {
      const mine = row.assignee_id === ctx.userId || (row.assignee_id === null && row.created_by === ctx.userId);
      if (mine) continue;
      const project = await projectById(ctx, row.project_id);
      if (project && !(await isShared(ctx, project))) continue;
      const allowed = await needsMemory("outside_scope", row.project_id);
      if (!allowed.ok) return allowed;
    }
    return { ok: true, args };
  }

  // A personal view is the user's; a shared one belongs to the project.
  if (toolName === "create_view" || toolName === "update_view") {
    let projectId: unknown = args.project_id;
    if (toolName === "create_view") {
      if (args.personal === true || projectId === null || projectId === undefined || projectId === "") {
        return { ok: true, args };
      }
    } else {
      const viewId = typeof args.view_id === "string" ? args.view_id.trim() : "";
      if (!UUID_RE.test(viewId)) return { ok: true, args };
      const { data, error } = await ctx.service.from("views").select("id, user_id, project_id")
        .eq("id", viewId).maybeSingle();
      if (error) throw new Error("Unable to read the view for the background guard");
      if (!data || data.user_id === ctx.userId) return { ok: true, args };
      projectId = data.project_id;
    }
    const project = typeof projectId === "string" && UUID_RE.test(projectId)
      ? await projectById(ctx, projectId)
      : await projectOf(ctx, args);
    if (!project || !(await isShared(ctx, project))) return { ok: true, args };
    return needsMemory("outside_scope", project.id);
  }

  if (!isProjectWrite(toolName)) return { ok: true, args };
  const project = await projectOf(ctx, args);
  // No project to check: the tool itself refuses the call.
  if (!project) return { ok: true, args };
  if (!(await isShared(ctx, project))) return { ok: true, args };
  const targetsOf = SCOPED_WRITES[toolName];
  const targets = targetsOf ? targetsOf(args) : "creates";
  if (targets !== "creates" && await targetsAreTheUsers(ctx, project, targets)) return { ok: true, args };
  return needsMemory("outside_scope", project.id);
}
