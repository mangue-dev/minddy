import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getProjectAccess, type ProjectAccess } from "@/lib/server/project-access";
import { createIssueForProject } from "@/lib/server/create-issue";
import { updateIssueFields } from "@/lib/server/update-issue";
import { addCommentToIssue } from "@/lib/server/add-comment";
import { setIssueCategories } from "@/lib/server/set-issue-categories";
import { createView, updateView } from "@/lib/server/views";
import { createObjective, updateObjective } from "@/lib/server/objectives";
import { createCategory, updateCategory } from "@/lib/server/categories";
import { updateProjectSettings } from "@/lib/server/update-project";
import {
  cancelInvitation,
  inviteMember,
  listPendingInvitations,
  removeMember,
} from "@/lib/server/members";
import {
  createIntegration,
  revokeIntegration,
  updateIntegrationWebhook,
} from "@/lib/server/integrations";
import {
  integrationUsage,
  isIntegrationKind,
} from "@/lib/feedback/integration-contract";
import { SITE_URL } from "@/lib/site";
import {
  configureFeedbackBoard,
  getFeedbackBoardConfig,
} from "@/lib/server/feedback/board-config";
import {
  getAccountSettings,
  updateAccountSettings,
} from "@/lib/server/account-settings";
import {
  ensureCycles,
  fillCycleForUser,
  getCycleOverview,
  getCyclePrefsForUser,
  toCycleInfo,
} from "@/lib/server/cycles";
import { todayISO, type FillWeights } from "@/lib/cycle";
import {
  getScratchpad,
  mutateScratchpad,
  setScratchpad,
} from "@/lib/server/scratchpad";
import {
  appendScratchpadTasks,
  splitScratchpadSections,
  MAX_SCRATCHPAD_LENGTH,
  type NewTask,
} from "@/lib/scratchpad";
import {
  appendToPlan,
  isPlanTaskState,
  parsePlan,
  setTaskState,
  MAX_PLAN_LENGTH,
  type ParsedPlan,
  type PlanTaskState,
} from "@/lib/plan";
import {
  assertIssueInProject,
  getIssue,
  listIssues,
  listMembers,
  searchIssues,
  type ReadContext,
} from "@/lib/server/issue-reads";
import { getProjectFeedbackPost } from "@/lib/server/feedback/team-guard";
import { listTeamFeedback, getTeamFeedbackDetail } from "@/lib/server/feedback/team-queries";
import { fetchAuthUsersById, toNamed } from "@/lib/server/auth-users";
import { displayName } from "@/lib/display-name";
import { updateFeedbackPostFields } from "@/lib/server/feedback/posts";
import {
  linkFeedbackIssue,
  promoteFeedbackPost,
  unlinkFeedbackIssue,
} from "@/lib/server/feedback/promote";
import { issueIdentifier } from "@/lib/issue-constants";
import { isStatus, type IssueStatusValue } from "@/lib/issue-validation";
import { continueOrLaunchAgentRun, type LaunchResult } from "@/lib/server/agent/launch";
import {
  buildAgentLaunchMessage,
  intentForLaunchMode,
  isAgentLaunchMode,
  type LaunchMessageIssue,
} from "@/lib/server/agent/launch-message";
import { getAgentModelsForUser } from "@/lib/server/agent/models-catalog";
import { resolveRepoCloneTarget } from "@/lib/server/agent/repo-access";
import { forgeFor } from "@/lib/server/agent/forge";
import { groupReviewThreads } from "@/lib/pr-review-threads";
import {
  runWebSearchTool,
  MAX_WEB_SEARCHES_PER_TURN,
  WEB_SEARCH_SEQ_BASE,
} from "@/lib/server/web-search";

// ── Tool execution ─────────────────────────────────────────────────────
// Reads go through the user's RLS client (tenant isolation for free); writes
// go through the Phase-1 lib/server/* mutation cores (service client) with
// actorId = the requesting user, AFTER an explicit getProjectAccess check —
// every event/notification stays attributed to the human who asked.

export interface ToolContext {
  /** Project scope of the conversation; null = global mode. */
  projectId: string | null;
  userId: string;
  /** The feedback post a @Numo feedback comment is on — the feedback tools
      default to it when the model omits feedback_post_id. Null otherwise. */
  feedbackPostId?: string | null;
  /** RLS client bound to the user's session (reads). */
  supabase: SupabaseClient;
  /** Service client (auth admin lookups). */
  service: SupabaseClient;
  locale: string;
  /** Landing status for issues Numo creates without an explicit status —
      the user's Account → Preferences choice. Defaults to 'triage'. */
  numoDefaultStatus?: IssueStatusValue;
  /** Where a launch_code_agent call comes from (chat vs @numo comment). */
  triggerSource?: "chat" | "mention";
  /**
   * Recherche web du tour courant : le run du ledger auquel rattacher ses lignes
   * `web_search`, et le compteur (MUTÉ) qui plafonne les recherches d'un même
   * tour. Absent = la surface n'ouvre pas la recherche web.
   */
  webSearch?: WebSearchTurn;
  /** Conversation du tour (drill-down du ledger). Null hors chat. */
  conversationId?: string | null;
}

/** État de la recherche web pour UN tour (une réponse Numo, un @Numo). */
export interface WebSearchTurn {
  runId: string;
  /** Recherches déjà faites ce tour — sert de plafond ET de `seq` de ledger. */
  used: number;
}

export interface ToolExecution {
  result: unknown;
  success: boolean;
}

function toolError(message: string): ToolExecution {
  return { result: { error: message }, success: false };
}

/** Map a lib/server/* failure into a readable tool error. */
function libError(r: { errorKey?: string; rawMessage?: string }): ToolExecution {
  return toolError(r.rawMessage ?? r.errorKey ?? "Request failed");
}

/** Readable message for a failed launch_code_agent (relayed to the user by Numo). */
function launchErrorMessage(r: Extract<LaunchResult, { ok: false }>): string {
  switch (r.error) {
    case "issueNotFound":
      return "Issue not found.";
    case "noRepo":
      return "This project has no linked GitHub repository. Link one in the project's Git settings first.";
    case "unsupportedProvider":
      return "The code agent currently supports GitHub repositories only.";
    case "alreadyRunning":
      return "An agent run is already in progress on this issue.";
    case "quotaExceeded":
      return "Monthly code-agent usage limit reached. Add your own OpenRouter key (BYOK) in Account settings for unlimited usage.";
    case "noModelForProvider":
      return "The active provider has no default model, so a model must be chosen. Call list_agent_models to find an available model id for this provider, then relaunch with that model (or the user can set a default in Account settings).";
    default:
      return "Could not launch the code agent.";
  }
}

/** Readable messages for the settings cores' errorKeys — the assistant does not
    run these through i18n, so it needs plain sentences to relay to the user. */
