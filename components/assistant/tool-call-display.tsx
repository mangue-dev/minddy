"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { Activity01Icon, AiAutoRotateIcon, ArrowRight01Icon, Book01Icon, Book02Icon, BookOpen01Icon, Cancel01Icon, DashboardSpeedIcon, Delete02Icon, FileAddIcon as FilePlus2, FileEditIcon as FilePen, FileSearchIcon, FileStackIcon as FileStack, FilterIcon, GitMergeIcon, GitPullRequestIcon, GlobeIcon, Image01Icon, InboxIcon, LayoutGridIcon, Link02Icon, ListIcon, MailRemove01Icon, Message01Icon, MessageCircleQuestionMarkIcon as MessageCircleQuestion, MessageMultiple01Icon, Notebook01Icon, NotebookIcon, Plug01Icon, Search01Icon, Settings02Icon, SlidersHorizontalIcon, SparklesIcon, Tag01Icon, TagsIcon, Target01Icon, TaskDone01Icon, CheckIcon, Undo02Icon, UserAdd01Icon, UserGroupIcon, UserIcon, UserMinus01Icon, UserSettings01Icon } from "@hugeicons/core-free-icons";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { matchAskUserAnswers, parseAskUserQuestions } from "@/lib/ask-user";
import { AppIcon } from "@/components/icon";
import { SeedProposalCard } from "./seed-proposal-card";
import { liveSecretOf, SecretCallout } from "./secret-callout";
import { useGroupedActions } from "./grouped-actions-context";
import type { MessageKey } from "@/lib/i18n-keys";
import type { SeedProposal } from "@/lib/seed/types";
import { ROUTINE_ICON } from "@/components/feature-icons";

export interface ToolCallItem {
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
  icon: AppIcon;
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
  icon: TaskDone01Icon,
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
  icon: Book02Icon,
  getLabel: (_args, result, success, status, t) => {
    if (status === "running") return t("loadingPage");
    if (!success) return t("pageNotFound");
    const title = typeof result?.title === "string" ? result.title.trim() : "";
    return title ? t("pageLoadedWithTitle", { title }) : t("pageLoaded");
  },
};

/** Reading feedback from the board. `get_feedback` (Numo) and `read_feedback` (agent). */
const FEEDBACK_READ_META: ToolMeta = {
  icon: MessageMultiple01Icon,
  getLabel: (_args, _result, success, status, t) => {
    if (status === "running") return t("loadingFeedbackPost");
    return success ? t("feedbackPostLoaded") : t("feedbackPostNotFound");
  },
};

