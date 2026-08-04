"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button, cn } from "mangue-ui";
import { matchAskUserAnswers, parseAskUserQuestions } from "@/lib/ask-user";
import { SeedProposalCard } from "./seed-proposal-card";
import type { SeedProposal } from "@/lib/seed/types";
import {
  Activity,
  Bot,
  ChevronRight,
  FilePen,
  FilePlus2,
  FileSearch,
  FileStack,
  FileSymlink,
  FileX,
  Filter,
  FolderTree,
  GitPullRequest,
  Globe,
  IterationCw,
  LayoutGrid,
  Link2,
  List,
  ListChecks,
  MailX,
  MessageCircleQuestion,
  MessageSquare,
  MessagesSquare,
  Notebook,
  NotebookPen,
  Plug,
  RotateCcw,
  Search,
  Settings2,
  SlidersHorizontal,
  Sparkles,
  Tag,
  Tags,
  Target,
  Terminal,
  Trash2,
  User,
  UserCog,
  UserMinus,
  UserPlus,
  Users,
  X,
} from "lucide-react";

interface ToolCallItem {
  id: string;
  name: string;
  arguments?: string;
  status: "running" | "complete";
  result?: unknown;
  success?: boolean;
}

interface ToolCallListProps {
  items: ToolCallItem[];
  /**
   * Masque les lignes ask_user de ce groupe : la question ACTIVE est rendue par
   * la surface hôte À LA PLACE du composer (MIN-86) — le fil ne montre que les
   * questions passées, repliées en ligne de tool-call.
   */
  askUserHidden?: boolean;
  /**
   * Réponse de l'utilisateur aux questions ask_user de ce message (le message
   * user qui suit, masqué du fil) — affichée dans les détails de la ligne.
   */
  askUserAnswer?: string | null;
  /**
   * Ce message porte-t-il la proposition d'amorce (MIN-173) qui ATTEND encore
   * l'utilisateur ? Elle s'affiche alors en carte, à cocher et à créer ; les
   * propositions des tours passés restent des lignes.
   */
  seedLive?: boolean;
  /** Les tickets de la proposition viennent d'être écrits (leur nombre). */
  onSeedCreated?: (created: number) => void;
}

/** La proposition portée par un résultat de `propose_backlog`, si elle a
 *  survécu au voyage (résultat d'un ancien format, message tronqué…). */
function seedProposalOf(
  result: unknown
): { projectId: string; proposal: SeedProposal } | null {
  const r = result as
    | { project_id?: unknown; proposal?: { issues?: unknown } }
    | undefined;
  if (typeof r?.project_id !== "string") return null;
  if (!Array.isArray(r.proposal?.issues) || r.proposal.issues.length === 0) {
    return null;
  }
  return { projectId: r.project_id, proposal: r.proposal as SeedProposal };
}

/** Le translator du namespace `ToolCall`, tel que le rendent `useTranslations`
 *  et `getTranslations`. Typé depuis la source plutôt que réécrit à la main :
 *  une signature maison `(key: string, values?: any)` accepte tout, y compris
 *  une clé à placeholder appelée sans ses valeurs. */
type TranslateFn = ReturnType<typeof useTranslations<"ToolCall">>;

interface ToolMeta {
  icon: React.ComponentType<{ className?: string }>;
  getLabel: (
    args: Record<string, unknown>,
    result: Record<string, unknown> | undefined,
    success: boolean,
    status: string,
    t: TranslateFn
  ) => string;
}

function safeParseArgs(args?: string): Record<string, unknown> {
  if (!args) return {};
  try {
    return JSON.parse(args);
  } catch {
    return {};
  }
}

function queryLabel(args: Record<string, unknown>): string {
  const raw = typeof args.query === "string" ? args.query.trim() : "";
  if (!raw) return "…";
  return raw.length > 40 ? `${raw.slice(0, 40)}…` : raw;
}

/** Count of rows in a `{key: [...]}` tool result. */
function resultCount(
  result: Record<string, unknown> | undefined,
  key: string
): number {
  const rows = result?.[key] as Array<unknown> | undefined;
  return rows?.length ?? 0;
}

/**
 * Cochage de tâches du carnet. Servi sous DEUX noms : `update_scratchpad_tasks`
 * (Numo chat) et `update_scratchpad_task` (agent de code, MIN-84/MIN-125) — les
 * renommer casserait la reprise des runs en cours, donc le fil connaît les deux.
 * Le compte vient du résultat, sinon des arguments bruts du modèle, sinon du
 * résumé à plat que `toolArgSummary` persiste pour un run d'agent (`count`).
 */