const SETTINGS_ERROR_MESSAGES: Record<string, string> = {
  ownerOnly: "Only the project owner can change this.",
  ownerOnlyInvite: "Only the project owner can invite members.",
  projectNotFound: "Project not found or not accessible.",
  nameRequired: "A name is required.",
  invalidProjectKey: "The project key must be 2 to 5 letters (A–Z).",
  projectKeyAlreadyUsed: "That project key is already used by another of your projects.",
  noFieldsToUpdate: "No fields to update.",
  invalidEmail: "That email address is invalid.",
  noAccountForEmail: "No minddy account exists for that email address.",
  alreadyOwner: "That person is the project owner.",
  alreadyMember: "That person is already a member of the project.",
  invitationAlreadyPending: "There is already a pending invitation for that email.",
  cannotRemoveOwner: "The project owner cannot be removed.",
  invalidColor: "That color is invalid (use a hex color like #7c5cff).",
  categoryNotFound: "Category not found in this project.",
  integrationNameRequired: "An integration name is required.",
  integrationNotFound: "Integration not found.",
  boardNotFound:
    "This project has no feedback board yet — pass enabled: true to create it.",
  webhookInvalidUrl: "The webhook URL is invalid (must be http/https).",
  webhookInvalidConfig: "The webhook events or scope are invalid.",
  databaseError: "A database error occurred.",
};

function settingsError(errorKey: string): ToolExecution {
  return toolError(SETTINGS_ERROR_MESSAGES[errorKey] ?? errorKey);
}

/** Read context for the shared lib/server/issue-reads.ts helpers — Numo reads
    through the user's RLS client (tenant isolation for free). */
function readCtx(
  ctx: ToolContext,
  projectId: string,
  access: ProjectAccess
): ReadContext {
  return {
    db: ctx.supabase,
    service: ctx.service,
    projectId,
    projectKey: access.project.key,
  };
}

// ── Implementation plan (append_to_plan / update_plan_tasks) ───────────
// Both tools are surgical by construction: they read the plan that is stored
// RIGHT NOW and give back that same markdown with something added or one
// marker flipped. Nothing the model didn't touch can be lost on the way —
// which a full `update_issues { plan }` rewrite cannot promise.

/** Task labels are elided here: the list exists to give the model an INDEX to
 *  address, and the plan markdown right beside it already carries the full text
 *  — spending the get_issue result budget on it twice would truncate the reply
 *  mid-array (see getToolResultCharLimit). */
const PLAN_TASK_TEXT_MAX = 120;

const planTaskList = (parsed: ParsedPlan) =>
  parsed.tasks.map((t) => ({
    task_index: t.index,
    state: t.state,
    text:
      t.text.length > PLAN_TASK_TEXT_MAX
        ? `${t.text.slice(0, PLAN_TASK_TEXT_MAX)}…`
        : t.text,
    ...(t.question ? { question: true } : {}),
  }));

/** The issue's plan markdown as stored ("" when it has none). */
async function readPlan(
  ctx: ToolContext,
  issueId: string
): Promise<{ plan: string } | { error: string }> {
  const { data, error } = await ctx.supabase
    .from("issues")
    .select("plan")
    .eq("id", issueId)
    .maybeSingle();
  if (error) return { error: error.message };
  return { plan: typeof data?.plan === "string" ? data.plan : "" };
}

/** Save a rewritten plan and report back its refreshed tasks. */
async function writePlan(
  ctx: ToolContext,
  issueId: string,
  plan: string,
  updated?: number
): Promise<ToolExecution> {
  const result = await updateIssueFields({
    issueId,
    actorId: ctx.userId,
    input: { plan },
    viaAssistant: true,
  });
  if (!result.ok) return libError(result);
  const parsed = parsePlan((result.issue.plan as string) ?? "");
  return {
    result: {
      ...(updated === undefined ? {} : { updated }),
      plan_tasks: planTaskList(parsed),
      plan_progress: parsed.progress,
    },
    success: true,
  };
}

/** create_view / update_view for both scopes: project mode uses the
    conversation's project, global mode (ctx.projectId null) targets the user's
    personal cross-project view. Access is enforced inside create/updateView. */
async function executeViewTool(
  toolName: "create_view" | "update_view",
  args: Record<string, unknown>,
  ctx: ToolContext
): Promise<ToolExecution> {
  const shape = (r: {
    view: Record<string, unknown>;
    invalid: string[];
  }): ToolExecution => ({
    result: {
      view: {
        id: r.view.id,
        name: r.view.name,
        kind: r.view.kind,
      },
      // Anything sanitizeViewConfig dropped — lets the model self-correct.
      ...(r.invalid.length > 0 ? { invalid: r.invalid } : {}),
    },
    success: true,
  });

  if (toolName === "create_view") {
    const result = await createView({
      projectId: ctx.projectId,
      actorId: ctx.userId,
      input: args,
    });
    return result.ok ? shape(result) : libError(result);
  }
  const viewId = typeof args.view_id === "string" ? args.view_id : "";
  if (!viewId) return toolError("view_id is required.");
  const result = await updateView({ viewId, actorId: ctx.userId, input: args });
  return result.ok ? shape(result) : libError(result);
}

/** list_views for both scopes: the project's views in project mode, the user's
    personal cross-project views in global mode (project_id null). RLS scopes
    both — a global view is only ever visible to its owner. */
async function listViews(
  ctx: ToolContext,
  projectId: string | null
): Promise<ToolExecution> {
  const base = ctx.supabase
    .from("views")
    .select("id, name, kind, user_id, filters, sort, display");
  const { data, error } = await (projectId
    ? base.eq("project_id", projectId)
    : base.is("project_id", null)
  ).order("position", { ascending: true });
  if (error) return toolError(error.message);
  const views = (data ?? []).map((v) => ({
    id: v.id,
    name: v.name,
    kind: v.kind,
    shared: v.user_id === null,
    filters: v.filters,
    sort: v.sort,
    display: v.display,
  }));
  return { result: { views }, success: true };
}

/** Cross-project category/objective/integration options for global-mode view
    filters — grouped by name so the same label across projects collapses into
    one entry carrying every matching id. */
async function listGlobalFilterOptions(
  ctx: ToolContext
): Promise<ToolExecution> {
  const { data: projectRows, error: pErr } = await ctx.supabase
    .from("projects")
    .select("id")
    .is("deleted_at", null);
  if (pErr) return toolError(pErr.message);
  const projectIds = (projectRows ?? []).map((p) => (p as { id: string }).id);

  const [catsRes, objsRes] = await Promise.all([
    ctx.supabase.from("categories").select("id, name"),
    ctx.supabase.from("objectives").select("id, name"),
  ]);
  if (catsRes.error) return toolError(catsRes.error.message);
  if (objsRes.error) return toolError(objsRes.error.message);

  // Integrations aren't readable under the user's RLS — service client, scoped
  // to the projects the user can access (mirrors GET /api/me/board).
  const { data: intRows } = projectIds.length
    ? await ctx.service
        .from("integrations")
        .select("id, name")
        .in("project_id", projectIds)
    : { data: [] as { id: string; name: string }[] };

  const group = (rows: { id: string; name: string }[]) => {
    const byName = new Map<string, string[]>();
    for (const r of rows) {
      const ids = byName.get(r.name);
      if (ids) ids.push(r.id);
      else byName.set(r.name, [r.id]);
    }
    return [...byName.entries()].map(([name, ids]) => ({ name, ids }));
  };

  return {
    result: {
      categories: group((catsRes.data ?? []) as { id: string; name: string }[]),
      objectives: group((objsRes.data ?? []) as { id: string; name: string }[]),
      integrations: group(
        (intRows ?? []) as { id: string; name: string }[]
      ),
    },
    success: true,
  };
}

