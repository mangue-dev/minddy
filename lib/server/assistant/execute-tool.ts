import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getProjectAccess, type ProjectAccess } from "@/lib/server/project-access";
import { createIssueForProject } from "@/lib/server/create-issue";
import {
  MAX_DESCRIPTION_LENGTH,
  updateIssueFields,
} from "@/lib/server/update-issue";
import { editIssueText, type IssueTextTools } from "@/lib/server/text-edit";
import {
  appendToPageForAgent,
  createPageForAgent,
  editPageTextForAgent,
  listPagesForAgent,
  readPageForAgent,
  searchPagesForAgent,
  updatePageForAgent,
  type PageToolResult,
} from "@/lib/server/page-tools";

/** Les noms que Numo porte, pour que les refus du patch renvoient vers des tools
 *  qui existent DANS LE CHAT (cf. IssueTextTools). */
const NUMO_TEXT_TOOLS: IssueTextTools = {
  read: "get_issue",
  appendToPlan: "append_to_plan",
  replaceWhole: {
    plan: "update_issues { fields: { plan } }",
    description: "update_issues { fields: { description } }",
  },
};
import {
  addCommentToFeedbackPost,
  addCommentToIssue,
} from "@/lib/server/add-comment";
import { setIssueCategories } from "@/lib/server/set-issue-categories";
import { getServiceClient } from "@/lib/supabase-service";
import { insertAttachments } from "@/lib/server/attachments";
import { FaviconError } from "@/lib/server/favicon";
import { resolveLinkResource } from "@/lib/server/link-resource";
import {
  addIssueRelation,
  findIssueRelation,
  removeIssueRelation,
} from "@/lib/server/issue-relations";
import { RELATION_TYPE_VALUES, isRelationType } from "@/lib/relation-validation";
import { createView, updateView } from "@/lib/server/views";
import { createObjective, updateObjective } from "@/lib/server/objectives";
import { createCategory, updateCategory } from "@/lib/server/categories";
import { updateProjectSettings } from "@/lib/server/update-project";
import {
  createRoutine,
  listRoutinesForUser,
  updateRoutine,
} from "@/lib/server/routines";
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
import { normalizeWebhookStatus } from "@/lib/server/webhooks";
import {
  integrationUsage,
  integrationWebhookDoc,
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
import { resourceSummary } from "@/lib/server/resource-select";
import {
  isTrashType,
  listTrash,
  restoreItem,
  softDeleteItem,
  TRASH_RETENTION_DAYS,
  TRASH_TYPES,
} from "@/lib/server/trash";
import { getProjectFeedbackPost } from "@/lib/server/feedback/team-guard";
import { listTeamFeedback, getTeamFeedbackDetail } from "@/lib/server/feedback/team-queries";
import { isFeedbackPostStatus } from "@/lib/feedback/types";
import { fetchAuthUsersById, toNamed } from "@/lib/server/auth-users";
import { displayName } from "@/lib/display-name";
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
import { isReasoningLevel } from "@/lib/agent-reasoning";
import { resolveRepoCloneTarget } from "@/lib/server/agent/repo-access";
import { forgeFor } from "@/lib/server/agent/forge";
import {
  linkPullRequestToIssue,
  resolveProjectPullRequest,
  type PrLinkRefusal,
} from "@/lib/server/agent/pr-link";
import { findPullRequestForIssue } from "@/lib/server/agent/pull-requests";
import { groupReviewThreads } from "@/lib/pr-review-threads";
import {
  runWebSearchTool,
  MAX_WEB_SEARCHES_PER_TURN,
  WEB_SEARCH_SEQ_BASE,
} from "@/lib/server/web-search";
import { proposeBacklogFromBrief } from "@/lib/server/brief-to-issues";
import { MIN_BRIEF_CHARS } from "@/lib/seed/types";

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
  /**
   * Ce que le MODÈLE relit, quand ce n'est pas ce que l'écran montre. Une
   * proposition d'amorce (MIN-173) fait quarante titres avec leurs
   * descriptions : le fil doit les afficher, le modèle vient de les écrire et
   * n'a plus rien à en faire. `result` part alors au navigateur et sur la
   * métadonnée du message, `modelResult` dans l'historique de la conversation.
   */
  modelResult?: unknown;
  /**
   * Les IDENTIFIANTS VIVANTS que `result` porte — une clé `mdy_` fraîchement
   * créée, le secret SSO d'un board (MIN-343).
   *
   * Ils partent au navigateur avec le résultat, en direct, et ne vont NULLE PART
   * ailleurs : la boucle les substitue avant d'écrire `assistant_messages` et
   * avant de rendre la main au modèle. Un secret laissé dans l'historique serait
   * rejoué au fournisseur à chaque tour, relisible en base, et repartirait dans
   * l'export de compte — trois fuites pour une valeur qui ne sert qu'une fois,
   * sous les yeux de son propriétaire.
   *
   * Corollaire assumé : le modèle ne voit jamais la valeur, donc ne peut pas la
   * recopier dans sa réponse. C'est l'écran qui la montre (`SecretCallout`), et
   * le prompt le lui dit.
   */
  secrets?: string[];
  /**
   * Le tour s'arrête ici : la main passe à l'utilisateur, comme sur `ask_user`.
   * Ce que la boucle enchaînerait ne servirait à rien tant qu'il n'a pas
   * répondu à ce que ce résultat lui met sous les yeux.
   */
  pause?: boolean;
}

function toolError(message: string): ToolExecution {
  return { result: { error: message }, success: false };
}

/** Map a lib/server/* failure into a readable tool error. */
function libError(r: { errorKey?: string; rawMessage?: string }): ToolExecution {
  return toolError(r.rawMessage ?? r.errorKey ?? "Request failed");
}

/** Refus de rattachement d'une PR, dits à Numo pour qu'il les relaie tels quels
    plutôt que d'inventer une raison. */