const SCRATCHPAD_TASKS_META: ToolMeta = {
  icon: ListChecks,
  getLabel: (args, result, success, status, t) => {
    if (status === "running") return t("updatingScratchpadTasks");
    if (!success) return t("updateScratchpadTasksFailed");
    const updated =
      typeof result?.updated === "number"
        ? result.updated
        : Array.isArray(args.tasks)
          ? args.tasks.length
          : typeof args.count === "number"
            ? args.count
            : 0;
    return t("scratchpadTasksUpdated", { count: updated });
  },
};

/** Référence du ticket visé quand le tool en portait une (sinon : celui du run). */
function targetIssue(args: Record<string, unknown>): string | null {
  return typeof args.issue === "string" && args.issue.trim() ? args.issue.trim() : null;
}

const TOOL_META: Record<string, ToolMeta> = {
  list_projects: {
    icon: LayoutGrid,
    getLabel: (_args, result, _success, status, t) => {
      if (status === "running") return t("loadingProjects");
      return t("foundProjects", { count: resultCount(result, "projects") });
    },
  },
  list_issues: {
    icon: List,
    getLabel: (_args, result, _success, status, t) => {
      if (status === "running") return t("loadingIssues");
      return t("foundIssues", { count: resultCount(result, "issues") });
    },
  },
  search_issues: {
    icon: Search,
    getLabel: (args, result, _success, status, t) => {
      if (status === "running")
        return t("searchingIssues", { query: queryLabel(args) });
      return t("foundIssues", { count: resultCount(result, "issues") });
    },
  },
  get_issue: {
    icon: FileSearch,
    getLabel: (_args, result, success, status, t) => {
      if (status === "running") return t("loadingIssue");
      if (!success) return t("issueNotFound");
      const issue = result?.issue as Record<string, unknown> | undefined;
      const identifier =
        typeof issue?.identifier === "string" ? issue.identifier : null;
      return identifier
        ? t("issueLoadedWithId", { identifier })
        : t("issueLoaded");
    },
  },
  list_members: {
    icon: Users,
    getLabel: (_args, result, _success, status, t) => {
      if (status === "running") return t("loadingMembers");
      return t("foundMembers", { count: resultCount(result, "members") });
    },
  },
  list_objectives: {
    icon: Target,
    getLabel: (_args, result, _success, status, t) => {
      if (status === "running") return t("loadingObjectives");
      return t("foundObjectives", { count: resultCount(result, "objectives") });
    },
  },
  list_categories: {
    icon: Tags,
    getLabel: (_args, result, _success, status, t) => {
      if (status === "running") return t("loadingCategories");
      return t("foundCategories", { count: resultCount(result, "categories") });
    },
  },
  list_views: {
    icon: SlidersHorizontal,
    getLabel: (_args, result, _success, status, t) => {
      if (status === "running") return t("loadingViews");
      return t("foundViews", { count: resultCount(result, "views") });
    },
  },
  create_issue: {
    icon: FilePlus2,
    getLabel: (_args, result, success, status, t) => {
      if (status === "running") return t("creatingIssue");
      if (!success) return t("createIssueFailed");
      const issue = result?.issue as Record<string, unknown> | undefined;
      const identifier =
        typeof issue?.identifier === "string" ? issue.identifier : null;
      return identifier
        ? t("issueCreatedWithId", { identifier })
        : t("issueCreated");
    },
  },
  // L'amorce d'un projet par la conversation (MIN-173). La proposition VIVANTE
  // s'affiche en carte (voir plus bas) ; cette ligne est ce qu'il en reste une
  // fois la conversation repartie.
  propose_backlog: {
    icon: Sparkles,
    getLabel: (_args, result, success, status, t) => {
      if (status === "running") return t("proposingBacklog");
      if (!success) return t("proposeBacklogFailed");
      const count = typeof result?.issues === "number" ? result.issues : 0;
      return t("backlogProposed", { count });
    },
  },
  update_issues: {
    icon: FilePen,
    getLabel: (args, result, success, status, t) => {
      const ids = Array.isArray(args.issue_ids) ? args.issue_ids.length : 1;
      if (status === "running") return t("updatingIssues", { count: ids });
      if (!success) return t("updateIssuesFailed");
      const updated =
        typeof result?.updated === "number" ? result.updated : ids;
      return t("issuesUpdated", { count: updated });
    },
  },
  append_to_plan: {
    icon: ListChecks,
    getLabel: (_args, _result, success, status, t) => {
      if (status === "running") return t("appendingToPlan");
      return success ? t("planAppended") : t("appendToPlanFailed");
    },
  },
  update_plan_tasks: {
    icon: ListChecks,
    getLabel: (args, result, success, status, t) => {
      if (status === "running") return t("updatingPlanTasks");
      if (!success) return t("updatePlanTasksFailed");
      const updated =
        typeof result?.updated === "number"
          ? result.updated
          : Array.isArray(args.tasks)
            ? args.tasks.length
            : 0;
      return t("planTasksUpdated", { count: updated });
    },
  },
  set_issue_categories: {
    icon: Tags,
    getLabel: (_args, _result, success, status, t) => {
      if (status === "running") return t("settingCategories");
      return success ? t("categoriesSet") : t("setCategoriesFailed");
    },
  },
  add_comment: {
    icon: MessageSquare,
    getLabel: (_args, _result, success, status, t) => {
      if (status === "running") return t("addingComment");
      return success ? t("commentAdded") : t("addCommentFailed");
    },
  },
  create_view: {
    icon: SlidersHorizontal,
    getLabel: (_args, result, success, status, t) => {
      if (status === "running") return t("creatingView");
      if (!success) return t("createViewFailed");
      const view = result?.view as Record<string, unknown> | undefined;
      const name = typeof view?.name === "string" ? view.name : null;
      return name ? t("viewCreatedWithName", { name }) : t("viewCreated");
    },
  },
  update_view: {
    icon: SlidersHorizontal,
    getLabel: (_args, _result, success, status, t) => {
      if (status === "running") return t("updatingView");
      return success ? t("viewUpdated") : t("updateViewFailed");
    },
  },
  create_objective: {
    icon: Target,
    getLabel: (_args, result, success, status, t) => {
      if (status === "running") return t("creatingObjective");
      if (!success) return t("createObjectiveFailed");
      const objective = result?.objective as Record<string, unknown> | undefined;
      const name = typeof objective?.name === "string" ? objective.name : null;
      return name
        ? t("objectiveCreatedWithName", { name })
        : t("objectiveCreated");
    },
  },
  update_objective: {
    icon: Target,
    getLabel: (_args, _result, success, status, t) => {
      if (status === "running") return t("updatingObjective");
      return success ? t("objectiveUpdated") : t("updateObjectiveFailed");
    },
  },
  create_category: {
    icon: Tag,
    getLabel: (_args, result, success, status, t) => {
      if (status === "running") return t("creatingCategory");
      if (!success) return t("createCategoryFailed");
      const category = result?.category as Record<string, unknown> | undefined;
      const name = typeof category?.name === "string" ? category.name : null;
      return name
        ? t("categoryCreatedWithName", { name })
        : t("categoryCreated");
    },
  },
  triage_decision: {
    icon: Filter,
    getLabel: (args, _result, success, status, t) => {
      if (status === "running") return t("applyingTriage");
      if (!success) return t("triageFailed");
      const decision = typeof args.decision === "string" ? args.decision : "";
      if (decision === "accept") return t("triageAccepted");
      if (decision === "decline") return t("triageDeclined");
      if (decision === "duplicate") return t("triageDuplicate");
      return t("triageApplied");
    },
  },
  update_project: {
    icon: Settings2,
    getLabel: (_args, _result, success, status, t) => {
      if (status === "running") return t("updatingProject");
      return success ? t("projectUpdated") : t("updateProjectFailed");
    },
  },
  invite_member: {
    icon: UserPlus,
    getLabel: (_args, _result, success, status, t) => {
      if (status === "running") return t("invitingMember");
      return success ? t("memberInvited") : t("inviteMemberFailed");
    },
  },
  remove_member: {
    icon: UserMinus,
    getLabel: (_args, _result, success, status, t) => {
      if (status === "running") return t("removingMember");
      return success ? t("memberRemoved") : t("removeMemberFailed");
    },
  },
  cancel_invitation: {
    icon: MailX,
    getLabel: (_args, _result, success, status, t) => {
      if (status === "running") return t("cancellingInvitation");
      return success ? t("invitationCancelled") : t("cancelInvitationFailed");
    },
  },
  update_category: {
    icon: Tag,
    getLabel: (_args, _result, success, status, t) => {
      if (status === "running") return t("updatingCategory");
      return success ? t("categoryUpdated") : t("updateCategoryFailed");
    },
  },
  create_integration: {
    icon: Plug,
    getLabel: (_args, _result, success, status, t) => {
      if (status === "running") return t("creatingIntegration");
      return success ? t("integrationCreated") : t("createIntegrationFailed");
    },
  },
  update_integration_webhook: {
    icon: Plug,
    getLabel: (_args, _result, success, status, t) => {
      if (status === "running") return t("updatingWebhook");
      return success ? t("webhookUpdated") : t("updateWebhookFailed");
    },
  },
  revoke_integration: {
    icon: Plug,
    getLabel: (_args, _result, success, status, t) => {
      if (status === "running") return t("revokingIntegration");
      return success ? t("integrationRevoked") : t("revokeIntegrationFailed");
    },
  },
  get_feedback_board: {
    icon: Globe,
    getLabel: (_args, _result, _success, status, t) => {
      if (status === "running") return t("loadingFeedbackBoard");
      return t("feedbackBoardLoaded");
    },
  },
  configure_feedback_board: {
    icon: Globe,
    getLabel: (args, _result, success, status, t) => {
      if (status === "running") return t("configuringFeedbackBoard");
      if (!success) return t("configureFeedbackBoardFailed");
      // La publication est le seul effet qui se voit du dehors : on la nomme.
      if (args.enabled === true) return t("feedbackBoardPublished");
      if (args.enabled === false) return t("feedbackBoardUnpublished");
      return t("feedbackBoardConfigured");
    },
  },
  list_integrations: {
    icon: Plug,
    getLabel: (_args, result, _success, status, t) => {
      if (status === "running") return t("loadingIntegrations");
      return t("foundIntegrations", {
        count: resultCount(result, "integrations"),
      });
    },
  },
  link_issues: {
    icon: Link2,
    getLabel: (args, _result, success, status, t) => {
      const removing = args.remove === true;
      if (status === "running")
        return removing ? t("unlinkingIssues") : t("linkingIssues");
      if (!success) return removing ? t("unlinkIssuesFailed") : t("linkIssuesFailed");
      return removing ? t("issuesUnlinked") : t("issuesLinked");
    },
  },
  // ── Feedback ─────────────────────────────────────────────────────────
  list_feedback: {
    icon: MessagesSquare,
    getLabel: (_args, result, _success, status, t) => {
      if (status === "running") return t("loadingFeedback");
      return t("foundFeedback", { count: resultCount(result, "feedback") });
    },
  },
  get_feedback: {
    icon: MessagesSquare,
    getLabel: (_args, _result, success, status, t) => {
      if (status === "running") return t("loadingFeedbackPost");
      return success ? t("feedbackPostLoaded") : t("feedbackPostNotFound");
    },
  },
  promote_feedback_to_issue: {
    icon: FilePlus2,
    getLabel: (_args, result, success, status, t) => {
      if (status === "running") return t("promotingFeedback");
      if (!success) return t("promoteFeedbackFailed");
      const issue = result?.issue as Record<string, unknown> | undefined;
      const identifier =
        typeof issue?.identifier === "string" ? issue.identifier : null;
      return identifier
        ? t("feedbackPromotedWithId", { identifier })
        : t("feedbackPromoted");
    },
  },
  link_feedback_to_issue: {
    icon: Link2,
    getLabel: (_args, _result, success, status, t) => {
      if (status === "running") return t("linkingFeedback");
      return success ? t("feedbackLinked") : t("linkFeedbackFailed");
    },
  },
  unlink_feedback: {
    icon: Link2,
    getLabel: (_args, _result, success, status, t) => {
      if (status === "running") return t("unlinkingFeedback");
      return success ? t("feedbackUnlinked") : t("unlinkFeedbackFailed");
    },
  },
  respond_to_feedback: {
    icon: MessagesSquare,
    getLabel: (args, _result, success, status, t) => {
      // La réponse publique VIDÉE n'est pas une réponse publiée : c'est son
      // retrait, et c'est ce que l'utilisateur doit lire dans le fil.
      const clearing = typeof args.response === "string" && !args.response.trim();
      if (status === "running")
        return clearing ? t("clearingFeedbackResponse") : t("respondingToFeedback");
      if (!success) return t("respondToFeedbackFailed");
      return clearing ? t("feedbackResponseCleared") : t("feedbackResponded");
    },
  },
  // ── Agent de code & pull requests ────────────────────────────────────
  list_agent_models: {
    icon: Bot,
    getLabel: (_args, result, _success, status, t) => {
      if (status === "running") return t("loadingAgentModels");
      return t("foundAgentModels", { count: resultCount(result, "models") });
    },
  },
  launch_code_agent: {
    icon: Sparkles,
    getLabel: (args, result, success, status, t) => {
      if (status === "running") return t("launchingCodeAgent");
      if (!success) return t("launchCodeAgentFailed");
      // Une run déjà en cours reçoit le message en PILOTAGE : le dire, sinon
      // « agent lancé » sur une run qui tournait déjà induit en erreur.
      if (result?.continued === true) return t("codeAgentSteered");
      const mode = typeof args.mode === "string" ? args.mode : "";
      if (mode === "plan") return t("codeAgentLaunchedPlan");
      if (mode === "implement") return t("codeAgentLaunchedImplement");
      if (mode === "verify") return t("codeAgentLaunchedVerify");
      return t("codeAgentLaunched");
    },
  },
  read_pull_request: {
    icon: GitPullRequest,
    getLabel: (_args, result, success, status, t) => {
      if (status === "running") return t("loadingPullRequest");
      if (!success) return t("pullRequestNotFound");
      const number = typeof result?.number === "number" ? result.number : null;
      return number != null
        ? t("pullRequestLoadedWithNumber", { number })
        : t("pullRequestLoaded");
    },
  },
  link_pull_request: {
    icon: GitPullRequest,
    getLabel: (_args, _result, success, status, t) => {
      if (status === "running") return t("linkingPullRequest");
      return success ? t("pullRequestLinked") : t("linkPullRequestFailed");
    },
  },
  // ── Corbeille (MIN-133) ──────────────────────────────────────────────
  list_trash: {
    icon: Trash2,
    getLabel: (_args, result, _success, status, t) => {
      if (status === "running") return t("loadingTrash");
      return t("foundTrashItems", { count: resultCount(result, "items") });
    },
  },
  move_to_trash: {
    icon: Trash2,
    getLabel: (_args, _result, success, status, t) => {
      if (status === "running") return t("movingToTrash");
      return success ? t("movedToTrash") : t("moveToTrashFailed");
    },
  },
  restore_from_trash: {
    icon: RotateCcw,
    getLabel: (_args, _result, success, status, t) => {
      if (status === "running") return t("restoringFromTrash");
      return success ? t("restoredFromTrash") : t("restoreFromTrashFailed");
    },
  },
  list_global_filter_options: {
    icon: SlidersHorizontal,
    getLabel: (_args, _result, _success, status, t) => {
      if (status === "running") return t("loadingFilterOptions");
      return t("filterOptionsLoaded");
    },
  },
  get_account_settings: {
    icon: User,
    getLabel: (_args, _result, _success, status, t) => {
      if (status === "running") return t("loadingAccountSettings");
      return t("accountSettingsLoaded");
    },
  },
  update_account_settings: {
    icon: UserCog,
    getLabel: (_args, _result, success, status, t) => {
      if (status === "running") return t("updatingAccountSettings");
      return success
        ? t("accountSettingsUpdated")
        : t("updateAccountSettingsFailed");
    },
  },
  get_cycle: {
    icon: IterationCw,
    getLabel: (_args, _result, success, status, t) => {
      if (status === "running") return t("loadingCycle");
      return success ? t("cycleLoaded") : t("loadCycleFailed");
    },
  },
  fill_cycle: {
    icon: IterationCw,
    getLabel: (_args, result, success, status, t) => {
      if (status === "running") return t("fillingCycle");
      if (!success) return t("fillCycleFailed");
      const added = typeof result?.added === "number" ? result.added : 0;
      return t("cycleFilled", { count: added });
    },
  },
  add_issues_to_cycle: {
    icon: IterationCw,
    getLabel: (_args, result, success, status, t) => {
      if (status === "running") return t("addingToCycle");
      if (!success) return t("addToCycleFailed");
      const added = typeof result?.added === "number" ? result.added : 0;
      return t("addedToCycle", { count: added });
    },
  },
  remove_issues_from_cycle: {
    icon: IterationCw,
    getLabel: (_args, result, success, status, t) => {
      if (status === "running") return t("removingFromCycle");
      if (!success) return t("removeFromCycleFailed");
      const removed = typeof result?.removed === "number" ? result.removed : 0;
      return t("removedFromCycle", { count: removed });
    },
  },
  get_scratchpad: {
    icon: Notebook,
    getLabel: (_args, _result, success, status, t) => {
      if (status === "running") return t("loadingScratchpad");
      return success ? t("scratchpadLoaded") : t("loadScratchpadFailed");
    },
  },
  add_scratchpad_tasks: {
    icon: NotebookPen,
    getLabel: (args, result, success, status, t) => {
      if (status === "running") return t("addingScratchpadTasks");
      if (!success) return t("addScratchpadTasksFailed");
      const added =
        typeof result?.added === "number"
          ? result.added
          : Array.isArray(args.tasks)
            ? args.tasks.length
            : typeof args.count === "number"
              ? args.count
              : 0;
      return t("scratchpadTasksAdded", { count: added });
    },
  },
  update_scratchpad_tasks: SCRATCHPAD_TASKS_META,
  update_scratchpad_task: SCRATCHPAD_TASKS_META,
  set_scratchpad: {
    icon: NotebookPen,
    getLabel: (_args, _result, success, status, t) => {
      if (status === "running") return t("updatingScratchpad");
      return success ? t("scratchpadUpdated") : t("updateScratchpadFailed");
    },
  },
  web_search: {
    icon: Globe,
    getLabel: (args, result, success, status, t) => {
      const query = queryLabel(args);
      if (status === "running") return t("searchingWeb", { query });
      if (!success) return t("webSearchFailed");
      return t("webSearched", {
        query,
        count: resultCount(result, "sources"),
      });
    },
  },
  ask_user: {
    icon: MessageCircleQuestion,
    getLabel: (args, _result, _success, status, t) => {
      if (status === "running") return t("askingUser");
      const questions = parseAskUserQuestions(args);
      if (questions.length > 1)
        return t("questionsAsked", { count: questions.length });
      return questions[0]?.question || t("questionAsked");
    },
  },
  // ── Agent de code (MIN-46) : mêmes lignes de tool-call que Numo. ──────────
  read_file: {
    icon: FileSearch,
    getLabel: (args, _r, _s, _st, t) =>
      t("agentReadFile", { path: (args.path as string) || "…" }),
  },
  list_dir: {
    icon: FolderTree,
    getLabel: (args, _r, _s, _st, t) =>
      t("agentListDir", { path: (args.path as string) || "…" }),
  },
  glob: {
    icon: FileSearch,
    getLabel: (args, _r, _s, _st, t) =>
      t("agentGlob", { pattern: (args.pattern as string) || "…" }),
  },
  grep: {
    icon: Search,
    getLabel: (args, _r, _s, _st, t) =>
      t("agentGrep", { pattern: (args.pattern as string) || "…" }),
  },
  edit_file: {
    icon: FilePen,
    getLabel: (args, _r, _s, _st, t) =>
      t("agentEditFile", { path: (args.path as string) || "…" }),
  },
  write_file: {
    icon: FilePlus2,
    getLabel: (args, _r, _s, _st, t) =>
      t("agentWriteFile", { path: (args.path as string) || "…" }),
  },
  apply_edits: {
    icon: FileStack,
    // `changes` n'existe QUE dans les arguments bruts du modèle. Ce que le fil
    // d'un run relit, c'est le résumé à plat écrit par `toolArgSummary`
    // (lib/server/agent/agent-loop.ts) : `{ count, paths }`. Sans ces deux
    // replis, tout batch multi-fichiers s'affichait « Édition de 0 fichier(s) »,
    // trois lignes au-dessus de son propre « 3 fichiers modifiés ».
    getLabel: (args, _r, _s, _st, t) =>
      t("agentApplyEdits", {
        count: Array.isArray(args.changes)
          ? args.changes.length
          : typeof args.count === "number"
            ? args.count
            : Array.isArray(args.paths)
              ? args.paths.length
              : 0,
      }),
  },
  apply_patch: {
    icon: FileStack,
    // Même repli que `apply_edits` : `patch` est la chaîne brute du modèle, et ce
    // que le fil relit est le résumé à plat de `toolArgSummary` — `{ count, paths }`.
    getLabel: (args, _r, _s, _st, t) =>
      t("agentApplyPatch", {
        count:
          typeof args.count === "number"
            ? args.count
            : Array.isArray(args.paths)
              ? args.paths.length
              : 0,
      }),
  },
  move_file: {
    icon: FileSymlink,
    getLabel: (args, _r, _s, _st, t) =>
      t("agentMoveFile", { from: (args.from as string) || "…", to: (args.to as string) || "…" }),
  },
  delete_file: {
    icon: FileX,
    getLabel: (args, _r, _s, _st, t) =>
      t("agentDeleteFile", { path: (args.path as string) || "…" }),
  },
  run_command: {
    icon: Terminal,
    getLabel: (args, _r, _s, _st, t) =>
      t("agentRunCommand", { command: (args.command as string) || "…" }),
  },
  // Tools minddy de l'agent (MIN-125). `search_issues`, `create_issue`,
  // `add_scratchpad_tasks` et `set_scratchpad` réutilisent tels quels les entrées
  // de Numo ci-dessus : mêmes noms, mêmes formes de résultat.
  read_issue: {
    icon: FileSearch,
    getLabel: (args, _r, _s, _st, t) => {
      const issue = targetIssue(args);
      return issue ? t("agentReadIssueTarget", { issue }) : t("agentReadIssue");
    },
  },
  read_attachment: {
    icon: FileSearch,
    getLabel: (_a, _r, _s, _st, t) => t("agentReadAttachment"),
  },
  update_issue: {
    icon: FilePen,
    getLabel: (args, _r, _s, _st, t) => {
      const issue = targetIssue(args);
      return issue ? t("agentUpdateIssueTarget", { issue }) : t("agentUpdateIssue");
    },
  },
  write_issue_plan: {
    icon: FilePen,
    getLabel: (args, _r, _s, _st, t) => {
      const issue = targetIssue(args);
      return issue
        ? t("agentWriteIssuePlanTarget", { issue })
        : t("agentWriteIssuePlan");
    },
  },
  read_scratchpad: {
    icon: Notebook,
    getLabel: (_a, _r, _s, _st, t) => t("agentReadScratchpad"),
  },
  run_background: {
    icon: Activity,
    // Une ligne par ACTION : « lance npm run dev » et « sonde bg-1 » ne racontent
    // pas la même chose. `job_id` vient des arguments du modèle (start n'en a pas
    // encore) ou du résultat, qui le porte pour les trois actions.
    getLabel: (args, result, _s, _st, t) => {
      const job = (args.job_id as string) || (result?.job_id as string) || "…";
      if (args.action === "stop") return t("agentBackgroundStop", { job });
      if (args.action === "check") return t("agentBackgroundCheck", { job });
      return t("agentBackgroundStart", { command: (args.command as string) || "…" });
    },
  },
  // Sous-agents (MIN-112). `toolArgSummary` persiste `{ mode, task, model,
  // thinking_effort }` : la ligne dit ce qui a été délégué et à qui, sinon un tour
  // qui délègue n'affiche qu'un « Traitement… » anonyme.
  spawn_agent: {
    icon: Bot,
    getLabel: (args, _result, success, status, t) => {
      if (!success && status === "complete") return t("agentSpawnRefused");
      const task = typeof args.task === "string" ? args.task.trim() : "";
      const label = task.length > 60 ? `${task.slice(0, 60)}…` : task || "…";
      return args.mode === "implement"
        ? t("agentSpawnImplement", { task: label })
        : t("agentSpawnExplore", { task: label });
    },
  },
  agent_status: {
    icon: Activity,
    getLabel: (args, _r, _s, _st, t) =>
      t("agentSubagentStatus", { id: (args.id as string) || "…" }),
  },
  list_agents: {
    icon: Bot,
    // Libellé SANS compte, délibérément. `list_agents` n'a pas d'arguments, et le
    // fil d'un run d'agent ne transporte PAS le résultat des tools : `buildFeed`
    // ne garde que `{status, success}` par tool-call. Un libellé qui lirait
    // `result.agents` afficherait donc « Aucun sous-agent » sur une session qui en
    // a trois — c'est exactement le piège déjà documenté pour `apply_edits`
    // ci-dessus, et il a été vu à l'écran avant d'être corrigé ici.
    getLabel: (_a, _r, _s, _st, t) => t("agentSubagentList"),
  },
};