/**
 * Recherche web (hors minddy) — un sous-appel OpenRouter facturé, d'où le
 * plafond par tour : au-delà, on refuse et on invite le modèle à répondre avec ce
 * qu'il a plutôt que de rechercher en boucle. La ligne de ledger `web_search`
 * est écrite par runWebSearchTool, sur le run du tour.
 */
async function executeWebSearch(
  args: Record<string, unknown>,
  ctx: ToolContext
): Promise<ToolExecution> {
  const query = typeof args.query === "string" ? args.query.trim() : "";
  if (!query) return toolError("query is required");

  const turn = ctx.webSearch;
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!turn || !apiKey) {
    return toolError("Web search is not available here.");
  }
  if (turn.used >= MAX_WEB_SEARCHES_PER_TURN) {
    return toolError(
      `Web search limit reached for this turn (${MAX_WEB_SEARCHES_PER_TURN} searches). Answer with what you already found.`
    );
  }

  const seq = WEB_SEARCH_SEQ_BASE + turn.used;
  turn.used++;
  return await runWebSearchTool({
    query,
    apiKey,
    runId: turn.runId,
    seq,
    userId: ctx.userId,
    projectId: ctx.projectId,
    conversationId: ctx.conversationId ?? null,
  });
}

export async function executeTool(
  toolName: string,
  args: Record<string, unknown>,
  ctx: ToolContext
): Promise<ToolExecution> {
  try {
    // ── Global-only tools ───────────────────────────────────────────────
    if (toolName === "list_projects") {
      const { data, error } = await ctx.supabase
        .from("projects")
        .select("id, name, key")
        .is("deleted_at", null)
        .order("created_at", { ascending: true });
      if (error) return toolError(error.message);
      return { result: { projects: data ?? [] }, success: true };
    }
    if (toolName === "list_global_filter_options") {
      return listGlobalFilterOptions(ctx);
    }

    // ── Web (outside minddy) ────────────────────────────────────────────
    if (toolName === "web_search") {
      return executeWebSearch(args, ctx);
    }

    // ── View tools (scope = the conversation's) ─────────────────────────
    // Project mode → a project view; global mode (ctx.projectId null) → the
    // user's cross-project global view (project_id null, personal). create/
    // updateView enforce access themselves, so no project_id is required here.
    if (toolName === "list_views") {
      return listViews(ctx, ctx.projectId);
    }
    if (toolName === "create_view" || toolName === "update_view") {
      return executeViewTool(toolName, args, ctx);
    }

    // ── Account tools (the requesting user's own account — no project) ──
    if (toolName === "get_account_settings") {
      const r = await getAccountSettings({ userId: ctx.userId });
      return r.ok
        ? { result: { settings: r.settings }, success: true }
        : toolError(r.error);
    }
    if (toolName === "update_account_settings") {
      const r = await updateAccountSettings({ userId: ctx.userId, input: args });
      return r.ok
        ? { result: { settings: r.settings }, success: true }
        : toolError(r.error);
    }

    // ── Agent model catalog (per-account: resolved by the active provider) ──
    if (toolName === "list_agent_models") {
      const catalog = await getAgentModelsForUser(ctx.userId);
      const q = typeof args.query === "string" ? args.query.trim().toLowerCase() : "";
      const matched = q
        ? catalog.models.filter(
            (m) =>
              m.id.toLowerCase().includes(q) || m.name.toLowerCase().includes(q)
          )
        : catalog.models;
      // Keep Numo's context lean: a provider catalog can hold hundreds of ids.
      const CAP = 40;
      const truncated = matched.length > CAP;
      return {
        result: {
          provider: catalog.provider,
          default_model: catalog.defaultModel,
          total_matched: matched.length,
          truncated,
          note: truncated
            ? `Showing the first ${CAP} of ${matched.length} matches — pass a more specific query to narrow.`
            : catalog.models.length === 0
              ? "The provider returned no model list (a generic endpoint may not expose one); the user can still type any exact model id."
              : undefined,
          models: matched.slice(0, CAP),
        },
        success: true,
      };
    }

    // ── Cycle tools (the user's personal cross-project cycle — MIN-32) ──
    if (
      toolName === "get_cycle" ||
      toolName === "fill_cycle" ||
      toolName === "add_issues_to_cycle" ||
      toolName === "remove_issues_from_cycle"
    ) {
      return executeCycleTool(toolName, args, ctx);
    }

    // ── Scratchpad tools (the user's personal task notebook) ────────────
    if (
      toolName === "get_scratchpad" ||
      toolName === "add_scratchpad_tasks" ||
      toolName === "update_scratchpad_tasks" ||
      toolName === "set_scratchpad"
    ) {
      return executeScratchpadTool(toolName, args, ctx);
    }

    // ── Project scope resolution (all remaining tools) ──────────────────
    const projectId =
      ctx.projectId ??
      (typeof args.project_id === "string" ? args.project_id : null);
    if (!projectId) {
      return toolError(
        "No project in scope. Pass project_id (use list_projects to discover projects)."
      );
    }
    const access = await getProjectAccess(ctx.userId, projectId);
    if (!access) {
      return toolError("Project not found or not accessible.");
    }

    switch (toolName) {
      // ── Read tools (shared with the MCP server — issue-reads.ts) ──────
      case "list_issues": {
        const r = await listIssues(readCtx(ctx, projectId, access), args);
        return "error" in r ? toolError(r.error) : { result: r, success: true };
      }
      case "search_issues": {
        const r = await searchIssues(readCtx(ctx, projectId, access), args);
        return "error" in r ? toolError(r.error) : { result: r, success: true };
      }
      case "get_issue": {
        const r = await getIssue(readCtx(ctx, projectId, access), args);
        if ("error" in r) return toolError(r.error);
        // Plan tasks come out parsed, with the indices append_to_plan's sibling
        // update_plan_tasks addresses — without them the only way to tick a
        // task off would be to resend a whole rewritten plan.
        const parsed = parsePlan(
          typeof r.issue.plan === "string" ? r.issue.plan : null
        );
        return {
          result:
            parsed.tasks.length > 0
              ? { ...r, plan_tasks: planTaskList(parsed), plan_progress: parsed.progress }
              : r,
          success: true,
        };
      }
      case "list_members": {
        const r = await listMembers(
          readCtx(ctx, projectId, access),
          access.project.owner_id
        );
        if ("error" in r) return toolError(r.error);
        // Owners also see pending invitations (for cancel_invitation).
        const pending_invitations = access.isOwner
          ? await listPendingInvitations(projectId)
          : [];
        return {
          result: { ...r, pending_invitations },
          success: true,
        };
      }
      case "list_objectives": {
        const { data, error } = await ctx.supabase
          .from("objectives")
          .select("id, name, status, lead_user_id, target_date")
          .eq("project_id", projectId)
          .order("created_at", { ascending: true });
        if (error) return toolError(error.message);
        return { result: { objectives: data ?? [] }, success: true };
      }
      case "list_categories": {
        const { data, error } = await ctx.supabase
          .from("categories")
          .select("id, name, color")
          .eq("project_id", projectId)
          .order("name", { ascending: true });
        if (error) return toolError(error.message);
        return { result: { categories: data ?? [] }, success: true };
      }
      case "list_integrations": {
        const { data, error } = await ctx.supabase
          .from("integrations")
          .select("id, name, kind, revoked_at")
          .eq("project_id", projectId)
          .order("name", { ascending: true });
        if (error) return toolError(error.message);
        return { result: { integrations: data ?? [] }, success: true };
      }

      // ── Write tools ───────────────────────────────────────────────────
      case "create_issue": {
        // Without an explicit status the issue lands in the user's configured
        // Numo default (triage unless changed in Account → Preferences) — the
        // human validation gate for assistant-created issues (plan.md §10).
        const status = isStatus(args.status)
          ? args.status
          : (ctx.numoDefaultStatus ?? "triage");
        const result = await createIssueForProject({
          projectId,
          projectName: access.project.name,
          actorId: ctx.userId,
          input: { ...args, status },
          viaAssistant: true,
        });
        if (!result.ok) return libError(result);
        return {
          result: {
            issue: {
              ...result.issue,
              identifier: issueIdentifier(
                access.project.key,
                result.issue.number as number
              ),
            },
          },
          success: true,
        };
      }

      case "update_issues": {
        const issueIds = Array.isArray(args.issue_ids)
          ? args.issue_ids.filter((v): v is string => typeof v === "string")
          : [];
        if (issueIds.length === 0 || issueIds.length > 50) {
          return toolError("issue_ids must contain between 1 and 50 issue ids.");
        }
        const fields =
          args.fields && typeof args.fields === "object"
            ? (args.fields as Record<string, unknown>)
            : {};
        if (Object.keys(fields).length === 0) {
          return toolError("fields must contain at least one field to change.");
        }

        const failed: Array<{ id: string; error: string }> = [];
        let updated = 0;
        for (const issueId of issueIds) {
          const scoped = await assertIssueInProject(ctx.supabase, issueId, projectId);
          if (!scoped.ok) {
            failed.push({ id: issueId, error: scoped.error });
            continue;
          }
          const result = await updateIssueFields({
            issueId,
            actorId: ctx.userId,
            input: fields,
            viaAssistant: true,
          });
          if (result.ok) updated++;
          else
            failed.push({
              id: issueId,
              error: result.rawMessage ?? result.errorKey ?? "update failed",
            });
        }
        return {
          result: { updated, failed },
          success: failed.length === 0,
        };
      }

      case "append_to_plan": {
        const issueId = typeof args.issue_id === "string" ? args.issue_id : "";
        const scoped = await assertIssueInProject(ctx.supabase, issueId, projectId);
        if (!scoped.ok) return toolError(scoped.error);
        const markdown = typeof args.markdown === "string" ? args.markdown : "";
        if (!markdown.trim()) {
          return toolError("markdown must contain the block to add to the plan.");
        }
        const section =
          typeof args.section === "string" && args.section.trim()
            ? args.section.trim()
            : null;
        const current = await readPlan(ctx, issueId);
        if ("error" in current) return toolError(current.error);
        const next = appendToPlan(current.plan, markdown, section);
        if (next === null) {
          return toolError(
            `This plan has no "${section}" heading. Read the plan with get_issue to see its headings, or omit "section" to append at the end.`
          );
        }
        if (next.length > MAX_PLAN_LENGTH) {
          return toolError(`The plan is capped at ${MAX_PLAN_LENGTH} characters.`);
        }
        return writePlan(ctx, issueId, next);
      }

      case "update_plan_tasks": {
        const issueId = typeof args.issue_id === "string" ? args.issue_id : "";
        const scoped = await assertIssueInProject(ctx.supabase, issueId, projectId);
        if (!scoped.ok) return toolError(scoped.error);
        const raw = Array.isArray(args.tasks) ? args.tasks : null;
        if (!raw || raw.length === 0 || raw.length > 50) {
          return toolError("tasks must be a list of 1 to 50 task-state changes.");
        }
        const changes: { index: number; state: PlanTaskState }[] = [];
        for (const item of raw) {
          const row = item as Record<string, unknown>;
          const index = row.task_index;
          if (typeof index !== "number" || !Number.isInteger(index) || index < 0) {
            return toolError("task_index must be a non-negative integer.");
          }
          if (!isPlanTaskState(row.state)) {
            return toolError(
              `Invalid task state "${String(row.state)}" — use pending, in_progress, completed or cancelled.`
            );
          }
          changes.push({ index, state: row.state });
        }
        const current = await readPlan(ctx, issueId);
        if ("error" in current) return toolError(current.error);
        const parsed = parsePlan(current.plan);
        // All or nothing: a stale index points at another task, so refuse the
        // whole call rather than flip the wrong checkbox.
        const invalid = changes
          .map((c) => c.index)
          .filter((i) => !parsed.tasks[i]);
        if (invalid.length > 0) {
          return toolError(
            `No plan task at index(es) ${[...new Set(invalid)].join(", ")} — this plan has ${parsed.tasks.length} task(s). Call get_issue again for fresh plan_tasks.`
          );
        }
        let next = current.plan;
        for (const change of changes) {
          next = setTaskState(next, parsed.tasks[change.index].line, change.state);
        }
        return writePlan(ctx, issueId, next, changes.length);
      }

      case "set_issue_categories": {
        const issueId = typeof args.issue_id === "string" ? args.issue_id : "";
        const scoped = await assertIssueInProject(ctx.supabase, issueId, projectId);
        if (!scoped.ok) return toolError(scoped.error);
        const categoryIds = Array.isArray(args.category_ids)
          ? args.category_ids.filter((v): v is string => typeof v === "string")
          : [];
        const result = await setIssueCategories({
          issueId,
          actorId: ctx.userId,
          categoryIds,
          viaAssistant: true,
        });
        if (!result.ok) return libError(result);
        return { result: { category_ids: result.categoryIds }, success: true };
      }

      case "add_comment": {
        const issueId = typeof args.issue_id === "string" ? args.issue_id : "";
        const scoped = await assertIssueInProject(ctx.supabase, issueId, projectId);
        if (!scoped.ok) return toolError(scoped.error);
        const body = typeof args.body === "string" ? args.body : "";
        const result = await addCommentToIssue({
          issueId,
          actorId: ctx.userId,
          body,
          viaAssistant: true,
        });
        if (!result.ok) return libError(result);
        return { result: { comment: result.comment }, success: true };
      }

      case "launch_code_agent": {
        const issueId = typeof args.issue_id === "string" ? args.issue_id : "";
        const scoped = await assertIssueInProject(ctx.supabase, issueId, projectId);
        if (!scoped.ok) return toolError(scoped.error);
        const model =
          typeof args.model === "string" && args.model.trim() ? args.model.trim() : undefined;
        const prompt =
          typeof args.prompt === "string" && args.prompt.trim() ? args.prompt.trim() : undefined;

        // Trois modes NATIFS (cadrer / implémenter / vérifier l'implémentation) :
        // le message envoyé est exactement celui des boutons de l'app, construit
        // depuis les mêmes textes i18n — l'assistant n'a pas à réécrire la
        // consigne, et son `prompt` éventuel vient la préciser à la fin. Le
        // quatrième choix (`custom`, ou tout mode inconnu) retombe sur le
        // comportement d'origine : le prompt de l'assistant EST la demande.
        const mode = isAgentLaunchMode(args.mode) ? args.mode : null;
        let message = prompt;
        if (mode) {
          const { data: row } = await ctx.supabase
            .from("issues")
            .select("number, title, plan, effort")
            .eq("id", issueId)
            .maybeSingle();
          if (!row) return toolError("Issue not found in this project.");
          message = await buildAgentLaunchMessage({
            mode,
            issue: row as LaunchMessageIssue,
            projectKey: access.project.key,
            locale: ctx.locale,
            extra: prompt,
          });
        }

        // Si une run TRAVAILLE sur l'issue (queued/running), le prompt lui parvient
        // en STEERING au lieu d'échouer avec « alreadyRunning ». Sinon (aucune run,
        // ou la dernière est au repos) on lance une run FROIDE, qui hérite de la
        // lignée de l'issue (branche + PR éventuelle — MIN-68). NB : une session au
        // repos n'est PAS reprise ici ; la reprise à chaud d'une conversation passe
        // par le composer de SA conversation (/steer).
        const result = await continueOrLaunchAgentRun({
          issueId,
          userId: ctx.userId,
          triggeredBy: ctx.triggerSource ?? "chat",
          prompt: message,
          model,
          forced: !!model,
          // Cadrer ne fait pas démarrer le ticket ; implémenter et vérifier, si.
          ...(mode ? { intent: intentForLaunchMode(mode) } : {}),
        });
        if (!result.ok) return toolError(launchErrorMessage(result));
        return {
          result: {
            [result.continued ? "continued" : "launched"]: true,
            ...(mode ? { mode } : {}),
            run_id: result.run.id,
            status: result.run.status,
            model: result.run.model,
          },
          success: true,
        };
      }

      case "read_pull_request": {
        const issueId = typeof args.issue_id === "string" ? args.issue_id : "";
        const scoped = await assertIssueInProject(ctx.supabase, issueId, projectId);
        if (!scoped.ok) return toolError(scoped.error);

        // Canonical run for the issue's PR (earliest run that opened it).
        const { data: run } = await ctx.supabase
          .from("agent_runs")
          .select("pr_number, pr_url, pr_state, branch_name, base_branch")
          .eq("issue_id", issueId)
          .not("pr_number", "is", null)
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();
        const prNumber = (run as { pr_number?: number } | null)?.pr_number;
        if (!run || prNumber == null) {
          return toolError("This issue has no pull request opened by the code agent yet.");
        }

        const target = await resolveRepoCloneTarget(projectId);
        if (!target) return toolError("This project has no linked repository.");
        const forge = forgeFor(target.provider);

        const [pr, files, reviewComments] = await Promise.all([
          forge.getPullRequest({ token: target.token, repoFullName: target.repoFullName, number: prNumber }),
          forge.listPullRequestFiles({ token: target.token, repoFullName: target.repoFullName, number: prNumber }),
          forge
            .listPullRequestReviewComments({
              token: target.token,
              repoFullName: target.repoFullName,
              number: prNumber,
            })
            .catch(() => []),
        ]);

        // Cap patch size so a huge diff doesn't blow the context window.
        const PATCH_CAP = 4000;
        return {
          result: {
            number: pr.number,
            url: pr.url,
            state: pr.merged ? "merged" : pr.state,
            title: pr.title,
            body: pr.body,
            head: pr.head,
            base: pr.base,
            files: files.map((f) => ({
              filename: f.filename,
              status: f.status,
              additions: f.additions,
              deletions: f.deletions,
              patch:
                f.patch && f.patch.length > PATCH_CAP
                  ? f.patch.slice(0, PATCH_CAP) + "\n… (diff truncated)"
                  : f.patch ?? null,
            })),
            // Commentaires ancrés au code, regroupés en fils. `line: null` = le
            // code visé a changé depuis : l'ancre ne vaut plus, seul le hunk dit
            // de quoi on parlait.
            review_comments: groupReviewThreads(reviewComments).map((thread) => ({
              path: thread.root.path,
              line: thread.root.line,
              original_line: thread.root.original_line,
              side: thread.root.side,
              outdated: thread.root.line == null,
              diff_hunk: thread.root.diff_hunk,
              comments: thread.comments.map((c) => ({
                author: c.user?.login ?? null,
                body: c.body,
                created_at: c.created_at,
              })),
            })),
          },
          success: true,
        };
      }

      case "create_objective": {
        const result = await createObjective({
          projectId,
          actorId: ctx.userId,
          input: args,
          viaAssistant: true,
        });
        if (!result.ok) return libError(result);
        return { result: { objective: result.objective }, success: true };
      }

      case "update_objective": {
        const objectiveId =
          typeof args.objective_id === "string" ? args.objective_id : "";
        if (!objectiveId) return toolError("objective_id is required.");
        // Scope check: the objective must belong to the project in scope.
        const { data: obj } = await ctx.supabase
          .from("objectives")
          .select("id")
          .eq("id", objectiveId)
          .eq("project_id", projectId)
          .maybeSingle();
        if (!obj) return toolError("Objective not found in this project.");
        const result = await updateObjective({
          objectiveId,
          actorId: ctx.userId,
          input: args,
          viaAssistant: true,
        });
        if (!result.ok) return libError(result);
        return { result: { objective: result.objective }, success: true };
      }

      case "create_category": {
        const result = await createCategory({
          projectId,
          actorId: ctx.userId,
          input: args,
        });
        if (!result.ok) return libError(result);
        return { result: { category: result.category }, success: true };
      }

      case "triage_decision": {
        const issueId = typeof args.issue_id === "string" ? args.issue_id : "";
        const decision = args.decision;
        if (
          decision !== "accept" &&
          decision !== "decline" &&
          decision !== "duplicate"
        ) {
          return toolError("decision must be accept, decline, or duplicate.");
        }
        const { data: issue } = await ctx.supabase
          .from("issues")
          .select("id, status")
          .eq("id", issueId)
          .eq("project_id", projectId)
          .maybeSingle();
        if (!issue) return toolError("Issue not found in this project.");
        if (issue.status !== "triage") {
          return toolError(
            `This issue is not in triage (current status: ${issue.status}).`
          );
        }
        if (decision === "duplicate" && typeof args.duplicate_of_id !== "string") {
          return toolError("duplicate_of_id is required for decision='duplicate'.");
        }

        // Mirror the triage page: optional comment first, then the status change.
        if (typeof args.comment === "string" && args.comment.trim()) {
          const commented = await addCommentToIssue({
            issueId,
            actorId: ctx.userId,
            body: args.comment,
            viaAssistant: true,
          });
          if (!commented.ok) return libError(commented);
        }

        const input: Record<string, unknown> =
          decision === "accept"
            ? { status: "backlog" }
            : decision === "decline"
              ? { status: "canceled" }
              : { status: "duplicate", duplicate_of_id: args.duplicate_of_id };
        const result = await updateIssueFields({
          issueId,
          actorId: ctx.userId,
          input,
          viaAssistant: true,
        });
        if (!result.ok) return libError(result);
        return {
          result: { decision, issue_id: issueId, status: input.status },
          success: true,
        };
      }

      // ── Feedback board ────────────────────────────────────────────────
      // Feedback is RLS deny-all → reads/writes go through the service-client
      // cores. The post is always re-scoped to the project in scope; the
      // feedback comment mode's current post is the default target.

      // The board's SETUP (public URL, custom domain, SSO), as opposed to the
      // posts on it — what Numo needs to hand the user a working "Feedback"
      // button for their own app. Absolute URLs: the code goes elsewhere.
      case "get_feedback_board": {
        return {
          result: { board: await getFeedbackBoardConfig(projectId, SITE_URL) },
          success: true,
        };
      }

      case "configure_feedback_board": {
        if (!access.isOwner) return settingsError("ownerOnly");
        const result = await configureFeedbackBoard({
          projectId,
          enabled: typeof args.enabled === "boolean" ? args.enabled : undefined,
          generateSso: args.generate_sso_secret === true,
          origin: SITE_URL,
        });
        if (!result.ok) return settingsError(result.errorKey);
        return {
          result: {
            board: result.config,
            // Only present when asked for. A credential: Numo surfaces it once.
            ...(result.sso_secret ? { sso_secret: result.sso_secret } : {}),
          },
          success: true,
        };
      }

      case "list_feedback": {
        const posts = await listTeamFeedback(projectId);
        const statuses = Array.isArray(args.status)
          ? new Set(args.status.filter((v): v is string => typeof v === "string"))
          : null;
        const limit =
          typeof args.limit === "number" ? Math.min(Math.max(1, args.limit), 200) : 50;
        const rows = posts
          .filter((p) => !statuses || statuses.has(p.status))
          .slice(0, limit)
          .map((p) => ({
            id: p.id,
            title: p.title,
            status: p.status,
            vote_count: p.vote_count,
            is_public: p.is_public,
            source: p.source,
            linked_issue_id: p.issue_id,
          }));
        return { result: { feedback: rows }, success: true };
      }

      case "get_feedback": {
        const postId =
          (typeof args.feedback_post_id === "string" && args.feedback_post_id) ||
          ctx.feedbackPostId ||
          "";
        if (!postId) return toolError("feedback_post_id is required.");
        const detail = await getTeamFeedbackDetail(projectId, postId);
        if (!detail) return toolError("Feedback post not found in this project.");
        const { data: comments } = await ctx.service
          .from("comments")
          .select("author_id, via_assistant, body, created_at")
          .eq("feedback_post_id", postId)
          .order("created_at", { ascending: true });
        // Resolve author display names (never surface raw uuids to the model).
        const commentAuthorIds = [
          ...new Set(
            (comments ?? [])
              .map((c) => c.author_id as string | null)
              .filter((v): v is string => !!v)
          ),
        ];
        const commentUsers = await fetchAuthUsersById(ctx.service, commentAuthorIds);
        return {
          result: {
            feedback: {
              id: detail.id,
              title: detail.title,
              body: detail.body,
              submitted_title: detail.submitted_title,
              submitted_body: detail.submitted_body,
              status: detail.status,
              vote_count: detail.vote_count,
              is_public: detail.is_public,
              source: detail.source,
              team_response: detail.team_response,
              author: detail.author
                ? { name: detail.author.name, email: detail.author.email }
                : null,
              linked_issue: detail.issue
                ? {
                    id: detail.issue.id,
                    identifier: issueIdentifier(access.project.key, detail.issue.number),
                    status: detail.issue.status,
                  }
                : null,
              comments: (comments ?? []).map((c) => ({
                author: c.via_assistant
                  ? "Numo"
                  : displayName(
                      toNamed(
                        c.author_id ? commentUsers.get(c.author_id as string) : null
                      ),
                      "User"
                    ),
                body: c.body,
                created_at: c.created_at,
              })),
            },
          },
          success: true,
        };
      }

      case "promote_feedback_to_issue": {
        const postId =
          (typeof args.feedback_post_id === "string" && args.feedback_post_id) ||
          ctx.feedbackPostId ||
          "";
        if (!postId) return toolError("feedback_post_id is required.");
        const scoped = await getProjectFeedbackPost(projectId, postId);
        if (!scoped) return toolError("Feedback post not found in this project.");
        const result = await promoteFeedbackPost({
          postId,
          actorId: ctx.userId,
          projectName: access.project.name,
        });
        if (!result.ok) return libError(result);
        return {
          result: {
            issue: {
              ...result.issue,
              identifier: issueIdentifier(
                access.project.key,
                result.issue.number as number
              ),
            },
          },
          success: true,
        };
      }

      case "link_feedback_to_issue": {
        const postId =
          (typeof args.feedback_post_id === "string" && args.feedback_post_id) ||
          ctx.feedbackPostId ||
          "";
        if (!postId) return toolError("feedback_post_id is required.");
        const issueId = typeof args.issue_id === "string" ? args.issue_id : "";
        if (!issueId) return toolError("issue_id is required.");
        const scoped = await getProjectFeedbackPost(projectId, postId);
        if (!scoped) return toolError("Feedback post not found in this project.");
        const result = await linkFeedbackIssue({
          postId,
          issueId,
          actorId: ctx.userId,
        });
        if (!result.ok) return libError(result);
        return { result: { linked: true, feedback_post_id: postId, issue_id: issueId }, success: true };
      }

      case "unlink_feedback": {
        const postId =
          (typeof args.feedback_post_id === "string" && args.feedback_post_id) ||
          ctx.feedbackPostId ||
          "";
        if (!postId) return toolError("feedback_post_id is required.");
        const scoped = await getProjectFeedbackPost(projectId, postId);
        if (!scoped) return toolError("Feedback post not found in this project.");
        const ok = await unlinkFeedbackIssue(postId, ctx.userId);
        if (!ok) return toolError("Could not unlink the feedback post.");
        return { result: { unlinked: true, feedback_post_id: postId }, success: true };
      }

      case "respond_to_feedback": {
        const postId =
          (typeof args.feedback_post_id === "string" && args.feedback_post_id) ||
          ctx.feedbackPostId ||
          "";
        if (!postId) return toolError("feedback_post_id is required.");
        if (typeof args.response !== "string") {
          return toolError("response must be a string.");
        }
        const scoped = await getProjectFeedbackPost(projectId, postId);
        if (!scoped) return toolError("Feedback post not found in this project.");
        const result = await updateFeedbackPostFields({
          postId,
          actorId: ctx.userId,
          input: { team_response: args.response },
          viaAssistant: true,
        });
        if (!result.ok) return toolError(result.errorKey);
        return {
          result: {
            feedback_post_id: postId,
            team_response: result.post.team_response,
          },
          success: true,
        };
      }

      // ── Project settings (owner-gated inside the cores) ───────────────
      case "update_project": {
        const result = await updateProjectSettings({
          projectId,
          actorId: ctx.userId,
          input: args,
        });
        if (!result.ok) return settingsError(result.errorKey);
        return {
          result: {
            project: {
              id: result.project.id,
              name: result.project.name,
              key: result.project.key,
              color: result.project.color,
            },
          },
          success: true,
        };
      }

      case "invite_member": {
        const result = await inviteMember({
          projectId,
          actorId: ctx.userId,
          email: args.email,
        });
        if (!result.ok) return settingsError(result.errorKey);
        return {
          result: {
            invitation: {
              id: result.invitation.id,
              email: result.invitation.invited_email,
            },
          },
          success: true,
        };
      }

      case "remove_member": {
        const userId = typeof args.user_id === "string" ? args.user_id : "";
        if (!userId) return toolError("user_id is required.");
        const result = await removeMember({
          projectId,
          actorId: ctx.userId,
          userId,
        });
        if (!result.ok) return settingsError(result.errorKey);
        return { result: { removed: userId }, success: true };
      }

      case "cancel_invitation": {
        const invitationId =
          typeof args.invitation_id === "string" ? args.invitation_id : "";
        if (!invitationId) return toolError("invitation_id is required.");
        const result = await cancelInvitation({
          projectId,
          actorId: ctx.userId,
          invitationId,
        });
        if (!result.ok) return settingsError(result.errorKey);
        return { result: { cancelled: invitationId }, success: true };
      }

      case "update_category": {
        const categoryId =
          typeof args.category_id === "string" ? args.category_id : "";
        if (!categoryId) return toolError("category_id is required.");
        const result = await updateCategory({
          categoryId,
          projectId,
          actorId: ctx.userId,
          input: args,
        });
        if (!result.ok) return settingsError(result.errorKey ?? "databaseError");
        return { result: { category: result.category }, success: true };
      }

      // ── Integrations (owner-gated) ────────────────────────────────────
      case "create_integration": {
        if (!access.isOwner) return settingsError("ownerOnly");
        // 'issues' | 'feedback' — validé côté core, défaut 'issues'.
        const kind = isIntegrationKind(args.kind) ? args.kind : "issues";
        const result = await createIntegration({
          projectId,
          actorId: ctx.userId,
          name: args.name,
          kind,
        });
        if (!result.ok) return settingsError(result.errorKey);
        return {
          result: {
            integration: {
              id: result.integration.id,
              name: result.integration.name,
              kind: result.integration.kind,
            },
            // The plaintext key is returned ONCE — Numo must surface it now.
            key: result.key,
            // …and a key is useless without the format that goes with it.
            usage: integrationUsage(kind, SITE_URL),
          },
          success: true,
        };
      }

      case "update_integration_webhook": {
        if (!access.isOwner) return settingsError("ownerOnly");
        const integrationId =
          typeof args.integration_id === "string" ? args.integration_id : "";
        if (!integrationId) return toolError("integration_id is required.");
        const result = await updateIntegrationWebhook({
          projectId,
          integrationId,
          input: args,
        });
        if (!result.ok) return settingsError(result.errorKey);
        return {
          result: {
            integration: {
              id: result.integration.id,
              name: result.integration.name,
              webhook_url: result.integration.webhook_url,
              webhook_events: result.integration.webhook_events,
              webhook_scope: result.integration.webhook_scope,
            },
          },
          success: true,
        };
      }

      case "revoke_integration": {
        if (!access.isOwner) return settingsError("ownerOnly");
        const integrationId =
          typeof args.integration_id === "string" ? args.integration_id : "";
        if (!integrationId) return toolError("integration_id is required.");
        const result = await revokeIntegration({ projectId, integrationId });
        if (!result.ok) return settingsError(result.errorKey);
        return { result: { revoked: integrationId }, success: true };
      }

      default:
        return toolError(`Unknown tool: ${toolName}`);
    }
  } catch (err) {
    console.error(`[assistant] tool ${toolName} threw:`, err);
    return toolError(err instanceof Error ? err.message : "Tool execution failed");
  }
}

