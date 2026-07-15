"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button, cn } from "mangue-ui";
import { Suggestion, Suggestions } from "@/components/ai-elements/suggestion";
import {
  ChevronRight,
  FilePen,
  FilePlus2,
  FileSearch,
  FileStack,
  FileSymlink,
  FileX,
  Filter,
  FolderTree,
  IterationCw,
  LayoutGrid,
  List,
  ListChecks,
  Loader2,
  MailX,
  MessageCircleQuestion,
  MessageSquare,
  Plug,
  Search,
  Settings2,
  SlidersHorizontal,
  Tag,
  Tags,
  Target,
  Terminal,
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
  /** Callback when a user clicks a suggested answer (ask_user tool) */
  onSuggestionClick?: (text: string) => void;
  /**
   * Ce groupe d'actions est-il la TÊTE VIVANTE de la conversation (aucun message
   * plus récent) ? Alors l'accordéon fermé montre sa dernière action avec un effet
   * shimmer. Retiré dès qu'un message plus récent apparaît (isLatest=false).
   */
  isLatest?: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TranslateFn = (key: string, values?: any) => string;

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
  ask_user: {
    icon: MessageCircleQuestion,
    getLabel: (args, _result, _success, status, t) => {
      if (status === "running") return t("askingUser");
      return (args.question as string) || t("questionAsked");
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
    getLabel: (args, _r, _s, _st, t) =>
      t("agentApplyEdits", { count: Array.isArray(args.changes) ? args.changes.length : 0 }),
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

function AskUserCallout({
  item,
  onSuggestionClick,
  t,
}: {
  item: ToolCallItem;
  onSuggestionClick?: (text: string) => void;
  t: TranslateFn;
}) {
  const parsedArgs = safeParseArgs(item.arguments);
  const question = parsedArgs.question as string;
  const suggestions = Array.isArray(parsedArgs.suggestions)
    ? (parsedArgs.suggestions as string[])
    : [];

  return (
    <div className="space-y-2.5">
      <div className="flex items-start gap-2.5 rounded-xl border border-brand/20 bg-brand/5 px-3.5 py-3 text-sm leading-relaxed">
        <MessageCircleQuestion className="h-4 w-4 shrink-0 mt-0.5 text-brand" />
        <span>{question}</span>
      </div>
      {suggestions.length > 0 && onSuggestionClick && (
        <Suggestions>
          {suggestions.map((s, i) => (
            <Suggestion
              key={i}
              suggestion={s}
              onClick={onSuggestionClick}
              className="hover:border-brand/40 hover:bg-brand/5"
            />
          ))}
          <Suggestion
            suggestion=""
            onClick={() => onSuggestionClick("")}
            className="italic border-dashed hover:border-brand/40 hover:bg-brand/5"
          >
            {t("otherOption")}
          </Suggestion>
        </Suggestions>
      )}
    </div>
  );
}

function ToolCallRow({
  item,
  t,
  shimmer = false,
}: {
  item: ToolCallItem;
  t: TranslateFn;
  /** Effet shimmer sur le label (action actuellement en cours, tête vivante). */
  shimmer?: boolean;
}) {
  const { Icon, label } = getToolView(item, t);
  const isRunning = item.status === "running";
  const isError = item.status === "complete" && item.success === false;

  return (
    <div
      className={cn(
        "flex items-center gap-2 py-0.5 text-xs",
        isError ? "text-destructive" : "text-muted-foreground"
      )}
    >
      <Icon className="h-3 w-3 shrink-0" />
      <span className={cn("flex-1 truncate", shimmer && "text-shimmer")}>{label}</span>
      {isRunning ? (
        <Loader2 className="h-3 w-3 shrink-0 animate-spin opacity-70" />
      ) : isError ? (
        <X className="h-3 w-3 shrink-0" />
      ) : null}
    </div>
  );
}

export function ToolCallList({ items, onSuggestionClick, isLatest = false }: ToolCallListProps) {
  const t = useTranslations("ToolCall");
  const [expanded, setExpanded] = useState(false);

  if (items.length === 0) return null;

  // ask_user (complete) renders as an interactive callout outside the list.
  const askUserCallouts = items.filter(
    (i) => i.name === "ask_user" && i.status === "complete"
  );
  const calloutIds = new Set(askUserCallouts.map((i) => i.id));
  const rowItems = items.filter((i) => !calloutIds.has(i.id));

  const renderRows = () => {
    if (rowItems.length === 0) return null;

    if (rowItems.length === 1) {
      // Action unique : shimmer si elle est en cours ET tête vivante.
      return (
        <ToolCallRow
          item={rowItems[0]}
          t={t}
          shimmer={isLatest && rowItems[0].status === "running"}
        />
      );
    }

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
            <span className="flex-1 truncate">
              {t("toolCallSummary", { count: rowItems.length })}
            </span>
            {anyRunning ? (
              <Loader2 className="h-3 w-3 shrink-0 animate-spin opacity-70" />
            ) : null}
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
    // tant que c'est la tête vivante de la conversation (isLatest, hors erreur).
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
        <span
          className={cn(
            "flex-1 truncate",
            // Shimmer si l'action affichée (la dernière) est actuellement en cours.
            isLatest && lastItem.status === "running" && "text-shimmer"
          )}
        >
          {lastLabel}
        </span>
        {anyRunning ? (
          <Loader2 className="h-3 w-3 shrink-0 animate-spin opacity-70" />
        ) : lastError ? (
          <X className="h-3 w-3 shrink-0" />
        ) : null}
      </Button>
    );
  };

  return (
    <div className="flex w-full flex-col gap-1.5">
      {renderRows()}
      {askUserCallouts.map((item) => (
        <AskUserCallout
          key={item.id}
          item={item}
          onSuggestionClick={onSuggestionClick}
          t={t}
        />
      ))}
    </div>
  );
}