const TOOL_META: Record<string, ToolMeta> = {
  get_help: {
    icon: MessageCircleQuestion,
    getLabel: (_args, _result, success, status, t) => {
      if (status === "running") return t("readingProductHelp");
      return success ? t("productHelpRead") : t("readProductHelpFailed");
    },
  },
  list_projects: {
    icon: LayoutGridIcon,
    getLabel: (_args, result, _success, status, t) => {
      if (status === "running") return t("loadingProjects");
      return t("foundProjects", { count: resultCount(result, "projects") });
    },
  },
  list_inbox: {
    icon: InboxIcon,
    getLabel: (_args, result, _success, status, t) => {
      if (status === "running") return t("loadingInbox");
      return t("foundInboxNotifications", {
        count: resultCount(result, "notifications"),
      });
    },
  },
  list_issues: {
    icon: ListIcon,
    getLabel: (_args, result, _success, status, t) => {
      if (status === "running") return t("loadingIssues");
      return t("foundIssues", { count: resultCount(result, "issues") });
    },
  },
  search_issues: {
    icon: Search01Icon,
    getLabel: (args, result, _success, status, t) => {
      if (status === "running")
        return t("searchingIssues", { query: queryLabel(args) });
      return t("foundIssues", { count: resultCount(result, "issues") });
    },
  },
  get_issue: {
    icon: FileSearchIcon,
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
    icon: UserGroupIcon,
    getLabel: (_args, result, _success, status, t) => {
      if (status === "running") return t("loadingMembers");
      return t("foundMembers", { count: resultCount(result, "members") });
    },
  },
  get_objective: {
    icon: Target01Icon,
    getLabel: (_args, result, success, status, t) => {
      if (status === "running") return t("loadingObjectives");
      return t("foundObjectives", { count: success && result?.objective ? 1 : 0 });
    },
  },
  list_objectives: {
    icon: Target01Icon,
    getLabel: (_args, result, _success, status, t) => {
      if (status === "running") return t("loadingObjectives");
      return t("foundObjectives", { count: resultCount(result, "objectives") });
    },
  },
  list_categories: {
    icon: TagsIcon,
    getLabel: (_args, result, _success, status, t) => {
      if (status === "running") return t("loadingCategories");
      return t("foundCategories", { count: resultCount(result, "categories") });
    },
  },
  list_views: {
    icon: SlidersHorizontalIcon,
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
    icon: SparklesIcon,
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
    icon: TaskDone01Icon,
    getLabel: (_args, _result, success, status, t) => {
      if (status === "running") return t("appendingToPlan");
      return success ? t("planAppended") : t("appendToPlanFailed");
    },
  },
  update_plan_tasks: {
    icon: TaskDone01Icon,
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
    icon: BookOpen01Icon,
    getLabel: (_args, result, _success, status, t) => {
      if (status === "running") return t("loadingPages");
      return t("foundPages", { count: resultCount(result, "pages") });
    },
  },
  search_pages: {
    icon: BookOpen01Icon,
    getLabel: (args, result, _success, status, t) => {
      const query = typeof args.query === "string" ? args.query.trim() : "";
      if (status === "running")
        return query ? t("searchingPagesFor", { query }) : t("searchingPages");
      return t("pagesFound", { count: resultCount(result, "pages") });
    },
  },
  get_page: PAGE_READ_META,
  create_page: {
    icon: Book01Icon,
    getLabel: (args, _result, success, status, t) => {
      const title = typeof args.title === "string" ? args.title.trim() : "";
      if (status === "running") return t("creatingPage");
      if (!success) return t("createPageFailed");
      return title ? t("pageCreatedWithTitle", { title }) : t("pageCreated");
    },
  },
  update_page_database: {
    icon: Book02Icon,
    getLabel: (_args, _result, success, status, t) => {
      if (status === "running") return t("updatingPage");
      return success ? t("pageUpdated") : t("updatePageFailed");
    },
  },
  update_page: {
    icon: Book02Icon,
    getLabel: (_args, _result, success, status, t) => {
      if (status === "running") return t("updatingPage");
      return success ? t("pageUpdated") : t("updatePageFailed");
    },
  },
  append_to_page: {
    icon: Book01Icon,
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
    icon: TagsIcon,
    getLabel: (_args, _result, success, status, t) => {
      if (status === "running") return t("settingCategories");
      return success ? t("categoriesSet") : t("setCategoriesFailed");
    },
  },
  add_comment: {
    icon: Message01Icon,
    getLabel: (_args, _result, success, status, t) => {
      if (status === "running") return t("addingComment");
      return success ? t("commentAdded") : t("addCommentFailed");
    },
  },
  list_conversation_attachments: {
    icon: FileStack,
    getLabel: (_a, _r, success, status, t) => status === "running"
      ? t("listingConversationFiles") : success ? t("conversationFilesListed") : t("listConversationFilesFailed"),
  },
  read_conversation_attachment: {
    icon: FileSearchIcon,
    getLabel: (_a, _r, success, status, t) => status === "running"
      ? t("readingConversationFile") : success ? t("conversationFileRead") : t("readConversationFileFailed"),
  },
  view_image: {
    icon: Image01Icon,
    getLabel: (_a, _r, success, status, t) => status === "running"
      ? t("viewingImage") : success ? t("imageViewed") : t("viewImageFailed"),
  },
  add_resource: {
    icon: Link02Icon,
    getLabel: (_args, _result, success, status, t) => {
      if (status === "running") return t("addingResource");
      return success ? t("resourceAdded") : t("addResourceFailed");
    },
  },
  create_view: {
    icon: SlidersHorizontalIcon,
    getLabel: (_args, result, success, status, t) => {
      if (status === "running") return t("creatingView");
      if (!success) return t("createViewFailed");
      const view = result?.view as Record<string, unknown> | undefined;
      const name = typeof view?.name === "string" ? view.name : null;
      return name ? t("viewCreatedWithName", { name }) : t("viewCreated");
    },
  },
  update_view: {
    icon: SlidersHorizontalIcon,
    getLabel: (_args, _result, success, status, t) => {
      if (status === "running") return t("updatingView");
      return success ? t("viewUpdated") : t("updateViewFailed");
    },
  },
  create_objective: {
    icon: Target01Icon,
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
    icon: Target01Icon,
    getLabel: (_args, _result, success, status, t) => {
      if (status === "running") return t("updatingObjective");
      return success ? t("objectiveUpdated") : t("updateObjectiveFailed");
    },
  },
  create_category: {
    icon: Tag01Icon,
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
    icon: FilterIcon,
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
    icon: Settings02Icon,
    getLabel: (_args, _result, success, status, t) => {
      if (status === "running") return t("updatingProject");
      return success ? t("projectUpdated") : t("updateProjectFailed");
    },
  },
  invite_member: {
    icon: UserAdd01Icon,
    getLabel: (_args, _result, success, status, t) => {
      if (status === "running") return t("invitingMember");
      return success ? t("memberInvited") : t("inviteMemberFailed");
    },
  },
  remove_member: {
    icon: UserMinus01Icon,
    getLabel: (_args, _result, success, status, t) => {
      if (status === "running") return t("removingMember");
      return success ? t("memberRemoved") : t("removeMemberFailed");
    },
  },
  cancel_invitation: {
    icon: MailRemove01Icon,
    getLabel: (_args, _result, success, status, t) => {
      if (status === "running") return t("cancellingInvitation");
      return success ? t("invitationCancelled") : t("cancelInvitationFailed");
    },
  },
  update_category: {
    icon: Tag01Icon,
    getLabel: (_args, _result, success, status, t) => {
      if (status === "running") return t("updatingCategory");
      return success ? t("categoryUpdated") : t("updateCategoryFailed");
    },
  },
  reorder_categories: {
    icon: TagsIcon,
    getLabel: (_args, _result, success, status, t) => {
      if (status === "running") return t("reorderingCategories");
      return success ? t("categoriesReordered") : t("reorderCategoriesFailed");
    },
  },
  create_integration: {
    icon: Plug01Icon,
    getLabel: (_args, _result, success, status, t) => {
      if (status === "running") return t("creatingIntegration");
      return success ? t("integrationCreated") : t("createIntegrationFailed");
    },
  },
  update_integration_webhook: {
    icon: Plug01Icon,
    getLabel: (_args, _result, success, status, t) => {
      if (status === "running") return t("updatingWebhook");
      return success ? t("webhookUpdated") : t("updateWebhookFailed");
    },
  },
  update_integration_objective: {
    icon: Plug01Icon,
    getLabel: (_args, _result, success, status, t) => {
      if (status === "running") return t("updatingIntegrationObjective");
      return success ? t("integrationObjectiveUpdated") : t("updateIntegrationObjectiveFailed");
    },
  },
  revoke_integration: {
    icon: Plug01Icon,
    getLabel: (_args, _result, success, status, t) => {
      if (status === "running") return t("revokingIntegration");
      return success ? t("integrationRevoked") : t("revokeIntegrationFailed");
    },
  },
  get_feedback_board: {
    icon: GlobeIcon,
    getLabel: (_args, _result, _success, status, t) => {
      if (status === "running") return t("loadingFeedbackBoard");
      return t("feedbackBoardLoaded");
    },
  },
  configure_feedback_board: {
    icon: GlobeIcon,
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
    icon: Plug01Icon,
    getLabel: (_args, result, _success, status, t) => {
      if (status === "running") return t("loadingIntegrations");
      return t("foundIntegrations", {
        count: resultCount(result, "integrations"),
      });
    },
  },
  link_issues: {
    icon: Link02Icon,
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
    icon: MessageMultiple01Icon,
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
    icon: Link02Icon,
    getLabel: (_args, _result, success, status, t) => {
      if (status === "running") return t("linkingFeedback");
      return success ? t("feedbackLinked") : t("linkFeedbackFailed");
    },
  },
  link_feedback_to_objective: {
    icon: Link02Icon,
    getLabel: (args, _result, success, status, t) => {
      if (status === "running") return t("updatingFeedbackObjective");
      if (!success) return t("updateFeedbackObjectiveFailed");
      return args.objective_id === null ? t("feedbackObjectiveCleared") : t("feedbackObjectiveLinked");
    },
  },
  unlink_feedback: {
    icon: Link02Icon,
    getLabel: (_args, _result, success, status, t) => {
      if (status === "running") return t("unlinkingFeedback");
      return success ? t("feedbackUnlinked") : t("unlinkFeedbackFailed");
    },
  },
  add_feedback_comment: {
    icon: MessageMultiple01Icon,
    getLabel: (_args, _result, success, status, t) => {
      if (status === "running") return t("addingFeedbackComment");
      return success
        ? t("feedbackCommentAdded")
        : t("addFeedbackCommentFailed");
    },
  },
  respond_to_feedback: {
    icon: MessageMultiple01Icon,
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
  // ── Routines (MIN-185) ───────────────────────────────────────────────
  create_routine: {
    icon: ROUTINE_ICON,
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
    icon: ROUTINE_ICON,
    getLabel: (_args, result, _success, status, t) => {
      if (status === "running") return t("loadingRoutines");
      return t("foundRoutines", { count: resultCount(result, "routines") });
    },
  },
  update_routine: {
    icon: ROUTINE_ICON,
    getLabel: (args, _result, success, status, t) => {
      if (status === "running") return t("updatingRoutine");
      if (!success) return t("updateRoutineFailed");
      // Activate/deactivate is the gesture that we read the most: it is said.
      if (args.enabled === false) return t("routineDisabled");
      if (args.enabled === true) return t("routineEnabled");
      return t("routineUpdated");
    },
  },
  // ── Routine runs (MIN-589) ─────────────────────────────────────────────
  list_routine_runs: {
    icon: ROUTINE_ICON,
    getLabel: (_args, result, _success, status, t) => {
      if (status === "running") return t("loadingRoutineRuns");
      return t("foundRoutineRuns", { count: resultCount(result, "runs") });
    },
  },
  read_routine_occurrence: {
    icon: ROUTINE_ICON,
    getLabel: (_args, _result, success, status, t) => {
      if (status === "running") return t("loadingRoutineOccurrence");
      return success ? t("routineOccurrenceLoaded") : t("routineOccurrenceNotFound");
    },
  },
  read_pull_request: {
    icon: GitPullRequestIcon,
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
    icon: GitPullRequestIcon,
    getLabel: (_args, _result, success, status, t) => {
      if (status === "running") return t("linkingPullRequest");
      return success ? t("pullRequestLinked") : t("linkPullRequestFailed");
    },
  },
  // ── PR management without touching the code (MIN-550) ─────────────────
  merge_pull_request: {
    icon: GitMergeIcon,
    getLabel: (_args, result, success, status, t) => {
      if (status === "running") return t("mergingPullRequest");
      if (!success) return t("mergePullRequestFailed");
      // A PR already merged (the pre-check caught it) is a nothing-to-do,
      // not a merge: say it.
      if (result?.note) return t("pullRequestAlreadyMerged");
      return t("pullRequestMerged");
    },
  },
  update_pull_request: {
    icon: FilePen,
    getLabel: (_args, _result, success, status, t) => {
      if (status === "running") return t("updatingPullRequest");
      return success ? t("pullRequestUpdated") : t("updatePullRequestFailed");
    },
  },
  post_pull_request_comment: {
    icon: Message01Icon,
    getLabel: (_args, _result, success, status, t) => {
      if (status === "running") return t("postingPrComment");
      return success ? t("prCommentPosted") : t("prCommentFailed");
    },
  },
  edit_own_pull_request_comment: {
    icon: MessageMultiple01Icon,
    getLabel: (_args, _result, success, status, t) => {
      if (status === "running") return t("editingPrComment");
      return success ? t("prCommentEdited") : t("editPrCommentFailed");
    },
  },
  resolve_pull_request_threads: {
    icon: CheckIcon,
    getLabel: (_args, result, success, status, t) => {
      if (status === "running") return t("resolvingPrConversations");
      if (!success) return t("resolvePrConversationsFailed");
      // The result sorts the conversations: moved, already in place, the rest.
      const changed = Array.isArray(result?.changed) ? result.changed.length : 0;
      const unchanged = Array.isArray(result?.unchanged)
        ? result.unchanged.length
        : 0;
      const failed = Array.isArray(result?.failed) ? result.failed.length : 0;
      if (failed > 0) {
        if (changed > 0) {
          return t("prConversationsPartiallyResolved", { changed, failed });
        }
        return t("resolvePrConversationsFailed");
      }
      if (changed > 0) return t("prConversationsResolved", { count: changed });
      if (unchanged > 0) {
        return t("prConversationsAlreadyResolved", { count: unchanged });
      }
      return t("resolvePrConversationsFailed");
    },
  },
  // ── Corbeille (MIN-133) ──────────────────────────────────────────────
  list_trash: {
    icon: Delete02Icon,
    getLabel: (_args, result, _success, status, t) => {
      if (status === "running") return t("loadingTrash");
      return t("foundTrashItems", { count: resultCount(result, "items") });
    },
  },
  move_to_trash: {
    icon: Delete02Icon,
    getLabel: (_args, _result, success, status, t) => {
      if (status === "running") return t("movingToTrash");
      return success ? t("movedToTrash") : t("moveToTrashFailed");
    },
  },
  restore_from_trash: {
    icon: Undo02Icon,
    getLabel: (_args, _result, success, status, t) => {
      if (status === "running") return t("restoringFromTrash");
      return success ? t("restoredFromTrash") : t("restoreFromTrashFailed");
    },
  },
  list_global_filter_options: {
    icon: SlidersHorizontalIcon,
    getLabel: (_args, _result, _success, status, t) => {
      if (status === "running") return t("loadingFilterOptions");
      return t("filterOptionsLoaded");
    },
  },
  get_account_settings: {
    icon: UserIcon,
    getLabel: (_args, _result, _success, status, t) => {
      if (status === "running") return t("loadingAccountSettings");
      return t("accountSettingsLoaded");
    },
  },
  get_user_stats: {
    icon: Activity01Icon,
    getLabel: (_args, _result, success, status, t) => {
      if (status === "running") return t("loadingUserStats");
      return success ? t("userStatsLoaded") : t("loadUserStatsFailed");
    },
  },
  get_plan_usage: {
    icon: DashboardSpeedIcon,
    getLabel: (_args, _result, success, status, t) => {
      if (status === "running") return t("loadingPlanUsage");
      return success ? t("planUsageLoaded") : t("loadPlanUsageFailed");
    },
  },
  update_account_settings: {
    icon: UserSettings01Icon,
    getLabel: (_args, _result, success, status, t) => {
      if (status === "running") return t("updatingAccountSettings");
      return success
        ? t("accountSettingsUpdated")
        : t("updateAccountSettingsFailed");
    },
  },
  get_cycle: {
    icon: AiAutoRotateIcon,
    getLabel: (_args, _result, success, status, t) => {
      if (status === "running") return t("loadingCycle");
      return success ? t("cycleLoaded") : t("loadCycleFailed");
    },
  },
  fill_cycle: {
    icon: AiAutoRotateIcon,
    getLabel: (_args, result, success, status, t) => {
      if (status === "running") return t("fillingCycle");
      if (!success) return t("fillCycleFailed");
      const added = typeof result?.added === "number" ? result.added : 0;
      return t("cycleFilled", { count: added });
    },
  },
  add_issues_to_cycle: {
    icon: AiAutoRotateIcon,
    getLabel: (_args, result, success, status, t) => {
      if (status === "running") return t("addingToCycle");
      if (!success) return t("addToCycleFailed");
      const added = typeof result?.added === "number" ? result.added : 0;
      return t("addedToCycle", { count: added });
    },
  },
  move_issues: {
    icon: AiAutoRotateIcon,
    getLabel: (_args, result, success, status, t) => {
      if (status === "running") return t("movingBetweenCycles");
      if (!success) return t("moveBetweenCyclesFailed");
      const moved = typeof result?.moved === "number" ? result.moved : 0;
      return t("movedBetweenCycles", { count: moved });
    },
  },
  remove_issues_from_cycle: {
    icon: AiAutoRotateIcon,
    getLabel: (_args, result, success, status, t) => {
      if (status === "running") return t("removingFromCycle");
      if (!success) return t("removeFromCycleFailed");
      const removed = typeof result?.removed === "number" ? result.removed : 0;
      return t("removedFromCycle", { count: removed });
    },
  },
  get_scratchpad: {
    icon: NotebookIcon,
    getLabel: (_args, _result, success, status, t) => {
      if (status === "running") return t("loadingScratchpad");
      return success ? t("scratchpadLoaded") : t("loadScratchpadFailed");
    },
  },
  add_scratchpad_tasks: {
    icon: Notebook01Icon,
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
    icon: Notebook01Icon,
    getLabel: (_args, _result, success, status, t) => {
      if (status === "running") return t("updatingScratchpad");
      return success ? t("scratchpadUpdated") : t("updateScratchpadFailed");
    },
  },
  list_mcp_tools: {
    icon: Plug01Icon,
    getLabel: (_args, _result, success, status, t) => {
      if (status === "running") return t("listingMcpTools");
      return success ? t("mcpToolsListed") : t("listMcpToolsFailed");
    },
  },
  list_mcp_presets: {
    icon: Plug01Icon,
    getLabel: (_args, _result, success, status, t) => {
      if (status === "running") return t("listingMcpPresets");
      return success ? t("mcpPresetsListed") : t("listMcpPresetsFailed");
    },
  },
  configure_mcp_connection: {
    icon: Plug01Icon,
    getLabel: (_args, _result, success, status, t) => {
      if (status === "running") return t("configuringMcpConnection");
      return success
        ? t("mcpConnectionConfigured")
        : t("configureMcpConnectionFailed");
    },
  },
  call_mcp_tool: {
    icon: Plug01Icon,
    getLabel: (args, _result, success, status, t) => {
      // The wrapper tool carries the REAL MCP tool in its arguments
      // (`lib/mcp-client-tools.ts`): naming it is the whole point of the
      // line — “MCP tool completed” says nothing about WHAT ran.
      const tool = typeof args.tool === "string" && args.tool.trim() ? args.tool.trim() : null;
      // The arguments travel with it: a compact single-line JSON preview,
      // truncated here because the row truncates again with CSS — this bound
      // only keeps a 4 KB payload out of the label string.
      let preview = "";
      if (tool && args.arguments != null) {
        try {
          const json = JSON.stringify(args.arguments);
          preview = json.length > 80 ? `${json.slice(0, 80)}…` : json;
        } catch { /* Non-serializable payload: the name alone still says it. */ }
      }
      const withArgs = (label: string) => (preview ? `${label} ${preview}` : label);
      if (!tool) {
        // Absent arguments (running label without context, replay): the
        // generic wording still reads.
        if (status === "running") return t("callingMcpTool");
        return success ? t("mcpToolCalled") : t("callMcpToolFailed");
      }
      if (status === "running") return withArgs(t("callingMcpToolNamed", { tool }));
      return withArgs(
        success ? t("mcpToolCalledNamed", { tool }) : t("callMcpToolFailedNamed", { tool }),
      );
    },
  },
  web_search: {
    icon: GlobeIcon,
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
};

const DEFAULT_ICON = LayoutGridIcon;

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

export function toolCallLabel(item: ToolCallItem, t: TranslateFn): string {
  const meta = TOOL_META[item.name];
  const parsedArgs = safeParseArgs(item.arguments);
  const resultObj = item.result as Record<string, unknown> | undefined;
  return meta
    ? meta.getLabel(parsedArgs, resultObj, item.success ?? true, item.status, t)
    : getDefaultLabel(item.status, t);
}

function getToolView(item: ToolCallItem, t: TranslateFn) {
  const meta = TOOL_META[item.name];
  const Icon = meta?.icon ?? DEFAULT_ICON;
  return { Icon, label: toolCallLabel(item, t) };
}

// ── Summary of a burst of actions ────────────────────── ──────────────────────
//
// A completed salvo is not told by its LAST action: it is told by what it
// did, per family — “Looking up 4 items, updating 2 items, searching the web
// once.” Families are voluntarily coarse: the line fits on one line, and the
// detail is one click away.

type ActionKind = "search" | "lookup" | "update" | "other";

/** Reading order of families in the sentence (chess brings up the rear). */
const ACTION_ORDER: readonly ActionKind[] = ["search", "lookup", "update", "other"];

/** Messages in LOWER CASE: they are linked in a sentence of which only the first
 * letter is capitalized (see `summarizeActions`). */
const SUMMARY_KEYS: Record<ActionKind, MessageKey<"ToolCall">> = {
  search: "summarySearch",
  lookup: "summaryLookup",
  update: "summaryUpdate",
  other: "summaryOther",
};

/** The tools whose family cannot be guessed by the name. Everything else goes through
 * rule of `actionKind`: a minddy tool that READS is called `list_`/`get_`/
 * `read_`/`search_`, the others write. */
const ACTION_KIND: Record<string, ActionKind> = {
  call_mcp_tool: "other",
  web_search: "search",
  // A seed proposal does not write anything: it waits for the user.
  propose_backlog: "other",
  ask_user: "other",
};

function actionKind(name: string): ActionKind {
  const known = ACTION_KIND[name];
  if (known) return known;
  if (/^(list|get|read|search)_/.test(name)) return "lookup";
  // An UNKNOWN tool in the thread (old run, tool since removed) is not left
  // put away: we count him without pretending to know what he has done.
  return name in TOOL_META ? "update" : "other";
}

/** “Look up 4 items, update 2 items, 1 failure”. */
export function summarizeToolCalls(items: ToolCallItem[], t: TranslateFn): string {
  const counts = new Map<ActionKind, number>();
  let failed = 0;
  for (const item of items) {
    const kind = actionKind(item.name);
    counts.set(kind, (counts.get(kind) ?? 0) + 1);
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
        <HugeiconsIcon icon={ArrowRight01Icon} className={cn(
                          "h-3 w-3 shrink-0 transition-transform",
                          open && "rotate-90",
                        )} />
        <AppIcon icon={MessageCircleQuestion} className="h-3 w-3 shrink-0" />
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
      <AppIcon icon={Icon} className="h-3 w-3 shrink-0" />
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
      {isError ? <HugeiconsIcon icon={Cancel01Icon} className="h-3 w-3 shrink-0" /> : null}
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
  const grouped = useGroupedActions();
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
    if (grouped) {
      return rowItems.map((item) => <ToolCallRow key={item.id} item={item} t={t} />);
    }

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
    const summary = anyRunning ? null : summarizeToolCalls(rowItems, t);
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
          <HugeiconsIcon icon={ArrowRight01Icon} className={cn(
                              "h-3 w-3 shrink-0 transition-transform",
                              expanded && "rotate-90",
                            )} />
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