// ── Cycles (MIN-32) ─────────────────────────────────────────────────────
// The cycle is the requesting user's own, cross-project — no project scope.
// Reads/writes go through the lib/server/cycles.ts cores (service client);
// add/remove reuse updateIssueFields so the assignment side-effect, activity
// events and the SQL invariant apply exactly like the UI path.

function parseFillWeights(args: Record<string, unknown>): FillWeights {
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
  const boostMap = (v: unknown, idKey: string): Record<string, number> | undefined => {
    if (!Array.isArray(v)) return undefined;
    const out: Record<string, number> = {};
    for (const item of v) {
      const row = item as Record<string, unknown>;
      const id = row?.[idKey];
      const weight = num(row?.weight);
      if (typeof id === "string" && id && weight !== undefined) out[id] = weight;
    }
    return Object.keys(out).length ? out : undefined;
  };
  const keywordBoost = Array.isArray(args.keyword_boosts)
    ? (args.keyword_boosts as Record<string, unknown>[])
        .map((row) => ({
          keyword: typeof row?.keyword === "string" ? row.keyword : "",
          weight: num(row?.weight) ?? 0,
        }))
        .filter((k) => k.keyword && k.weight)
    : undefined;
  return {
    priority: num(args.priority_weight),
    unblocked: num(args.unblocked_weight),
    small: num(args.small_first_weight),
    projectBoost: boostMap(args.project_boosts, "project_id"),
    categoryBoost: boostMap(args.category_boosts, "category_id"),
    keywordBoost: keywordBoost?.length ? keywordBoost : undefined,
  };
}

