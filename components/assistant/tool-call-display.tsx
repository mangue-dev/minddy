"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button, cn } from "mangue-ui";
import { matchAskUserAnswers, parseAskUserQuestions } from "@/lib/ask-user";
import { SeedProposalCard } from "./seed-proposal-card";
import { liveSecretOf, SecretCallout } from "./secret-callout";
import type { MessageKey } from "@/lib/i18n-keys";
import type { SeedProposal } from "@/lib/seed/types";
import {
  Activity,
  BookOpen,
  BookPlus,
  BookText,
  Bot,
  CalendarClock,
  ChevronRight,
  ClipboardCheck,
  FilePen,
  FilePlus2,
  FileSearch,
  FileStack,
  FileSymlink,
  FileX,
  Filter,
  FolderTree,
  GitMerge,
  GitPullRequest,
  GitPullRequestCreate,
  Globe,
  Inbox,
  IterationCw,
  LayoutGrid,
  Link2,
  List,
  ListChecks,
  MailX,
  MessageCircleQuestion,
  MessageSquare,
  MessageSquareCode,
  MessagesSquare,
  Notebook,
  NotebookPen,
  Plug,
  Reply,
  RotateCcw,
  Search,
  Settings2,
  ShieldCheck,
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
   * Hides the ask_user lines in this group: the ACTIVE question is rendered by
   * the host surface INSTEAD of the composer (MIN-86) — the wire only shows the
   * past questions, folded online from tool-call.
   */
  askUserHidden?: boolean;
  /**
   * User response to the ask_user questions in this message (the message
   * user following, hidden from the thread) — displayed in the row details.
   */
  askUserAnswer?: string | null;
  /**
   * Does this message carry the primer proposal (MIN-173) which is still WAITING
   * the user? It is then displayed as a card, to be checked and created; THE
   * proposals from past rounds remain lines.
   */
  seedLive?: boolean;
  /** The proposal tickets have just been written (their number). */
  onSeedCreated?: (created: number) => void;
}

/** The proposition carried by a result of `propose_backlog`, if it has
 * survived the trip (result of an old format, truncated message, etc.). */
function seedProposalOf(
  result: unknown,
): { projectId: string; proposal: SeedProposal } | null {
  const r = result as
    { project_id?: unknown; proposal?: { issues?: unknown } } | undefined;
  if (typeof r?.project_id !== "string") return null;
  if (!Array.isArray(r.proposal?.issues) || r.proposal.issues.length === 0) {
    return null;
  }
  return { projectId: r.project_id, proposal: r.proposal as SeedProposal };
}

/** The translator of the namespace `ToolCall`, as rendered by `useTranslations`
 * and `getTranslations`. Typed from source rather than rewritten by hand:
 * a house signature `(key: string, values?: any)` accepts everything, including
 * a placeholder key called without its values. */
type TranslateFn = ReturnType<typeof useTranslations<"ToolCall">>;