const DEFAULT_ICON = LayoutGrid;

function getDefaultLabel(status: string, t: TranslateFn): string {
  if (status === "running") return t("processing");
  return t("done");
}

/** Localized "running" label for a tool (used by the @Numo live comment to
    show the current step). `t` = useTranslations("ToolCall"). */
export function toolRunningLabel(name: string, t: TranslateFn): string {
  const meta = TOOL_META[name];
  if (!meta) return t("processing");
  return meta.getLabel({}, undefined, true, "running", t);
}

function getToolView(item: ToolCallItem, t: TranslateFn) {
  const meta = TOOL_META[item.name];
  const Icon = meta?.icon ?? DEFAULT_ICON;
  const parsedArgs = safeParseArgs(item.arguments);
  const resultObj = item.result as Record<string, unknown> | undefined;
  const label = meta
    ? meta.getLabel(parsedArgs, resultObj, item.success ?? true, item.status, t)
    : getDefaultLabel(item.status, t);
  return { Icon, label };
}

/**
 * Question passée : une LIGNE au style des tool-calls (le fil de lecture reste
 * propre), repliable — le clic déplie les questions posées et les réponses
 * données. La réponse de l'utilisateur ne s'affiche plus en bulle : elle vit ici.
 */
function AskUserSummaryRow({
  item,
  answer,
  t,
}: {
  item: ToolCallItem;
  answer?: string | null;
  t: TranslateFn;
}) {
  const [open, setOpen] = useState(false);
  // Comprend la forme actuelle {questions: [...]} comme la forme legacy
  // mono-question {question, suggestions} des anciens messages persistés.
  const questions = parseAskUserQuestions(safeParseArgs(item.arguments));
  if (questions.length === 0) return null;

  const entries = matchAskUserAnswers(questions, answer);
  const matched = entries.some((e) => e.answer !== null);
  const label = answer
    ? t("askUserAnsweredLine")
    : questions.length > 1
      ? t("questionsAsked", { count: questions.length })
      : t("questionAsked");

  return (
    <div className="flex flex-col">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => setOpen((o) => !o)}
        className="group h-auto w-full justify-start gap-2 bg-transparent px-0 py-0.5 text-left text-xs font-normal text-muted-foreground hover:bg-transparent hover:text-foreground"
      >
        <ChevronRight
          className={cn("h-3 w-3 shrink-0 transition-transform", open && "rotate-90")}
        />
        <MessageCircleQuestion className="h-3 w-3 shrink-0" />
        <span className="flex-1 truncate">{label}</span>
      </Button>
      {open && (
        <div className="ml-5 flex flex-col gap-1.5 py-1">
          {entries.map((e, i) => (
            <div key={i} className="flex flex-col text-xs">
              <span className="text-muted-foreground">{e.question}</span>
              {matched && e.answer && (
                <span className="text-foreground">{e.answer}</span>
              )}
            </div>
          ))}
          {/* Réponse non appariable (skip, texte libre hors carte) : en bloc. */}
          {answer && !matched && (
            <div className="text-xs text-foreground">{answer}</div>
          )}
        </div>
      )}
    </div>
  );
}