function parseIssueIds(args: Record<string, unknown>): string[] | null {
  const raw = args.issue_ids;
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 50) return null;
  const ids = raw.filter((v): v is string => typeof v === "string" && v.length > 0);
  return ids.length === raw.length ? ids : null;
}

async function executeCycleTool(
  toolName: string,
  args: Record<string, unknown>,
  ctx: ToolContext
): Promise<ToolExecution> {
  const prefs = await getCyclePrefsForUser(ctx.service, ctx.userId);
  if (!prefs.enabled) {
    return toolError(
      "Cycles are not enabled for this account. The user can enable them in Account → Cycles (or via update_account_settings with cycles_enabled: true)."
    );
  }
  const ensured = await ensureCycles({
    service: ctx.service,
    userId: ctx.userId,
    prefs,
    today: todayISO(),
  });
  const current = ensured.current;

  if (toolName === "get_cycle") {
    const which =
      args.which === "next" || args.which === "previous" ? args.which : "current";
    const r = await getCycleOverview({
      service: ctx.service,
      userId: ctx.userId,
      prefs,
      which,
    });
    if (!r.ok) return toolError(r.error);
    return {
      result: {
        ...r.overview,
        intensity_note:
          "Points are internal — talk to the user in effort sizes or % of capacity.",
      },
      success: true,
    };
  }

  if (!current) return toolError("No current cycle exists yet.");

  if (toolName === "fill_cycle") {
    const { pickedIds, points } = await fillCycleForUser({
      service: ctx.service,
      userId: ctx.userId,
      actorId: ctx.userId,
      cycle: current,
      weights: parseFillWeights(args),
      viaAssistant: true,
    });
    return {
      result: {
        added: pickedIds.length,
        added_ids: pickedIds,
        added_points: points,
        cycle: toCycleInfo(current),
      },
      success: true,
    };
  }

  if (toolName === "add_issues_to_cycle" || toolName === "remove_issues_from_cycle") {
    const ids = parseIssueIds(args);
    if (!ids) return toolError("issue_ids must be 1–50 issue ids.");
    const removing = toolName === "remove_issues_from_cycle";
    const done: string[] = [];
    const failed: { id: string; error: string }[] = [];
    for (const issueId of ids) {
      if (removing) {
        // Only pull issues out of the user's OWN current cycle — never someone
        // else's (project access alone would otherwise allow it).
        const { data: row } = await ctx.service
          .from("issues")
          .select("cycle_id")
          .eq("id", issueId)
          .maybeSingle();
        if (!row || row.cycle_id !== current.id) {
          failed.push({ id: issueId, error: "Not in the user's current cycle." });
          continue;
        }
      }
      const r = await updateIssueFields({
        issueId,
        actorId: ctx.userId,
        input: { cycle_id: removing ? null : current.id },
        viaAssistant: true,
      });
      if (r.ok) done.push(issueId);
      else failed.push({ id: issueId, error: r.rawMessage ?? r.errorKey ?? "failed" });
    }
    return {
      result: removing
        ? { removed: done.length, removed_ids: done, failed }
        : { added: done.length, added_ids: done, failed },
      success: failed.length < ids.length,
    };
  }

  return toolError(`Unknown cycle tool: ${toolName}`);
}