const PR_LINK_REFUSALS: Record<PrLinkRefusal, string> = {
  pr_already_linked:
    "This pull request is already attached to another issue. The link is definitive: it cannot be replaced, and there is no unlink.",
  issue_already_linked:
    "This issue already carries a live (draft or open) pull request. Only ONE live pull request per issue.",
  issue_outside_repo:
    "This issue belongs to a project that does not link the repository of that pull request.",
};

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
    case "modelAbovePlan":
      // Numo relaie ce refus tel quel : c'est lui qui a pu forcer le modèle, et
      // il doit pouvoir en proposer un autre sans que l'utilisateur devine.
      return r.modelLimit
        ? `The model ${r.modelLimit.model} costs ×${r.modelLimit.multiplier} the usage of minddy's default model, above the ×${r.modelLimit.limit} ceiling of the ${r.modelLimit.planId} plan. Call list_agent_models to pick a model within the ceiling, or the user can upgrade their plan.`
        : "That model is above the usage ceiling of the user's plan. Call list_agent_models to pick a cheaper one.";
    default:
      return "Could not launch the code agent.";
  }
}

/**
 * Refus d'une écriture de routine (MIN-185), dits à Numo pour qu'il les relaie
 * plutôt que d'inventer une raison — ou pire, de chercher un contournement.
 * `ownerOnly` en particulier : c'est une règle, pas un obstacle technique.
 */
function routineErrorMessage(r: {
  errorKey: string;
  modelLimit?: { model: string; multiplier: number; limit: number; planId: string };
}): string {
  switch (r.errorKey) {
    case "ownerOnly":
      return "Only the project's OWNER can create or change a routine — it is their usage budget that runs every time. Tell the user plainly; there is no way around it, do not retry and do not offer one.";
    case "projectNotFound":
      return "Project not found or not accessible.";
    case "routineNotFound":
      return "No routine with that id. Call list_routines.";
    case "noRepo":
      return "This project has no linked repository, so a routine would have nothing to clone. Link one in the project's Git settings first.";
    case "promptRequired":
      return "prompt is required: it IS the instruction the agent gets at every run.";
    case "unknownTimezone":
      return "That timezone is not a valid IANA name. Pass the user's timezone exactly as it appears in your context (e.g. 'Europe/Paris'), never a guess and never an abbreviation.";
    case "invalidSchedule":
      return "The cadence does not hold together: 'weekly' needs at least one weekday in `weekdays` (0=Sunday…6=Saturday) and no days_of_month; 'monthly' needs at least one day in `days_of_month` (1–31) and no weekdays; hour is 0–23 and minute 0–59.";
    case "modelAbovePlan":
      return r.modelLimit
        ? `The model ${r.modelLimit.model} costs ×${r.modelLimit.multiplier} the usage of minddy's default model, above the ×${r.modelLimit.limit} ceiling of the ${r.modelLimit.planId} plan. Call list_agent_models to pick one within the ceiling.`
        : "That model is above the usage ceiling of the user's plan. Call list_agent_models to pick a cheaper one.";
    case "noFieldsToUpdate":
      return "Nothing to change — pass at least one field.";
    default:
      return "Could not save the routine.";
  }
}

/** Les jours d'une cadence, tels qu'un modèle les envoie (souvent en vrac). */
function numberList(value: unknown): number[] {
  return Array.isArray(value)
    ? value.filter((v): v is number => typeof v === "number" && Number.isFinite(v))
    : [];
}