function ToolCallRow({ item, t }: { item: ToolCallItem; t: TranslateFn }) {
  const { Icon, label } = getToolView(item, t);
  const isError = item.status === "complete" && item.success === false;

  return (
    <div
      className={cn(
        "flex items-center gap-2 py-0.5 text-xs",
        isError ? "text-destructive" : "text-muted-foreground"
      )}
    >
      <Icon className="h-3 w-3 shrink-0" />
      {/* Action EN COURS → le label lui-même shimmer (pas de spinner : le texte
          qui respire dit déjà « ça tourne », sans ajouter un objet qui tourne). */}
      <span className={cn("flex-1 truncate", item.status === "running" && "text-shimmer")}>
        {label}
      </span>
      {isError ? <X className="h-3 w-3 shrink-0" /> : null}
    </div>
  );
}

export function ToolCallList({
  items,
  askUserHidden = false,
  askUserAnswer,
  seedLive = false,
  onSeedCreated,
}: ToolCallListProps) {
  const t = useTranslations("ToolCall");
  const [expanded, setExpanded] = useState(false);

  if (items.length === 0) return null;

  // ask_user (complete) renders as an interactive callout outside the list.
  const askUserCallouts = items.filter(
    (i) => i.name === "ask_user" && i.status === "complete"
  );
  // La proposition d'amorce en attente prend la place de sa ligne : c'est un
  // aperçu à relire, pas une action passée.
  const seedCallouts =
    seedLive && onSeedCreated
      ? items.filter(
          (i) =>
            i.name === "propose_backlog" &&
            i.status === "complete" &&
            i.success !== false &&
            seedProposalOf(i.result)
        )
      : [];
  const calloutIds = new Set(
    [...askUserCallouts, ...seedCallouts].map((i) => i.id)
  );
  const rowItems = items.filter((i) => !calloutIds.has(i.id));

  const renderRows = () => {
    if (rowItems.length === 0) return null;

    // Action unique : la ligne shimmer d'elle-même tant qu'elle tourne.
    if (rowItems.length === 1) return <ToolCallRow item={rowItems[0]} t={t} />;

    const anyRunning = rowItems.some((i) => i.status === "running");

    if (expanded) {
      // Ligne de résumé NEUTRE : plus de rouge global si une action a échoué —
      // seules les lignes d'action fautives (ci-dessous) apparaissent en rouge.
      return (
        <div className="flex flex-col">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setExpanded(false)}
            className="group h-auto w-full justify-start gap-2 bg-transparent px-0 py-0.5 text-left text-xs font-normal text-muted-foreground hover:bg-transparent hover:text-foreground"
          >
            <ChevronRight className="h-3 w-3 shrink-0 rotate-90 transition-transform" />
            <span className={cn("flex-1 truncate", anyRunning && "text-shimmer")}>
              {t("toolCallSummary", { count: rowItems.length })}
            </span>
          </Button>
          <div className="ml-5 flex flex-col">
            {rowItems.map((item) => (
              <ToolCallRow key={item.id} item={item} t={t} />
            ))}
          </div>
        </div>
      );
    }

    // Accordéon FERMÉ : on n'affiche que la DERNIÈRE action en date. Rouge UNIQUEMENT
    // si CETTE action a échoué (pas si une autre action du groupe a échoué). Shimmer
    // tant qu'une action du groupe tourne — c'est le groupe entier que la ligne
    // repliée résume, pas seulement l'action affichée.
    const lastItem = rowItems[rowItems.length - 1];
    const lastLabel = getToolView(lastItem, t).label;
    const lastError = lastItem.status === "complete" && lastItem.success === false;
    return (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => setExpanded(true)}
        className={cn(
          "group h-auto w-full justify-start gap-2 bg-transparent px-0 py-0.5 text-left text-xs font-normal hover:bg-transparent",
          lastError
            ? "text-destructive"
            : "text-muted-foreground hover:text-foreground"
        )}
      >
        <ChevronRight className="h-3 w-3 shrink-0 transition-transform" />
        <span className={cn("flex-1 truncate", anyRunning && "text-shimmer")}>
          {lastLabel}
        </span>
        {!anyRunning && lastError ? <X className="h-3 w-3 shrink-0" /> : null}
      </Button>
    );
  };

  return (
    <div className="flex w-full flex-col gap-1.5">
      {renderRows()}
      {!askUserHidden &&
        askUserCallouts.map((item) => (
          <AskUserSummaryRow
            key={item.id}
            item={item}
            answer={askUserAnswer}
            t={t}
          />
        ))}
      {seedCallouts.map((item) => {
        const seed = seedProposalOf(item.result)!;
        return (
          <SeedProposalCard
            key={item.id}
            projectId={seed.projectId}
            proposal={seed.proposal}
            onCreated={onSeedCreated!}
          />
        );
      })}
    </div>
  );
}