// ── Scratchpad (the personal task notebook) ─────────────────────────────
// Personal and cross-project like the cycle: no project scope, addressed by the
// requesting user alone. Same cores as the MCP tools and /api/me/scratchpad
// (lib/server/scratchpad.ts), so the compare-and-swap on `rev`, the stats ledger
// and the realtime broadcast that refreshes an open editor all apply here too.
// Through the service client: the row is keyed by user_id, and in @Numo comment
// mode the RLS client isn't necessarily bound to the user we act for.

const scratchpadTaskList = (content: string) =>
  parsePlan(content).tasks.map((t) => ({
    index: t.index,
    text: t.text,
    state: t.state,
  }));

const scratchpadSections = (content: string): string[] =>
  splitScratchpadSections(content)
    .map((s) => s.title)
    .filter((title): title is string => title !== null);

/** `expected_rev` when the model passed a usable one, else null (unconditional). */
function parseExpectedRev(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0
    ? value
    : null;
}

const STALE_REV = (expected: number, actual: number, indices: boolean) =>
  `The notebook changed since rev ${expected} (it is now at rev ${actual}) — the user edited it meanwhile. Call get_scratchpad again${indices ? " for fresh task indices" : ", reapply your change onto the fresh content"}, then retry.`;

const CONCURRENT_EDIT =
  "The notebook is being edited right now; call get_scratchpad again and retry.";