/** Une routine, telle que Numo la relit et la rapporte — cadence en clair. */
function routineForTool(routine: {
  id: string;
  title: string;
  prompt: string;
  model: string | null;
  max_spend_percent: number;
  frequency: string;
  hour: number;
  minute: number;
  weekdays: number[];
  days_of_month: number[];
  timezone: string;
  enabled: boolean;
  next_run_at: string | null;
  last_run_at: string | null;
  last_error: string | null;
}) {
  return {
    id: routine.id,
    title: routine.title,
    prompt: routine.prompt,
    model: routine.model,
    /** Ce qu'UN passage peut dépenser, en % du budget mensuel du propriétaire. */
    max_spend_percent: routine.max_spend_percent,
    frequency: routine.frequency,
    hour: routine.hour,
    minute: routine.minute,
    weekdays: routine.weekdays,
    days_of_month: routine.days_of_month,
    timezone: routine.timezone,
    enabled: routine.enabled,
    next_run_at: routine.next_run_at,
    last_run_at: routine.last_run_at,
    last_error: routine.last_error,
  };
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
  alreadyOwner: "That person is the project owner.",
  alreadyMember: "That person is already a member of the project.",
  invitationAlreadyPending: "There is already a pending invitation for that email.",
  memberLimitReached:
    "This project has reached the number of guests the owner's plan allows (members plus pending invitations). Relay that as-is.",
  cannotRemoveOwner: "The project owner cannot be removed.",
  invalidColor: "That color is invalid (use a hex color like #7c5cff).",
  categoryNotFound: "Category not found in this project.",
  integrationNameRequired: "An integration name is required.",
  integrationNotFound: "Integration not found.",
  boardNotFound:
    "This project has no feedback board yet — pass enabled: true to create it.",
  webhookInvalidUrl:
    "The webhook URL is invalid: it must be an http(s) URL, and it must point " +
    "at a publicly reachable host (localhost and private addresses are refused).",
  webhookHumanOnly:
    "Choosing where a webhook delivers is the owner's own gesture: it is done " +
    "in Settings → Integrations, not by an assistant. Relay that as-is. You " +
    "can still turn the webhook off, or change the events and scope of the " +
    "destination already in place.",
  webhookInvalidConfig: "The webhook events or scope are invalid.",
  smartAssignNotAllowed:
    "Smart Assign is not included in the owner's plan, so it cannot be turned on. Relay that as-is.",
  automationsNotAllowed:
    "Automations are not included in the owner's plan, so the loop cannot be armed on this project. Relay that as-is.",
  webhookIssuesOnly:
    "That is a 'feedback' key: it creates no issue, so it has no webhook. Only an 'issues' key can have one.",
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

// ── Issue text (append_to_plan / update_plan_tasks / edit_issue_text) ──
// All three are surgical by construction: they read the text that is stored
// RIGHT NOW and give back that same markdown with something added, one marker
// flipped, or one passage rewritten. Nothing the model didn't touch can be lost
// on the way — which a full `update_issues { plan }` rewrite cannot promise.

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

/** The issue's plan and description as stored ("" when it has none). */
async function readIssueText(
  ctx: ToolContext,
  issueId: string
): Promise<{ plan: string; description: string } | { error: string }> {
  const { data, error } = await ctx.supabase
    .from("issues")
    .select("plan, description")
    .is("deleted_at", null)
    .eq("id", issueId)
    .maybeSingle();
  if (error) return { error: error.message };
  return {
    plan: typeof data?.plan === "string" ? data.plan : "",
    description: typeof data?.description === "string" ? data.description : "",
  };
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
    ctx.supabase.from("objectives").select("id, name").is("deleted_at", null),
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
  if (!turn) {
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
    userId: ctx.userId,
    surface: "assistant",
    runId: turn.runId,
    seq,
    billTo: { userId: ctx.userId },
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

    // ── Corbeille (MIN-133 — personnelle et inter-projets) ──────────────
    if (
      toolName === "list_trash" ||
      toolName === "move_to_trash" ||
      toolName === "restore_from_trash"
    ) {
      return executeTrashTool(toolName, args, ctx);
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
        // Les RESSOURCES viennent avec, et c'est ce que la description du tool
        // promet depuis toujours — elle le promettait sans que rien ne les
        // envoie (MIN-275). Un objectif qui porte la page de sa spec le disait
        // donc dans l'app et nulle part pour Numo, qui repartait recoller un
        // lien markdown dans une description.
        //
        // Lu au client de SESSION, donc sous `pages_select` : une page
        // corbeillée redescend `page: null`, et la pilule reste inerte sans
        // qu'on ait à s'occuper de la corbeille (lib/server/resource-select.ts).
        const [{ data, error }, { data: attachmentRows }] = await Promise.all([
          ctx.supabase
            .from("objectives")
            .select("id, name, status, lead_user_id, target_date")
            .is("deleted_at", null)
            .eq("project_id", projectId)
            .order("created_at", { ascending: true }),
          ctx.supabase
            .from("attachments")
            .select(
              "id, objective_id, kind, url, page_id, file_name, mime_type, size_bytes, page:pages(id, title)"
            )
            .eq("project_id", projectId)
            .not("objective_id", "is", null)
            // Une ressource d'objectif se reconnaît à son `comment_id` nul : le
            // fil de discussion en porte aussi, et elles n'appartiennent pas à
            // l'objectif mais au message.
            .is("comment_id", null)
            .order("created_at", { ascending: true }),
        ]);
        if (error) return toolError(error.message);

        const resourcesByObjective = new Map<string, Record<string, unknown>[]>();
        for (const row of attachmentRows ?? []) {
          const id = row.objective_id as string;
          const list = resourcesByObjective.get(id) ?? [];
          list.push(resourceSummary(row));
          resourcesByObjective.set(id, list);
        }

        return {
          result: {
            objectives: (data ?? []).map((objective) => {
              const resources = resourcesByObjective.get(objective.id as string);
              return resources ? { ...objective, resources } : objective;
            }),
          },
          success: true,
        };
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
          // Une seule chaîne littérale : `select` type ses colonnes en LISANT
          // ce texte, et une concaténation lui rend le résultat opaque.
          .select(
            "id, name, kind, revoked_at, webhook_url, webhook_events, webhook_scope, webhook_last_status, webhook_last_at"
          )
          .eq("project_id", projectId)
          .order("name", { ascending: true });
        if (error) return toolError(error.message);
        return {
          result: {
            integrations: (data ?? []).map((row) => ({
              id: row.id,
              name: row.name,
              kind: row.kind,
              revoked_at: row.revoked_at,
              // Sans URL il n'y a pas de webhook : `null` plutôt qu'un objet à
              // moitié rempli, qui ferait croire à un webhook éteint mais réglé.
              webhook: row.webhook_url
                ? {
                    url: row.webhook_url,
                    events: row.webhook_events,
                    scope: row.webhook_scope,
                    last_status: normalizeWebhookStatus(row.webhook_last_status),
                    last_at: row.webhook_last_at,
                  }
                : null,
            })),
          },
          success: true,
        };
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

      // L'amorce d'un projet, par la conversation (MIN-173). Aucune fabrique de
      // plus : c'est la passe du brief collé (MIN-172), appelée avec ce que
      // Numo a établi avec l'utilisateur au lieu d'un texte collé. Elle N'ÉCRIT
      // RIEN — ce qui s'écrit est ce que l'aperçu du fil aura fait valider, par
      // `/api/projects/[id]/brief/apply`, exactement comme depuis le board.
      case "propose_backlog": {
        // Réservée au propriétaire, comme la modale : c'est lui qui paye
        // l'appel, et c'est un lot de tickets d'un coup dans SON projet.
        if (!access.isOwner) {
          return toolError(
            "Only the project owner can seed the backlog of this project."
          );
        }
        const brief = typeof args.brief === "string" ? args.brief.trim() : "";
        if (brief.length < MIN_BRIEF_CHARS) {
          return toolError(
            "The brief is too short to cut up. Frame the project with the user first, then send back everything the conversation established."
          );
        }
        const proposal = await proposeBacklogFromBrief({
          brief,
          projectName: access.project.name,
          userId: ctx.userId,
          projectId,
        });
        if (!proposal) {
          return toolError(
            "The pass returned nothing usable. Tell the user, and offer to try again."
          );
        }
        const counts = {
          objectives: proposal.objectives.length,
          issues: proposal.issues.length,
        };
        return {
          // `proposal` ne sert qu'à l'écran : c'est lui que la carte du fil
          // affiche, décoche et envoie à l'écriture.
          result: { status: "awaiting_user_review", project_id: projectId, ...counts, proposal },
          modelResult: {
            status: "awaiting_user_review",
            ...counts,
            note: "The proposal is now on the user's screen, where they uncheck, rename and create the issues themselves — your turn ended on this call. NOTHING exists yet: do not create, edit or comment on any of these issues, and do not list them back. Wait for the user to tell you what they created. What they create lands in the BACKLOG (not in triage): the whole point of the on-screen review is that it replaces the triage gate.",
          },
          success: true,
          pause: true,
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

      // ── Pages : le wiki du projet (MIN-273) ─────────────────────────
      //
      // Le même noyau que le MCP et l'agent de code (lib/server/page-tools.ts) :
      // ce bloc ne fait que traduire les arguments de Numo et rendre ses refus.
      case "create_page":
        return executeCreatePage(args, ctx, projectId);
      case "list_pages":
      case "search_pages":
      case "get_page":
      case "update_page":
      case "append_to_page":
      case "edit_page_text":
        return executePageTool(toolName, args, ctx, projectId);

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
        const current = await readIssueText(ctx, issueId);
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
        const current = await readIssueText(ctx, issueId);
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

      case "edit_issue_text": {
        const issueId = typeof args.issue_id === "string" ? args.issue_id : "";
        const scoped = await assertIssueInProject(ctx.supabase, issueId, projectId);
        if (!scoped.ok) return toolError(scoped.error);
        const field = args.field === "description" ? "description" : "plan";
        if (args.field !== "plan" && args.field !== "description") {
          return toolError('field must be "plan" or "description".');
        }
        const current = await readIssueText(ctx, issueId);
        if ("error" in current) return toolError(current.error);

        const edit = editIssueText({
          field,
          current: current[field],
          oldString: typeof args.old_string === "string" ? args.old_string : "",
          newString: typeof args.new_string === "string" ? args.new_string : "",
          replaceAll: args.replace_all === true,
          tools: NUMO_TEXT_TOOLS,
        });
        if (!edit.ok) return toolError(edit.message);

        // Un plan patché repart par writePlan : même écriture, mêmes tâches
        // rendues, donc les index restent utilisables juste après.
        if (field === "plan") {
          if (edit.content.length > MAX_PLAN_LENGTH) {
            return toolError(`The plan is capped at ${MAX_PLAN_LENGTH} characters.`);
          }
          return writePlan(ctx, issueId, edit.content);
        }
        if (edit.content.length > MAX_DESCRIPTION_LENGTH) {
          return toolError(
            `The description is capped at ${MAX_DESCRIPTION_LENGTH} characters.`
          );
        }
        const result = await updateIssueFields({
          issueId,
          actorId: ctx.userId,
          input: { description: edit.content },
          viaAssistant: true,
        });
        if (!result.ok) return libError(result);
        return {
          result: {
            field,
            additions: edit.additions,
            deletions: edit.deletions,
            length: edit.content.length,
          },
          success: true,
        };
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

      // Relations entre tickets (MIN-25) — même cœur que les routes HTTP et le
      // tool MCP. Les DEUX bouts sont vérifiés dans le projet de la
      // conversation : le cœur contrôle l'accès au projet, pas le fait que la
      // cible en soit (une relation inter-projets n'existe pas).
      case "link_issues": {
        const issueId = typeof args.issue_id === "string" ? args.issue_id : "";
        const targetId =
          typeof args.target_issue_id === "string" ? args.target_issue_id : "";
        const relation = isRelationType(args.relation) ? args.relation : null;
        if (!relation) {
          return toolError(
            `relation must be one of: ${RELATION_TYPE_VALUES.join(", ")}.`
          );
        }
        if (issueId === targetId) {
          return toolError("An issue cannot be related to itself.");
        }
        for (const id of [issueId, targetId]) {
          const scoped = await assertIssueInProject(ctx.supabase, id, projectId);
          if (!scoped.ok) return toolError(scoped.error);
        }

        if (args.remove === true) {
          const existing = await findIssueRelation(projectId, issueId, relation, targetId);
          // Idempotent, comme le tool MCP : retirer ce qui n'est pas là n'est
          // pas une erreur, c'est déjà l'état demandé.
          if (!existing) {
            return { result: { removed: false, relation }, success: true };
          }
          const removed = await removeIssueRelation({
            relationId: existing.id,
            actorId: ctx.userId,
            viaAssistant: true,
          });
          if (!removed.ok) return libError(removed);
          return { result: { removed: true, relation }, success: true };
        }

        const added = await addIssueRelation({
          projectId,
          actorId: ctx.userId,
          sourceId: issueId,
          targetId,
          type: relation,
          viaAssistant: true,
        });
        if (!added.ok) return libError(added);
        return { result: { added: true, relation }, success: true };
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

      /**
       * Numo n'a pas de fichier à envoyer : sa moitié de la ressource, c'est le
       * LIEN. La cible est un ticket OU un objectif, jamais les deux — un
       * `insertAttachments` avec deux parents violerait attachments_parent_ck.
       */
      case "add_resource": {
        const url = typeof args.url === "string" ? args.url.trim() : "";
        const pageId = typeof args.page_id === "string" ? args.page_id.trim() : "";
        if (!!url === !!pageId) {
          return toolError(
            url
              ? "A resource is a link OR a page: send url, or page_id, not both."
              : "Nothing to attach: send url for a link, or page_id for a page " +
                  "of the wiki (list_pages)."
          );
        }
        const issueId = typeof args.issue_id === "string" ? args.issue_id : "";
        const objectiveId =
          typeof args.objective_id === "string" ? args.objective_id : "";
        if (!!issueId === !!objectiveId) {
          return toolError(
            "Pass issue_id OR objective_id — a resource hangs from one parent."
          );
        }

        if (issueId) {
          const scoped = await assertIssueInProject(ctx.supabase, issueId, projectId);
          if (!scoped.ok) return toolError(scoped.error);
        } else {
          const { data: objective } = await ctx.supabase
            .from("objectives")
            .select("id")
            .is("deleted_at", null)
            .eq("id", objectiveId)
            .eq("project_id", projectId)
            .maybeSingle();
          if (!objective) {
            return toolError("Objective not found in this project.");
          }
        }

        let resource;
        if (pageId) {
          // Le titre est relu ici, pas demandé au modèle : c'est la seule source
          // qui ne puisse pas se tromper de page.
          const { data: page } = await ctx.supabase
            .from("pages")
            .select("id, title")
            .eq("id", pageId)
            .eq("project_id", projectId)
            .is("deleted_at", null)
            .maybeSingle();
          if (!page) return toolError("Page not found in this project.");
          resource = {
            kind: "page" as const,
            page_id: pageId,
            file_name: ((page.title as string) ?? "").trim() || "Page",
          };
        } else {
          try {
            resource = await resolveLinkResource(url);
          } catch (e) {
            if (e instanceof FaviconError) {
              return toolError(
                "That url can't be reached — it must be a public http(s) address."
              );
            }
            return toolError((e as Error).message);
          }
        }

        try {
          const [row] = await insertAttachments(getServiceClient(), {
            projectId,
            issueId: issueId || null,
            objectiveId: objectiveId || null,
            commentId: null,
            createdBy: ctx.userId,
            resources: [resource],
          });
          return {
            result: {
              resource: pageId
                ? {
                    id: row.id,
                    kind: "page",
                    page_id: row.page_id,
                    title: row.file_name,
                  }
                : {
                    id: row.id,
                    kind: "link",
                    url: row.url,
                    title: row.file_name,
                  },
            },
            success: true,
          };
        } catch (e) {
          return toolError((e as Error).message);
        }
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
            .is("deleted_at", null)
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
          // Omis = le défaut du compte s'applique (resolveReasoningLevel).
          ...(isReasoningLevel(args.reasoning_level)
            ? { reasoningLevel: args.reasoning_level }
            : {}),
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
            reasoning_level: result.run.reasoning_level,
          },
          success: true,
        };
      }

      // ── Routines (MIN-185) ──────────────────────────────────────────
      case "create_routine": {
        const result = await createRoutine({
          projectId,
          actorId: ctx.userId,
          prompt: typeof args.prompt === "string" ? args.prompt : "",
          model: typeof args.model === "string" ? args.model : null,
          reasoningLevel:
            typeof args.reasoning_level === "string" ? args.reasoning_level : null,
          baseBranch: typeof args.base_branch === "string" ? args.base_branch : null,
          maxSpendPercent:
            typeof args.max_spend_percent === "number" ? args.max_spend_percent : null,
          frequency: typeof args.frequency === "string" ? args.frequency : "",
          hour: typeof args.hour === "number" ? args.hour : 9,
          minute: typeof args.minute === "number" ? args.minute : 0,
          weekdays: numberList(args.weekdays),
          daysOfMonth: numberList(args.days_of_month),
          // Le fuseau du navigateur est dans le contexte de Numo : s'il ne
          // l'a pas passé, on refuse plutôt que de partir en UTC.
          timezone: typeof args.timezone === "string" ? args.timezone : "",
        });
        if (!result.ok) return toolError(routineErrorMessage(result));
        return { result: { routine: routineForTool(result.routine) }, success: true };
      }

      case "list_routines": {
        const rows = (await listRoutinesForUser(ctx.userId)).filter(
          (r) => r.project_id === projectId,
        );
        return { result: { routines: rows.map(routineForTool) }, success: true };
      }

      case "update_routine": {
        const routineId = typeof args.routine_id === "string" ? args.routine_id : "";
        if (!routineId) return toolError("routine_id is required (see list_routines).");
        const result = await updateRoutine({
          routineId,
          actorId: ctx.userId,
          ...(typeof args.prompt === "string" ? { prompt: args.prompt } : {}),
          ...(typeof args.enabled === "boolean" ? { enabled: args.enabled } : {}),
          ...("model" in args ? { model: typeof args.model === "string" ? args.model : null } : {}),
          ...(typeof args.reasoning_level === "string"
            ? { reasoningLevel: args.reasoning_level }
            : {}),
          ...(typeof args.base_branch === "string" ? { baseBranch: args.base_branch } : {}),
          ...(typeof args.max_spend_percent === "number"
            ? { maxSpendPercent: args.max_spend_percent }
            : {}),
          ...(typeof args.frequency === "string" ? { frequency: args.frequency } : {}),
          ...(typeof args.hour === "number" ? { hour: args.hour } : {}),
          ...(typeof args.minute === "number" ? { minute: args.minute } : {}),
          ...(Array.isArray(args.weekdays) ? { weekdays: numberList(args.weekdays) } : {}),
          ...(Array.isArray(args.days_of_month)
            ? { daysOfMonth: numberList(args.days_of_month) }
            : {}),
          ...(typeof args.timezone === "string" ? { timezone: args.timezone } : {}),
        });
        if (!result.ok) return toolError(routineErrorMessage(result));
        return { result: { routine: routineForTool(result.routine) }, success: true };
      }

      case "read_pull_request": {
        const issueId = typeof args.issue_id === "string" ? args.issue_id : "";
        const scoped = await assertIssueInProject(ctx.supabase, issueId, projectId);
        if (!scoped.ok) return toolError(scoped.error);

        // La PR du ticket vient de `pull_requests`, source de vérité depuis
        // MIN-143 : une PR humaine, ou rattachée par convention (identifiant
        // dans la branche, « Fixes KEY-42 »), ou rattachée après coup par
        // link_pull_request, n'a AUCUN run — la chercher dans `agent_runs`
        // faisait échouer l'outil sur une PR que l'utilisateur avait sous les
        // yeux. Le repli sur le run couvre les lignes d'avant la table.
        const linkedPr = await findPullRequestForIssue(issueId);
        let prNumber = linkedPr?.number ?? null;
        if (prNumber == null) {
          // Repli aligné sur findPullRequestForIssue : la PR VIVANTE d'abord,
          // sinon la plus récente. Un ticket d'avant la table peut porter
          // plusieurs runs à PR (reprises successives) — prendre la plus
          // ancienne ferait lire une PR fermée depuis des semaines pendant
          // qu'une autre est ouverte.
          const { data: runs } = await ctx.supabase
            .from("agent_runs")
            .select("pr_number, pr_state")
            .eq("issue_id", issueId)
            .not("pr_number", "is", null)
            .order("created_at", { ascending: false });
          const rows = (runs ?? []) as { pr_number: number; pr_state: string | null }[];
          const live = rows.find(
            (r) => r.pr_state === "draft" || r.pr_state === "open"
          );
          prNumber = (live ?? rows[0])?.pr_number ?? null;
        }
        if (prNumber == null) {
          return toolError("This issue has no pull request attached yet.");
        }

        const target = await resolveRepoCloneTarget(projectId);
        if (!target) return toolError("This project has no linked repository.");
        const forge = forgeFor(target.provider);

        const [pr, diff, reviewComments, reviewThreads] = await Promise.all([
          forge.getPullRequest({ token: target.token, repoFullName: target.repoFullName, number: prNumber }),
          forge.listPullRequestFiles({ token: target.token, repoFullName: target.repoFullName, number: prNumber }),
          forge
            .listPullRequestReviewComments({
              token: target.token,
              repoFullName: target.repoFullName,
              number: prNumber,
            })
            .catch(() => []),
          // Résolution des fils (MIN-139), best-effort comme ci-dessus.
          forge
            .listReviewThreads({
              token: target.token,
              repoFullName: target.repoFullName,
              number: prNumber,
            })
            .catch(() => []),
        ]);

        // Checks CI (MIN-138) : demander des changements sur une CI rouge n'a
        // d'intérêt que si l'agent voit CE qui casse. `null` = illisible
        // (permission de l'App non acceptée, dépôt sans CI) — jamais bloquant,
        // comme les commentaires de review juste au-dessus.
        const checks = pr.headSha
          ? await forge
              .listChecks({
                token: target.token,
                repoFullName: target.repoFullName,
                number: prNumber,
                sha: pr.headSha,
              })
              .catch(() => null)
          : null;

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
            draft: !!pr.draft,
            checks: checks
              ? {
                  state: checks.state,
                  passing: checks.passing,
                  total: checks.total,
                  failing: checks.checks
                    .filter((c) => c.state === "failure")
                    .map((c) => ({ name: c.name, url: c.url })),
                }
              : null,
            files: diff.files.map((f) => ({
              filename: f.filename,
              status: f.status,
              additions: f.additions,
              deletions: f.deletions,
              patch:
                f.patch && f.patch.length > PATCH_CAP
                  ? f.patch.slice(0, PATCH_CAP) + "\n… (diff truncated)"
                  : f.patch ?? null,
            })),
            // La pagination de la forge a coupé la liste : le dire plutôt que de
            // laisser conclure sur ce qui a été vu.
            files_truncated: diff.truncated,
            // Commentaires ancrés au code, regroupés en fils. `line: null` = le
            // code visé a changé depuis : l'ancre ne vaut plus, seul le hunk dit
            // de quoi on parlait.
            review_comments: groupReviewThreads(reviewComments, reviewThreads).map((thread) => ({
              path: thread.root.path,
              line: thread.root.line,
              original_line: thread.root.original_line,
              side: thread.root.side,
              // Première ligne d'une remarque multi-lignes (`line` = la
              // dernière) — sans elle, la plage visée se réduit à un point.
              start_line: thread.root.start_line,
              outdated: thread.root.line == null,
              // Fil marqué résolu = point réglé (`false` couvre aussi l'inconnu).
              resolved: !!thread.resolution?.resolved,
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

      /**
       * Rattacher à la main une PR restée orpheline (MIN-163bis). La règle et
       * ses refus vivent dans `linkPullRequestToIssue`, partagés avec l'app et
       * le MCP ; ici, on ne fait que le garde d'accès et la traduction.
       */
      case "link_pull_request": {
        const issueId = typeof args.issue_id === "string" ? args.issue_id : "";
        const scoped = await assertIssueInProject(ctx.supabase, issueId, projectId);
        if (!scoped.ok) return toolError(scoped.error);

        const found = await resolveProjectPullRequest({
          projectId,
          ref: args.pull_request as string | number | undefined,
          userId: ctx.userId,
        });
        if ("error" in found) {
          return toolError(
            found.error === "invalid_ref"
              ? "pull_request must be a pull request number (42, '#42', '!42') or its URL on the forge."
              : found.error === "no_repository"
                ? "This project has no linked repository."
                : "No pull request with that number in the repository linked to this project."
          );
        }

        const result = await linkPullRequestToIssue({
          pr: found.pr,
          issue: { id: issueId, projectId },
          actorId: ctx.userId,
        });
        if (!result.ok) return toolError(PR_LINK_REFUSALS[result.code]);

        return {
          result: {
            linked: true,
            already: result.already,
            pull_request: {
              number: found.pr.number,
              url: found.pr.url,
              state: found.pr.state,
              title: found.pr.title,
            },
            issue_id: issueId,
            issue_status: result.status,
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
          .is("deleted_at", null)
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
          .is("deleted_at", null)
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
          showCategories:
            typeof args.show_categories === "boolean" ? args.show_categories : undefined,
          showViews: typeof args.show_views === "boolean" ? args.show_views : undefined,
          allowComments:
            typeof args.allow_comments === "boolean" ? args.allow_comments : undefined,
          visibleViewIds: Array.isArray(args.visible_view_ids)
            ? args.visible_view_ids.filter((v): v is string => typeof v === "string")
            : undefined,
          origin: SITE_URL,
        });
        if (!result.ok) return settingsError(result.errorKey);
        return {
          result: {
            board: result.config,
            // Only present when asked for. A credential: the SCREEN surfaces it
            // once (MIN-343) — it never enters the conversation history.
            ...(result.sso_secret ? { sso_secret: result.sso_secret } : {}),
          },
          secrets: result.sso_secret ? [result.sso_secret] : undefined,
          success: true,
        };
      }

      case "list_feedback": {
        // Filtre côté requête, pas sur la fenêtre de 500 renvoyée : celle-ci
        // est ordonnée par votes, donc un statut qui n'en récolte pas (spam,
        // declined) tombe hors plafond et la liste revenait vide à tort.
        const statuses = Array.isArray(args.status)
          ? args.status.filter(isFeedbackPostStatus)
          : undefined;
        const posts = await listTeamFeedback(projectId, { statuses });
        const limit =
          typeof args.limit === "number" ? Math.min(Math.max(1, args.limit), 200) : 50;
        const rows = posts
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
          .select(
            "author_id, via_assistant, body, created_at, visibility, feedback_users!feedback_user_id (name, email, pseudonym)"
          )
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
              comments: (comments ?? []).map((c) => {
                // Un commentaire public écrit par un VISITEUR du board : Numo
                // travaille pour l'équipe, il le voit donc nommé, comme elle.
                const visitor = c.feedback_users as unknown as {
                  name: string | null;
                  email: string | null;
                  pseudonym: string;
                } | null;
                return {
                  author: visitor
                    ? visitor.name?.trim() || visitor.email?.trim() || visitor.pseudonym
                    : c.via_assistant
                      ? "Numo"
                      : displayName(
                          toNamed(
                            c.author_id ? commentUsers.get(c.author_id as string) : null
                          ),
                          "User"
                        ),
                  visibility: (c.visibility as string) ?? "internal",
                  body: c.body,
                  created_at: c.created_at,
                };
              }),
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
        // La réponse d'équipe est un commentaire PUBLIC du fil du retour
        // (MIN-196), plus un champ du retour. Signée « Équipe <projet> » sur le
        // board — jamais du nom de qui l'a écrite, Numo compris.
        const result = await addCommentToFeedbackPost({
          postId,
          actorId: ctx.userId,
          body: args.response,
          visibility: "public",
          viaAssistant: true,
        });
        if (!result.ok) return toolError(result.errorKey ?? "databaseError");
        return {
          result: { feedback_post_id: postId, comment: result.comment },
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
              auto_assign_enabled: result.project.auto_assign_enabled,
              smart_assign_enabled: result.project.smart_assign_enabled,
              smart_assign_rules: result.project.smart_assign_rules,
              automations_enabled: result.project.automations_enabled,
              feedback_review_enabled: result.project.feedback_review_enabled,
              feedback_review_skip_over_budget:
                result.project.feedback_review_skip_over_budget,
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
          locale: ctx.locale === "fr" ? "fr" : "en",
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
            // The plaintext key is returned ONCE, to the SCREEN (MIN-343): the
            // browser gets it live, the history never does.
            key: result.key,
            // …and a key is useless without the format that goes with it.
            usage: integrationUsage(kind, SITE_URL),
          },
          secrets: [result.key],
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
          actor: "agent",
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
            // Le récepteur reste à écrire, et rien de son contrat ne se devine
            // (la clé du HMAC n'est pas la clé d'API). Éteindre le webhook, en
            // revanche, ne demande plus rien : pas de contrat à relayer.
            ...(result.integration.webhook_url
              ? { contract: integrationWebhookDoc() }
              : {}),
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

// ── Corbeille (MIN-133) ────────────────────────────────────────────────
// Les trois outils délèguent à lib/server/trash.ts, qui porte SES contrôles
// d'accès (client service, RLS contournée) : un membre du projet supprime et
// restaure son contenu, un projet ne répond qu'à son propriétaire. Rien à
// vérifier ici, donc — comme les routes de /api/me/trash.
//
// La purge définitive n'est délibérément PAS exposée : elle ne se rattrape pas,
// et le balayage nocturne la fait de toute façon au bout des 30 jours. Ce que
// Numo peut faire reste réversible.

/** Message lisible pour Numo — les cœurs rendent des clés i18n, pas des phrases. */
const TRASH_ERROR_MESSAGES: Record<string, string> = {
  issueNotFound: "Issue not found, or not in a project you can access.",
  objectiveNotFound: "Objective not found, or not in a project you can access.",
  feedbackNotFound: "Feedback post not found, or not in a project you can access.",
  routineNotFound: "Routine not found, or not in a project you can access.",
  projectNotFound: "Project not found, or not accessible.",
  ownerOnly: "Only the project's owner can trash or restore a project or a routine.",
  projectKeyAlreadyUsed:
    "Its key is now used by another project — restoring it would collide. Rename that other project's key first.",
  databaseError: "A database error occurred.",
};

async function executeTrashTool(
  toolName: string,
  args: Record<string, unknown>,
  ctx: ToolContext
): Promise<ToolExecution> {
  if (toolName === "list_trash") {
    const items = await listTrash(ctx.userId, ctx.supabase);
    const type = typeof args.type === "string" && isTrashType(args.type) ? args.type : null;
    const limit =
      typeof args.limit === "number" ? Math.min(Math.max(1, args.limit), 200) : 50;
    const rows = items
      .filter((i) => !type || i.type === type)
      .slice(0, limit)
      .map((i) => ({
        type: i.type,
        id: i.id,
        title: i.title,
        identifier: i.identifier,
        project_name: i.project_name,
        deleted_at: i.deleted_at,
        deleted_by: i.deleted_by?.full_name ?? null,
      }));
    return {
      result: { items: rows, retention_days: TRASH_RETENTION_DAYS },
      success: true,
    };
  }

  const type = typeof args.type === "string" && isTrashType(args.type) ? args.type : null;
  const id = typeof args.id === "string" ? args.id.trim() : "";
  if (!type || !id) {
    return toolError(
      `Pass both type (${TRASH_TYPES.join(", ")}) and the item's id.`
    );
  }

  // `kind: "agent"` (MIN-278) : le geste tourne sous l'id du compte qui l'a
  // permis, mais c'est Numo qui l'a fait. Sans ce mot, l'activité d'une page
  // corbeillée par l'agent nommerait l'humain — la fausse attribution que la
  // règle d'identité interdit, et que l'écriture de page évite déjà.
  const result =
    toolName === "move_to_trash"
      ? await softDeleteItem(type, id, ctx.userId, "agent")
      : await restoreItem(type, id, ctx.userId, "agent");
  if (!result.ok) {
    return toolError(TRASH_ERROR_MESSAGES[result.errorKey] ?? result.errorKey);
  }
  return {
    result:
      toolName === "move_to_trash"
        ? { trashed: true, type, id, retention_days: TRASH_RETENTION_DAYS }
        : { restored: true, type, id },
    success: true,
  };
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
          .is("deleted_at", null)
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
    // La liste est à plat : `depth` est la SEULE chose qui dise qu'une tâche
    // appartient à celle d'avant (0 = premier niveau, sans limite de niveaux).
    depth: t.depth,
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

/**
 * Les gestes de PAGE côté Numo (MIN-273 ; chercher depuis MIN-276).
 *
 * Rien de la logique n'est ici : le noyau (`lib/server/page-tools.ts`) est celui
 * du MCP et de l'agent de code, projection markdown comprise. Ce que fait cette
 * fonction, et qui n'est pas rien : elle nomme les tools DE CETTE SURFACE dans
 * les refus (`get_page`, pas `minddy_get_page`), sans quoi un modèle qui suit le
 * conseil d'un message d'erreur brûle un tour sur un « Unknown tool ».
 */
async function executePageTool(
  toolName: string,
  args: Record<string, unknown>,
  ctx: ToolContext,
  projectId: string
): Promise<ToolExecution> {
  const actorId = ctx.userId;
  const pageId = typeof args.page_id === "string" ? args.page_id : "";
  const str = (value: unknown): string | undefined =>
    typeof value === "string" ? value : undefined;

  const render = <T,>(result: PageToolResult<T>): ToolExecution =>
    result.ok ? { result: result.data, success: true } : toolError(result.message);

  if (toolName === "list_pages") {
    const result = await listPagesForAgent({ projectId, actorId });
    return result.ok
      ? { result: { count: result.data.pages.length, pages: result.data.pages }, success: true }
      : toolError(result.message);
  }

  if (toolName === "search_pages") {
    const result = await searchPagesForAgent({
      projectId,
      actorId,
      query: str(args.query) ?? "",
      limit: typeof args.limit === "number" ? args.limit : undefined,
    });
    return result.ok
      ? {
          result: {
            query: result.data.query,
            count: result.data.pages.length,
            pages: result.data.pages,
          },
          success: true,
        }
      : toolError(result.message);
  }

  if (!pageId) return toolError("page_id is required (use list_pages to find it).");

  switch (toolName) {
    case "get_page":
      return render(await readPageForAgent({ pageId, projectId, actorId }));
    case "update_page":
      return render(
        await updatePageForAgent({
          pageId,
          projectId,
          actorId,
          title: str(args.title),
          icon: "icon" in args ? (str(args.icon) ?? null) : undefined,
          markdown: str(args.markdown),
          version: typeof args.version === "number" ? args.version : undefined,
        })
      );
    case "append_to_page":
      return render(
        await appendToPageForAgent({
          pageId,
          projectId,
          actorId,
          markdown: str(args.markdown) ?? "",
        })
      );
    case "edit_page_text":
      return render(
        await editPageTextForAgent({
          pageId,
          projectId,
          actorId,
          oldString: str(args.old_string) ?? "",
          newString: str(args.new_string) ?? "",
          replaceAll: args.replace_all === true,
          tools: { read: "get_page", replaceWhole: "update_page { markdown }" },
        })
      );
    default:
      return toolError(`Unknown page tool: ${toolName}`);
  }
}

/** La création n'a pas de `page_id` : elle sort du dispatch ci-dessus. */
async function executeCreatePage(
  args: Record<string, unknown>,
  ctx: ToolContext,
  projectId: string
): Promise<ToolExecution> {
  const result = await createPageForAgent({
    projectId,
    actorId: ctx.userId,
    title: typeof args.title === "string" ? args.title : "",
    icon: typeof args.icon === "string" ? args.icon : undefined,
    markdown: typeof args.markdown === "string" ? args.markdown : undefined,
    parentPageId:
      typeof args.parent_page_id === "string" ? args.parent_page_id : null,
  });
  return result.ok
    ? { result: result.data, success: true }
    : toolError(result.message);
}

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
      const depth = row.depth;
      if (
        depth !== undefined &&
        (typeof depth !== "number" || !Number.isInteger(depth) || depth < 0)
      ) {
        return toolError("depth must be a non-negative integer (0 = top level).");
      }
      tasks.push({
        text: text.slice(0, 2000),
        state: isPlanTaskState(state) ? state : "pending",
        depth: typeof depth === "number" ? depth : 0,
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