interface ToolMeta {
  icon: React.ComponentType<{ className?: string }>;
  getLabel: (
    args: Record<string, unknown>,
    result: Record<string, unknown> | undefined,
    success: boolean,
    status: string,
    t: TranslateFn,
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
  key: string,
): number {
  const rows = result?.[key] as Array<unknown> | undefined;
  return rows?.length ?? 0;
}

/**
 * Checking off tasks from the notebook. Served under TWO names: `update_scratchpad_tasks`
 * (Numo chat) and `update_scratchpad_task` (code agent, MIN-84/MIN-125) — the
 * renaming would break resuming current runs, so the thread knows both.
 * The account comes from the result, if not from the raw arguments of the model, otherwise from the
 * flat summary that `toolArgSummary` persists for an agent run (`count`).
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

/**
 * Reading a wiki page. Served under TWO names: `get_page` (Numo) and
 * `read_page` (code agent) — same gesture, same line in the thread.
 */
const PAGE_READ_META: ToolMeta = {
  icon: BookText,
  getLabel: (_args, result, success, status, t) => {
    if (status === "running") return t("loadingPage");
    if (!success) return t("pageNotFound");
    const title = typeof result?.title === "string" ? result.title.trim() : "";
    return title ? t("pageLoadedWithTitle", { title }) : t("pageLoaded");
  },
};

/** Reading feedback from the board. `get_feedback` (Numo) and `read_feedback` (agent). */
const FEEDBACK_READ_META: ToolMeta = {
  icon: MessagesSquare,
  getLabel: (_args, _result, success, status, t) => {
    if (status === "running") return t("loadingFeedbackPost");
    return success ? t("feedbackPostLoaded") : t("feedbackPostNotFound");
  },
};

/**
 * The number of the targeted pull request, as the thread of a run reads it: the
 * tools of the PROJECT pull requests (MIN-267) take it as an argument, and
 * `toolArgSummary` persists it. Absent (replay session, where the pull request
 * is that of the session): the line is said without a number.
 */
function prNumber(args: Record<string, unknown>): number | null {
  return typeof args.pull_request === "number" ? args.pull_request : null;
}

/** Reference of the ticket targeted when the tool carried one (otherwise: that of the run). */
function targetIssue(args: Record<string, unknown>): string | null {
  return typeof args.issue === "string" && args.issue.trim()
    ? args.issue.trim()
    : null;
}

/**
 * Number of files affected by a batch (`apply_edits`, `apply_patch`).
 * `changes` / `patch` only exist in raw template arguments; that
 * the thread of a relit run is the flat summary of `toolArgSummary`
 * (lib/server/agent/agent-loop.ts): `{ count, paths }`. Hence the three folds.
 */
function batchFileCount(args: Record<string, unknown>): number {
  if (Array.isArray(args.changes)) return args.changes.length;
  if (typeof args.count === "number") return args.count;
  if (Array.isArray(args.paths)) return args.paths.length;
  return 0;
}

const TOOL_META: Record<string, ToolMeta> = {
  get_help: {
    icon: MessageCircleQuestion,
    getLabel: (_args, _result, success, status, t) => {
      if (status === "running") return t("readingProductHelp");
      return success ? t("productHelpRead") : t("readProductHelpFailed");
    },
  },
  list_projects: {
    icon: LayoutGrid,
    getLabel: (_args, result, _success, status, t) => {
      if (status === "running") return t("loadingProjects");
      return t("foundProjects", { count: resultCount(result, "projects") });
    },
  },
  list_inbox: {
    icon: Inbox,
    getLabel: (_args, result, _success, status, t) => {
      if (status === "running") return t("loadingInbox");
      return t("foundInboxNotifications", {
        count: resultCount(result, "notifications"),
      });
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
  // Starting a project through conversation (MIN-173). The LIVING proposal
  // is displayed as a map (see below); this line is what one remains
  // once the conversation starts again.
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
  edit_issue_text: {
    icon: FilePen,
    getLabel: (args, _result, success, status, t) => {
      // The targeted field changes what the user reads: “the plan” and “the
      // description” are not corrected in the same place on the screen.
      const plan = args.field !== "description";
      if (status === "running")
        return plan ? t("editingPlanText") : t("editingDescriptionText");
      if (!success) return t("editIssueTextFailed");
      return plan ? t("planTextEdited") : t("descriptionTextEdited");
    },
  },
  // ── Pages: the project wiki (MIN-273) ─────────────────────────────────
  list_pages: {
    icon: BookOpen,
    getLabel: (_args, result, _success, status, t) => {
      if (status === "running") return t("loadingPages");
      return t("foundPages", { count: resultCount(result, "pages") });
    },
  },
  search_pages: {
    icon: BookOpen,
    getLabel: (args, result, _success, status, t) => {
      const query = typeof args.query === "string" ? args.query.trim() : "";
      if (status === "running")
        return query ? t("searchingPagesFor", { query }) : t("searchingPages");
      return t("pagesFound", { count: resultCount(result, "pages") });
    },
  },
  get_page: PAGE_READ_META,
  create_page: {
    icon: BookPlus,
    getLabel: (args, _result, success, status, t) => {
      const title = typeof args.title === "string" ? args.title.trim() : "";
      if (status === "running") return t("creatingPage");
      if (!success) return t("createPageFailed");
      return title ? t("pageCreatedWithTitle", { title }) : t("pageCreated");
    },
  },
  update_page: {
    icon: BookText,
    getLabel: (_args, _result, success, status, t) => {
      if (status === "running") return t("updatingPage");
      return success ? t("pageUpdated") : t("updatePageFailed");
    },
  },
  append_to_page: {
    icon: BookPlus,
    getLabel: (_args, _result, success, status, t) => {
      if (status === "running") return t("appendingToPage");
      return success ? t("pageAppended") : t("appendToPageFailed");
    },
  },
  edit_page_text: {
    icon: FilePen,
    getLabel: (_args, _result, success, status, t) => {
      if (status === "running") return t("editingPageText");
      return success ? t("pageTextEdited") : t("editPageTextFailed");
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
  add_resource: {
    icon: Link2,
    getLabel: (_args, _result, success, status, t) => {
      if (status === "running") return t("addingResource");
      return success ? t("resourceAdded") : t("addResourceFailed");
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
      const objective = result?.objective as
        Record<string, unknown> | undefined;
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
  // The two gestures that the code agent has in addition (MIN-287): open an objective
  // and write on his thread. The name is read in the RESULT (the model was able to aim
  // by name as by id) — like `create_objective` just above, and it
  // therefore falls back on the wording without a name where the thread does not carry the
  // results.
  read_objective: {
    icon: Target,
    getLabel: (_args, result, success, status, t) => {
      if (status === "running") return t("loadingObjective");
      if (!success) return t("objectiveNotFound");
      const objective = result?.objective as
        Record<string, unknown> | undefined;
      const name = typeof objective?.name === "string" ? objective.name : null;
      return name
        ? t("objectiveLoadedWithName", { name })
        : t("objectiveLoaded");
    },
  },
  comment_objective: {
    icon: MessageSquare,
    getLabel: (_args, _result, success, status, t) => {
      if (status === "running") return t("commentingObjective");
      return success ? t("objectiveCommented") : t("commentObjectiveFailed");
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
      // Publication is the only effect that is visible from the outside: we name it.
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
      if (!success)
        return removing ? t("unlinkIssuesFailed") : t("linkIssuesFailed");
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
  get_feedback: FEEDBACK_READ_META,
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
  add_feedback_comment: {
    icon: MessagesSquare,
    getLabel: (_args, _result, success, status, t) => {
      if (status === "running") return t("addingFeedbackComment");
      return success
        ? t("feedbackCommentAdded")
        : t("addFeedbackCommentFailed");
    },
  },
  respond_to_feedback: {
    icon: MessagesSquare,
    getLabel: (args, _result, success, status, t) => {
      // The VIDED public response is not a published response: it is its
      // indent, and that's what the user should read in the thread.
      const clearing =
        typeof args.response === "string" && !args.response.trim();
      if (status === "running")
        return clearing
          ? t("clearingFeedbackResponse")
          : t("respondingToFeedback");
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
      // A run already in progress receives the message in CONTROL: say it, otherwise
      // “agent launched” on a run that was already running astray.
      if (result?.continued === true) return t("codeAgentSteered");
      const mode = typeof args.mode === "string" ? args.mode : "";
      if (mode === "plan") return t("codeAgentLaunchedPlan");
      if (mode === "implement") return t("codeAgentLaunchedImplement");
      if (mode === "verify") return t("codeAgentLaunchedVerify");
      return t("codeAgentLaunched");
    },
  },
  // ── Routines (MIN-185) ───────────────────────────────────────────────
  create_routine: {
    icon: CalendarClock,
    getLabel: (_args, result, success, status, t) => {
      if (status === "running") return t("creatingRoutine");
      if (!success) return t("createRoutineFailed");
      // The title comes from the RESULT, never from the arguments: there is no
      // “name” field in the tool — minddy writes it herself from
      // instruction. Reading it in `args` therefore never returned anything.
      const routine = result?.routine as Record<string, unknown> | undefined;
      const title = typeof routine?.title === "string" ? routine.title : "";
      return title ? t("routineCreatedNamed", { title }) : t("routineCreated");
    },
  },
  list_routines: {
    icon: CalendarClock,
    getLabel: (_args, result, _success, status, t) => {
      if (status === "running") return t("loadingRoutines");
      return t("foundRoutines", { count: resultCount(result, "routines") });
    },
  },
  update_routine: {
    icon: CalendarClock,
    getLabel: (args, _result, success, status, t) => {
      if (status === "running") return t("updatingRoutine");
      if (!success) return t("updateRoutineFailed");
      // Activate/deactivate is the gesture that we read the most: it is said.
      if (args.enabled === false) return t("routineDisabled");
      if (args.enabled === true) return t("routineEnabled");
      return t("routineUpdated");
    },
  },
  read_pull_request: {
    icon: GitPullRequest,
    getLabel: (args, result, success, status, t) => {
      if (status === "running") return t("loadingPullRequest");
      if (!success) return t("pullRequestNotFound");
      // The result for Numo, the arguments for the agent: the thread of a run does not
      // NOT carry the results of the tools, only the summary of the arguments.
      const number =
        typeof result?.number === "number" ? result.number : prNumber(args);
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
  list_mcp_tools: {
    icon: Plug,
    getLabel: (_args, _result, success, status, t) => {
      if (status === "running") return t("listingMcpTools");
      return success ? t("mcpToolsListed") : t("listMcpToolsFailed");
    },
  },
  call_mcp_tool: {
    icon: Plug,
    getLabel: (_args, _result, success, status, t) => {
      if (status === "running") return t("callingMcpTool");
      return success ? t("mcpToolCalled") : t("callMcpToolFailed");
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
  // ── Code agent (MIN-46): same tool-call lines as Numo. ──────────
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
    // `changes` ONLY exists in raw template arguments. What the thread
    // of a run relit, this is the flat summary written by `toolArgSummary`
    // (lib/server/agent/agent-loop.ts) : `{ count, paths }`. Sans ces deux
    // fallbacks, any multi-file batch was displayed “Editing 0 file(s)”,
    // three lines above its own “3 files modified”.
    getLabel: (args, _r, _s, _st, t) =>
      t("agentApplyEdits", { count: batchFileCount(args) }),
  },
  apply_patch: {
    icon: FileStack,
    // Same fallback as `apply_edits`: `patch` is the raw string of the model, and this
    // that the thread rereads is the flat summary of `toolArgSummary` — `{ count, paths }`.
    getLabel: (args, _r, _s, _st, t) =>
      t("agentApplyPatch", { count: batchFileCount(args) }),
  },
  move_file: {
    icon: FileSymlink,
    getLabel: (args, _r, _s, _st, t) =>
      t("agentMoveFile", {
        from: (args.from as string) || "…",
        to: (args.to as string) || "…",
      }),
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
  // `add_scratchpad_tasks` and `set_scratchpad` reuse the entries as is
  // from Numo above: same names, same forms of result.
  read_issue: {
    icon: FileSearch,
    getLabel: (args, _r, _s, _st, t) => {
      const issue = targetIssue(args);
      return issue ? t("agentReadIssueTarget", { issue }) : t("agentReadIssue");
    },
  },
  read_resource: {
    icon: FileSearch,
    getLabel: (_a, _r, _s, _st, t) => t("agentReadResource"),
  },
  // The name before MIN-184: the runs already carried out carry it in their
  // events, and a replay should not show an unlabeled call.
  read_attachment: {
    icon: FileSearch,
    getLabel: (_a, _r, _s, _st, t) => t("agentReadResource"),
  },
  update_issue: {
    icon: FilePen,
    getLabel: (args, _r, _s, _st, t) => {
      const issue = targetIssue(args);
      return issue
        ? t("agentUpdateIssueTarget", { issue })
        : t("agentUpdateIssue");
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
    // One line per ACTION: “launch npm run dev” and “probe bg-1” do not tell
    // not the same thing. `job_id` comes from template arguments (start doesn't have any
    // again) or the result, which carries it for the three actions.
    getLabel: (args, result, _s, _st, t) => {
      const job = (args.job_id as string) || (result?.job_id as string) || "…";
      if (args.action === "stop") return t("agentBackgroundStop", { job });
      if (args.action === "check") return t("agentBackgroundCheck", { job });
      return t("agentBackgroundStart", {
        command: (args.command as string) || "…",
      });
    },
  },
  // Sous-agents (MIN-112). `toolArgSummary` persiste `{ mode, task, model,
  // thinking_effort }`: the line says what was delegated and to whom, otherwise a turn
  // who delegates only displays an anonymous “Processing…”.
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
    // Worded WITHOUT consideration, deliberately. `list_agents` has no arguments, and the
    // thread of an agent run does NOT carry the result of tools: `buildFeed`
    // only keeps `{status, success}` per tool-call. Wording that would read
    // `result.agents` would therefore display “No subagent” on a session which
    // three — this is exactly the trap already documented for `apply_edits`
    // above, and it was seen on screen before being corrected here.
    getLabel: (_a, _r, _s, _st, t) => t("agentSubagentList"),
  },
  read_page: PAGE_READ_META,
  read_feedback: FEEDBACK_READ_META,
  // `webfetch` arrives under the name of opencode: it has no opposite house,
  // so no name to translate ([opencode-events.ts](lib/server/agent/vm/opencode-events.ts)).
  webfetch: {
    icon: Globe,
    getLabel: (args, _r, _s, _st, t) =>
      t("agentWebFetch", { url: (args.url as string) || "…" }),
  },
  report_verdict: {
    icon: ShieldCheck,
    getLabel: (args, _r, _s, _st, t) =>
      args.ok === true ? t("agentVerdictOk") : t("agentVerdictBlocked"),
  },
  // ── Pull requests de l'agent ─────────────────────────────────────────
  //
  // OPENING THE PULL REQUEST IS THE MOST VISIBLE ACT OF A RUN, and without entry
  // here it was displayed “Processing…” then “Finished”, under the grid icon of the
  // fallback — that is to say the only line of the thread which said nothing of what it
  // was doing. The title comes from the arguments, which `toolArgSummary` persists; A
  // failure (nothing to deliver, PR refused to reopen) is said, it cannot be guessed.
  create_pr: {
    icon: GitPullRequestCreate,
    getLabel: (args, _result, success, status, t) => {
      if (status === "complete" && !success) return t("agentCreatePrFailed");
      const raw = typeof args.title === "string" ? args.title.trim() : "";
      const title = raw.length > 60 ? `${raw.slice(0, 60)}…` : raw;
      return title ? t("agentCreatePrTitled", { title }) : t("agentCreatePr");
    },
  },
  validate_changes: {
    icon: ClipboardCheck,
    getLabel: (_args, _result, success, status, t) => {
      if (status === "running") return t("validatingChanges");
      return success ? t("changesValidated") : t("validateChangesFailed");
    },
  },
  // The three writings of a REREADING session (MIN-168): the pull request
  // is that of the session, so never a number.
  comment_pr: {
    icon: MessageSquare,
    getLabel: (_a, _r, success, status, t) =>
      status === "complete" && !success
        ? t("agentCommentPrFailed")
        : t("agentCommentPr"),
  },
  comment_pr_line: {
    icon: MessageSquareCode,
    getLabel: (args, _r, success, status, t) => {
      if (status === "complete" && !success)
        return t("agentCommentPrLineFailed");
      return t("agentCommentPrLine", {
        path: (args.path as string) || "…",
        line: typeof args.line === "number" ? args.line : 0,
      });
    },
  },
  reply_pr_thread: {
    icon: Reply,
    getLabel: (_a, _r, success, status, t) =>
      status === "complete" && !success
        ? t("agentReplyPrThreadFailed")
        : t("agentReplyPrThread"),
  },
  // PROJECT pull requests (MIN-267): these have a number.
  list_pull_requests: {
    icon: GitPullRequest,
    getLabel: (_a, _r, _s, _st, t) => t("agentListPullRequests"),
  },
  comment_pull_request: {
    icon: MessageSquare,
    getLabel: (args, _r, success, status, t) => {
      if (status === "complete" && !success) return t("agentCommentPrFailed");
      const number = prNumber(args);
      return number != null
        ? t("agentCommentPrTarget", { number })
        : t("agentCommentPr");
    },
  },
  comment_pull_request_line: {
    icon: MessageSquareCode,
    getLabel: (args, _r, success, status, t) => {
      if (status === "complete" && !success)
        return t("agentCommentPrLineFailed");
      return t("agentCommentPrLine", {
        path: (args.path as string) || "…",
        line: typeof args.line === "number" ? args.line : 0,
      });
    },
  },
  reply_pull_request_thread: {
    icon: Reply,
    getLabel: (_a, _r, success, status, t) =>
      status === "complete" && !success
        ? t("agentReplyPrThreadFailed")
        : t("agentReplyPrThread"),
  },
  // The VERDICT carries the information: an approval and a request for
  // modifications do not commit the same thing, and the forge records them.
  review_pull_request: {
    icon: ClipboardCheck,
    getLabel: (args, _r, success, status, t) => {
      if (status === "complete" && !success) return t("agentReviewPrFailed");
      const number = prNumber(args) ?? 0;
      if (args.verdict === "approve")
        return t("agentReviewPrApprove", { number });
      if (args.verdict === "request_changes")
        return t("agentReviewPrRequestChanges", { number });
      return t("agentReviewPrComment", { number });
    },
  },
  // Merging is irreversible: the line NAMES it rather than saying
  // “pull request update”.
  set_pull_request_state: {
    icon: GitMerge,
    getLabel: (args, _r, success, status, t) => {
      if (status === "complete" && !success) return t("agentSetPrStateFailed");
      const number = prNumber(args) ?? 0;
      if (args.state === "merged") return t("agentMergePr", { number });
      if (args.state === "closed") return t("agentClosePr", { number });
      if (args.state === "open") return t("agentReopenPr", { number });
      return t("agentReadyPr", { number });
    },
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

// ── Summary of a burst of actions ────────────────────── ──────────────────────
//
// A completed salvo is not told by its LAST action: “Execution of
// npm test” says nothing of the seventeen above. It is told by this
// what she did, per family — “Reading 4 files, executing
// 3 commands, writing 2 files.” Families are voluntarily
// coarse: the line fits on one line, and the detail is one click away.

type ActionKind =
  | "read"
  | "search"
  | "edit"
  | "write"
  | "command"
  | "delegate"
  | "lookup"
  | "update"
  | "other";

/** Reading order of families in the sentence (chess brings up the rear). */
const ACTION_ORDER: readonly ActionKind[] = [
  "read",
  "search",
  "edit",
  "write",
  "command",
  "delegate",
  "lookup",
  "update",
  "other",
];

/** Messages in LOWER CASE: they are linked in a sentence of which only the first
 * letter is capitalized (see `summarizeActions`). */
const SUMMARY_KEYS: Record<ActionKind, MessageKey<"ToolCall">> = {
  read: "summaryRead",
  search: "summarySearch",
  edit: "summaryEdit",
  write: "summaryWrite",
  command: "summaryCommand",
  delegate: "summaryDelegate",
  lookup: "summaryLookup",
  update: "summaryUpdate",
  other: "summaryOther",
};

/** The tools whose family cannot be guessed by the name. Everything else goes through
 * rule of `actionKind`: a minddy tool that LIT is called `list_`/`get_`/
 * `read_`/`search_`, the others write. */
const ACTION_KIND: Record<string, ActionKind> = {
  call_mcp_tool: "other",
  read_file: "read",
  grep: "search",
  glob: "search",
  list_dir: "search",
  web_search: "search",
  webfetch: "search",
  edit_file: "edit",
  apply_edits: "edit",
  apply_patch: "edit",
  move_file: "edit",
  delete_file: "edit",
  write_file: "write",
  run_command: "command",
  run_background: "command",
  spawn_agent: "delegate",
  launch_code_agent: "delegate",
  agent_status: "lookup",
  // A seed proposal does not write anything: it waits for the user.
  propose_backlog: "other",
  ask_user: "other",
  // Rendering a verdict doesn't change anything: that's what the LIT channel decides.
  report_verdict: "other",
};

function actionKind(name: string): ActionKind {
  const known = ACTION_KIND[name];
  if (known) return known;
  if (/^(list|get|read|search)_/.test(name)) return "lookup";
  // An UNKNOWN tool in the thread (old run, tool since removed) is not left
  // put away: we count him without pretending to know what he has done.
  return name in TOOL_META ? "update" : "other";
}

/** What the action weighs in its account: a multi-file batch counts its
 * files, not its call — otherwise “Editing 5 files” would be summarized as
 * “editing a file”. */
function actionWeight(item: ToolCallItem): number {
  if (item.name !== "apply_edits" && item.name !== "apply_patch") return 1;
  return Math.max(1, batchFileCount(safeParseArgs(item.arguments)));
}

/** “Read 4 files, execute 3 commands, 1 failure”. */
function summarizeActions(items: ToolCallItem[], t: TranslateFn): string {
  const counts = new Map<ActionKind, number>();
  let failed = 0;
  for (const item of items) {
    const kind = actionKind(item.name);
    counts.set(kind, (counts.get(kind) ?? 0) + actionWeight(item));
    if (item.success === false) failed++;
  }

  const parts = ACTION_ORDER.filter((kind) => counts.get(kind)).map((kind) =>
    t(SUMMARY_KEYS[kind], { count: counts.get(kind)! }),
  );
  // A failure is no longer seen by the color of the line (the summary covers everything
  // the group, not on the wrongful action): it is SAID, at the end of the sentence.
  if (failed > 0) parts.push(t("summaryFailed", { count: failed }));

  const line = parts.join(", ");
  return line.charAt(0).toLocaleUpperCase() + line.slice(1);
}

/**
 * Past question: a LINE in the style of tool-calls (the reading thread remains
 * clean), foldable — the click unfolds the questions asked and the answers
 * data. The user's response is no longer displayed in a bubble: she lives here.
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
  // Understands current form {questions: [...]} as well as legacy form
  // single-question {question, suggestions} from old persisted messages.
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
          className={cn(
            "h-3 w-3 shrink-0 transition-transform",
            open && "rotate-90",
          )}
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
          {/* Unmatchable response (skip, free text outside the map): in bulk. */}
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
        isError ? "text-destructive" : "text-muted-foreground",
      )}
    >
      <Icon className="h-3 w-3 shrink-0" />
      {/* Action IN PROGRESS → the label itself shimmer (no spinner: the text
 which breathes already says “it spins”, without adding a rotating object). */}
      <span
        className={cn(
          "flex-1 truncate",
          item.status === "running" && "text-shimmer",
        )}
      >
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
    (i) => i.name === "ask_user" && i.status === "complete",
  );
  // The pending primer proposition takes the place of its line: it is a
  // insight to reread, not a past action.
  const seedCallouts =
    seedLive && onSeedCreated
      ? items.filter(
          (i) =>
            i.name === "propose_backlog" &&
            i.status === "complete" &&
            i.success !== false &&
            seedProposalOf(i.result),
        )
      : [];
  const calloutIds = new Set(
    [...askUserCallouts, ...seedCallouts].map((i) => i.id),
  );
  const rowItems = items.filter((i) => !calloutIds.has(i.id));

  const renderRows = () => {
    if (rowItems.length === 0) return null;

    // Unique action: the line shimmers by itself as long as it rotates.
    if (rowItems.length === 1) return <ToolCallRow item={rowItems[0]} t={t} />;

    const anyRunning = rowItems.some((i) => i.status === "running");
    const lastItem = rowItems[rowItems.length - 1];
    const lastError =
      lastItem.status === "complete" && lastItem.success === false;

    // Salvo COMPLETED: the header line no longer shows the last action but
    // what the ENTIRE salvo did, and it is the SAME sentence folded or unfolded
    // — the click only opens the detail, it does not change what is said.
    //
    // Salve IN PROGRESS: nothing to summarize, an account would be false from one line to the next
    // the other. We keep the live - the last action to date once folded,
    // the current account once unfolded — and the shimmer which says “it’s running”.
    const summary = anyRunning ? null : summarizeActions(rowItems, t);
    const label =
      summary ??
      (expanded
        ? t("toolCallSummary", { count: rowItems.length })
        : getToolView(lastItem, t).label);
    // Red only applies to the “last action” line: a summary of
    // group remains NEUTRAL (it SAYS its failures), and only the lines of action
    // faulty, unfolded, appear in red.
    const headerError = !summary && !expanded && lastError;

    return (
      <div className="flex flex-col">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setExpanded((o) => !o)}
          className={cn(
            "group h-auto w-full justify-start gap-2 bg-transparent px-0 py-0.5 text-left text-xs font-normal hover:bg-transparent",
            headerError
              ? "text-destructive"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <ChevronRight
            className={cn(
              "h-3 w-3 shrink-0 transition-transform",
              expanded && "rotate-90",
            )}
          />
          <span className={cn("flex-1 truncate", anyRunning && "text-shimmer")}>
            {label}
          </span>
        </Button>
        {expanded && (
          <div className="ml-5 flex flex-col">
            {rowItems.map((item) => (
              <ToolCallRow key={item.id} item={item} t={t} />
            ))}
          </div>
        )}
      </div>
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
      {/* The living identifier that the result has just brought (MIN-343): it
 is displayed IN ADDITION to the action line, and only live — upon reloading the history only shows `[redacted]`. */}
      {items.map((item) => {
        const secret =
          item.status === "complete" && item.success !== false
            ? liveSecretOf(item.name, item.result)
            : null;
        return secret ? (
          <SecretCallout key={`secret-${item.id}`} envLine={secret.envLine} />
        ) : null;
      })}
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