async function executeScratchpadTool(
  toolName: string,
  args: Record<string, unknown>,
  ctx: ToolContext
): Promise<ToolExecution> {
  const db = ctx.service;

  if (toolName === "get_scratchpad") {
    const state = await getScratchpad(db, ctx.userId);
    return {
      result: {
        content: state.content,
        updated_at: state.updated_at,
        rev: state.rev,
        progress: state.progress,
        tasks: scratchpadTaskList(state.content),
        sections: scratchpadSections(state.content),
      },
      success: true,
    };
  }

  if (toolName === "add_scratchpad_tasks") {
    const raw = Array.isArray(args.tasks) ? args.tasks : null;
    if (!raw || raw.length === 0 || raw.length > 50) {
      return toolError("tasks must be a list of 1 to 50 tasks.");
    }
    const tasks: NewTask[] = [];
    for (const item of raw) {
      const row = item as Record<string, unknown>;
      const text = typeof row.text === "string" ? row.text.trim() : "";
      if (!text) return toolError("Every task needs a non-empty text.");
      const state = row.state;
      if (state !== undefined && !isPlanTaskState(state)) {
        return toolError(
          `Invalid task state "${String(state)}" — use pending, in_progress, completed or cancelled.`
        );
      }
      tasks.push({
        text: text.slice(0, 2000),
        state: isPlanTaskState(state) ? state : "pending",
      });
    }
    const section =
      typeof args.section === "string" && args.section.trim()
        ? args.section.trim()
        : undefined;

    // Appending is position-independent: mutateScratchpad re-reads and re-appends
    // under CAS on conflict, so the tasks land on top of the user's latest text.
    const result = await mutateScratchpad(db, ctx.userId, (content) =>
      appendScratchpadTasks(content, tasks, section)
    );
    if (result.status === "aborted") {
      const current = await getScratchpad(db, ctx.userId);
      const known = scratchpadSections(current.content);
      return toolError(
        `Section "${section}" was not found. ${known.length > 0 ? `Existing sections: ${known.join(", ")}.` : "The notebook has no sections yet."} Omit "section" to add at the end, or create the heading with set_scratchpad first.`
      );
    }
    if (result.status === "conflict") return toolError(CONCURRENT_EDIT);
    return {
      result: {
        added: tasks.length,
        rev: result.state.rev,
        progress: result.state.progress,
        tasks: scratchpadTaskList(result.state.content),
      },
      success: true,
    };
  }

  if (toolName === "update_scratchpad_tasks") {
    const raw = Array.isArray(args.tasks) ? args.tasks : null;
    if (!raw || raw.length === 0 || raw.length > 50) {
      return toolError("tasks must be a list of 1 to 50 task-state changes.");
    }
    const changes: { index: number; state: PlanTaskState }[] = [];
    for (const item of raw) {
      const row = item as Record<string, unknown>;
      const index = row.task_index;
      if (typeof index !== "number" || !Number.isInteger(index) || index < 0) {
        return toolError("task_index must be a non-negative integer.");
      }
      const state = row.state;
      if (!isPlanTaskState(state)) {
        return toolError(
          `Invalid task state "${String(state)}" — use pending, in_progress, completed or cancelled.`
        );
      }
      changes.push({ index, state });
    }

    const expectedRev = parseExpectedRev(args.expected_rev);
    const current = await getScratchpad(db, ctx.userId);
    // Stale indices point at other tasks — refuse rather than flip the wrong one.
    if (expectedRev !== null && current.rev !== expectedRev) {
      return toolError(STALE_REV(expectedRev, current.rev, true));
    }
    const parsed = parsePlan(current.content);
    for (const change of changes) {
      if (change.index >= parsed.tasks.length) {
        return toolError(
          `task_index ${change.index} is out of range — the notebook has ${parsed.tasks.length} task(s)${parsed.tasks.length > 0 ? ` (valid indices 0..${parsed.tasks.length - 1})` : ""}.`
        );
      }
    }
    let next = current.content;
    for (const change of changes) {
      next = setTaskState(next, parsed.tasks[change.index].line, change.state);
    }
    const saved = await setScratchpad(db, ctx.userId, next, current.rev);
    if (saved.conflicted) return toolError(CONCURRENT_EDIT);
    return {
      result: {
        updated: changes.length,
        rev: saved.rev,
        progress: saved.progress,
        tasks: scratchpadTaskList(saved.content),
      },
      success: true,
    };
  }

  // set_scratchpad — full rewrite of the notebook.
  const content = typeof args.content === "string" ? args.content : null;
  if (content === null) {
    return toolError(
      "content must be a string — the FULL new notebook markdown (call get_scratchpad first and keep what you are not changing)."
    );
  }
  if (content.length > MAX_SCRATCHPAD_LENGTH) {
    return toolError(
      `The notebook is capped at ${MAX_SCRATCHPAD_LENGTH} characters.`
    );
  }
  const expectedRev = parseExpectedRev(args.expected_rev);
  if (expectedRev !== null) {
    const write = await setScratchpad(db, ctx.userId, content, expectedRev);
    if (write.conflicted) {
      return toolError(STALE_REV(expectedRev, write.rev, false));
    }
    return {
      result: {
        rev: write.rev,
        progress: write.progress,
        tasks: scratchpadTaskList(write.content),
      },
      success: true,
    };
  }
  const result = await mutateScratchpad(db, ctx.userId, () => content);
  if (result.status !== "ok") return toolError(CONCURRENT_EDIT);
  return {
    result: {
      rev: result.state.rev,
      progress: result.state.progress,
      tasks: scratchpadTaskList(result.state.content),
    },
    success: true,
  };
}
