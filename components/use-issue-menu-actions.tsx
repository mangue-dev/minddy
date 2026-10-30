"use client";

import { pullRequestHref } from "@/lib/app-urls";
import { useCallback } from "react";
import { useAppRouter } from "@/lib/use-app-router";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { HugeiconsIcon } from "@hugeicons/react";
import { Copy01Icon, Delete02Icon, LinkSquare01Icon, GitMergeIcon, GitPullRequestIcon, Link02Icon, Target01Icon, Unlink01Icon } from "@hugeicons/core-free-icons";
import { useQueryClient } from "@tanstack/react-query";
import { RelationIcon } from "@/components/issue-indicators";
import { KEY_FOR_FIELD, RELATION_SHORTCUT_HINT, type ShortcutField } from "@/components/issue-field-shortcuts";
import type { ContextMenuAction } from "@/components/issue-context-menu";
import { useOptionalAppTabSession } from "@/lib/app-tabs-context";
import { usePrUnlinkConfirmation } from "@/components/pull-requests/pr-unlink-confirmation";
import { issueIdentifier } from "@/lib/issue-constants";
import { RELATION_TYPES } from "@/lib/relation-constants";
import { maintainPullRequestApi, type IssuePr } from "@/lib/agent-api";
import type { IssuePrReadiness } from "@/lib/issue-pr-store";
import { prMenuCanMerge } from "@/lib/pr-context-menu";
import { requestPullRequestMerge } from "@/lib/pr-merge-intent";
import type { HierarchyRelation, RelationMenuKind } from "@/lib/issue-hierarchy";
import type { Issue } from "@/lib/types";
import { DATE_ICON } from "@/components/feature-icons";
import { promptSubmenu } from "@/components/agent/use-agent-menu-actions";
import type { MultiIssueAction } from "@/lib/issue-prompt";

/**
 * The right-clicked card belongs to a selection of several tickets (MIN-833):
 * the menu then acts on the whole selection.
 */
export interface IssueMenuSelection {
  count: number;
  /** How many selected tickets already have a plan — names the plan entry. */
  planned: number;
  onCopyPrompt: (action: Exclude<MultiIssueAction, "custom">) => void;
  /** Opens the custom request dialog, whose prompt covers the selection. */
  onCustomPrompt: () => void;
  onCopyIdentifiers: () => void;
  /** Live pull requests some selected tickets have and others could take. */
  pullRequests?: ReadonlyArray<{ prId: string; prNumber: number; onLink: () => void }>;
  /** Asks to move the whole selection to the trash, after confirmation. */
  onDelete?: () => void;
}

export interface IssueMenuOptions {
  issue: Issue;
  projectKey: string;
  agentActions: ContextMenuAction[];
  pr: IssuePr | null;
  /** Readiness and auto-merge state of the live PR, for its merge entries. */
  prReadiness?: IssuePrReadiness | null;
  hasObjectives: boolean;
  onSelectRelation?: (type: RelationMenuKind) => void;
  /** The parent / sub-issue entries the ticket may take (MIN-804). */
  hierarchyRelations?: readonly HierarchyRelation[];
  onOpenField: (field: ShortcutField) => void;
  extraActions?: ContextMenuAction[];
  onDelete?: () => void;
  /** Opens the picker of open pull requests to link this issue to. */
  onLinkPullRequest?: () => void;
  /** Project readers (MIN-693): only navigation survives, never a mutation. */
  readOnly?: boolean;
  /** Present when the card is part of a multi-ticket selection (MIN-833). */
  selection?: IssueMenuSelection;
}

/** One action factory for card context menus and sidebar More menus. */
export function useIssueMenuActions() {
  const router = useAppRouter();
  return useIssueMenuActionsWithNavigation(router.push);
}

/** Build card actions without subscribing every card to Next route changes. */
export function useIssueMenuActionsWithNavigation(navigate: (href: string) => void) {
  const t = useTranslations("IssueUI");
  const tAgent = useTranslations("Agent");
  const tRel = useTranslations("Relations");
  const tCommon = useTranslations("Common");
  const tAction = useTranslations("CommandPaletteActions");
  const tPr = useTranslations("PullRequests");
  const tBulk = useTranslations("BulkActions");
  const appTabs = useOptionalAppTabSession();
  const queryClient = useQueryClient();
  const { isPending, requestUnlink } = usePrUnlinkConfirmation();

  // A pull request opens in its own tab, or in the tab already showing it.
  const openPullRequest = useCallback((prId: string) => {
    const href = pullRequestHref(prId);
    if (!appTabs) navigate(href);
    else if (!appTabs.reuseDestination(href)) void appTabs.create(href);
  }, [appTabs, navigate]);

  // The Code review page's toggle (pr-detail), run from the card: the server
  // checks the viewer's rights and the repository's settings again.
  const setAutoMerge = useCallback(async (prId: string, enable: boolean) => {
    try {
      await maintainPullRequestApi(prId, enable ? "enable_auto_merge" : "disable_auto_merge");
      toast.success(enable ? tPr("autoMergeEnabledToast") : tPr("autoMergeDisabledToast"));
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      void queryClient.invalidateQueries({ queryKey: ["pull-request-readiness"] });
      void queryClient.invalidateQueries({ queryKey: ["pull-request", prId] });
    }
  }, [queryClient, tPr]);

  return useCallback(({
    issue, projectKey, agentActions, pr, prReadiness = null, hasObjectives, onSelectRelation, hierarchyRelations = [],
    onOpenField, extraActions = [], onDelete, onLinkPullRequest, readOnly = false, selection,
  }: IssueMenuOptions): ContextMenuAction[] => {
    const identifier = issueIdentifier(projectKey, issue.number);
    const trashAction = (run: (() => void) | undefined): ContextMenuAction[] => run ? [{
      id: "delete",
      label: tCommon("moveToTrash"),
      keywords: ["corbeille", "trash", "supprimer", "delete", "remove", "archiver"],
      icon: <HugeiconsIcon icon={Delete02Icon} className="size-4" />,
      separatorBefore: true,
      variant: "destructive",
      transfersFocus: true,
      onSelect: run,
    }] : [];
    const relationsAction = (): ContextMenuAction[] => onSelectRelation
      ? [
          {
            id: "relations",
            label: tRel("relations"),
            keywords: ["relation", "link", "lier", "bloc", "block"],
            icon: <HugeiconsIcon icon={Link02Icon} className="size-4" />,
            shortcut: RELATION_SHORTCUT_HINT,
            children: [...RELATION_TYPES, ...hierarchyRelations].map((type) => ({
              id: `relation-${type}`,
              label: tRel(`action_${type}`),
              keywords: [tRel(type), "relation", "link", "lier"],
              icon: <RelationIcon relation={type} className="size-4" />,
              transfersFocus: true,
              onSelect: () => onSelectRelation(type),
            })),
          },
        ]
      : [];
    const objectiveAction: ContextMenuAction = {
      id: "set-objective",
      label: t("actionLinkObjective"),
      keywords: ["objectif", "objective", "goal", "lier", "link"],
      icon: <HugeiconsIcon icon={Target01Icon} className="size-4" />,
      shortcut: KEY_FOR_FIELD.objective,
      transfersFocus: true,
      onSelect: () => onOpenField("objective"),
    };
    const dueDateAction: ContextMenuAction = {
      id: "set-due-date",
      label: t("actionSetDueDate"),
      keywords: [
        "échéance",
        "echeance",
        "date",
        "due",
        "deadline",
        "calendrier",
        "calendar",
      ],
      icon: <HugeiconsIcon icon={DATE_ICON} className="size-4" />,
      shortcut: KEY_FOR_FIELD.dueDate,
      transfersFocus: true,
      onSelect: () => onOpenField("dueDate"),
    };
    // A selection (MIN-833): the combined prompts, the identifier list, and
    // the fields its pickers write to every selected ticket (MIN-795). The
    // objective and due date stay offered whatever the anchor card holds,
    // since the other tickets may lack them. Single-ticket entries (pull
    // request, comment prompt, cycle) are left to the card alone and to the
    // selection's ⌘K actions; the trash entry acts on the whole selection.
    if (selection) {
      const { count, planned } = selection;
      const copyIdentifiers: ContextMenuAction = {
        id: "copy-identifiers",
        label: tBulk("copyIdentifiers", { count }),
        keywords: ["copy", "copier", "identifier", "identifiant", "id", "list", "liste"],
        icon: <HugeiconsIcon icon={Copy01Icon} className="size-4" />,
        onSelect: selection.onCopyIdentifiers,
      };
      const prompts = promptSubmenu({
        id: "copy-selection-prompt",
        label: tBulk("copyPrompt"),
        labels: {
          plan: planned === 0
            ? tBulk("actionWritePlans")
            : planned === count ? tBulk("actionReviewPlans") : tBulk("actionWriteOrReviewPlans"),
          implement: tBulk("actionImplement"),
          verify: tBulk("actionVerifyImplementations"),
          custom: t("actionCustomPrompt"),
        },
        onPlan: () => selection.onCopyPrompt("plan"),
        onImplement: () => selection.onCopyPrompt("implement"),
        onVerify: () => selection.onCopyPrompt("verify"),
        onCustom: selection.onCustomPrompt,
      });
      // A reader copies identifiers, never prompts — as on one ticket.
      if (readOnly) return [copyIdentifiers];
      // The selection's ⌘K row, here too: extends a pull request some
      // selected tickets have to the others of its project.
      const linkOthers = (selection.pullRequests ?? []).map((target): ContextMenuAction => ({
        id: `link-others-pr-${target.prId}`,
        label: tPr("linkOthersToPullRequest", { number: target.prNumber }),
        keywords: ["pull request", "pr", "lier", "link", `#${target.prNumber}`],
        icon: <HugeiconsIcon icon={GitPullRequestIcon} className="size-4" />,
        onSelect: target.onLink,
      }));
      return [
        prompts,
        copyIdentifiers,
        ...linkOthers,
        ...relationsAction(),
        ...(hasObjectives ? [objectiveAction] : []),
        dueDateAction,
        ...trashAction(selection.onDelete),
      ];
    }
    // An issue keeps at most one live pull request (the server refuses a
    // second), so linking is offered only while it has none.
    const linkPr: ContextMenuAction[] = onLinkPullRequest && !(pr && (pr.state === "open" || pr.state === "draft")) ? [{
      id: "link-pr",
      label: tPr("linkToPullRequest"),
      keywords: ["link", "lier", "pull request", "pr", "merge request"],
      icon: <HugeiconsIcon icon={GitPullRequestIcon} className="size-4" />,
      transfersFocus: true,
      onSelect: onLinkPullRequest,
    }] : [];
    // Everything about the linked pull request in one submenu: open it, the
    // merge gestures of the Code review page, then unlinking, set apart.
    const prMenu = (): ContextMenuAction[] => {
      if (!pr) return linkPr;
      const readiness = prReadiness?.readiness ?? null;
      const flow = prReadiness?.flow ?? null;
      const live = pr.state === "open";
      // Same rule as the page's toggle: offered while the merge must wait,
      // or to cancel it once it is set.
      const autoMerge: ContextMenuAction[] = !readOnly && live && flow?.canWrite && readiness &&
        (flow.active || (flow.autoMergeAllowed !== false && !readiness.mergeAllowed)) ? [{
        id: flow.active ? "disable-auto-merge" : "enable-auto-merge",
        label: flow.active ? tPr("disableAutoMerge") : tPr("enableAutoMerge"),
        keywords: ["auto-merge", "automatic", "automatique", "merge", "fusion"],
        icon: <HugeiconsIcon icon={GitMergeIcon} className="size-4" />,
        onSelect: () => void setAutoMerge(pr.prId, !flow.active),
      }] : [];
      // The merge itself opens the page's dialog (method, commit message,
      // Numo merge) on a fresh read, in the pull request's tab.
      const merge: ContextMenuAction[] = !readOnly && live && flow?.canWrite && prMenuCanMerge(pr.state, false, readiness) ? [{
        id: "merge-pr",
        label: tPr("merge"),
        keywords: ["merge", "fusionner", "pull request", "pr"],
        icon: <HugeiconsIcon icon={GitMergeIcon} className="size-4" />,
        transfersFocus: true,
        onSelect: () => {
          requestPullRequestMerge(pr.prId);
          openPullRequest(pr.prId);
        },
      }] : [];
      return [{
        id: "pull-request",
        label: tPr("pullRequestMenu"),
        keywords: ["pull request", "pr", "review", "github", "gitlab", "merge"],
        icon: <HugeiconsIcon icon={GitPullRequestIcon} className="size-4" />,
        children: [
          {
            id: "open-pr",
            label: tAgent("viewPullRequest"),
            keywords: ["open", "ouvrir", "view", "voir"],
            icon: <HugeiconsIcon icon={LinkSquare01Icon} className="size-4" />,
            onSelect: () => openPullRequest(pr.prId),
          },
          ...merge,
          ...autoMerge,
          ...(readOnly ? [] : linkPr),
          ...(readOnly ? [] : [{
            id: "unlink-pr",
            label: tPr("unlinkIssue"),
            keywords: ["unlink", "délier", "detach", "pull request", "pr"],
            icon: <HugeiconsIcon icon={Unlink01Icon} className="size-4" />,
            separatorBefore: true,
            variant: "destructive" as const,
            disabled: isPending,
            transfersFocus: true,
            onSelect: () => requestUnlink({ prId: pr.prId, issueId: issue.id, identifier }),
          }]),
        ],
      }];
    };
    // Right under "Copy as prompt"; a reader may copy it too, since it
    // changes nothing. Same gesture and toast as the command palette's.
    const copyId: ContextMenuAction = {
      id: "copy-identifier",
      label: tAction("copyIdentifier", { identifier }),
      keywords: ["copy", "copier", "identifier", "identifiant", "id", identifier],
      icon: <HugeiconsIcon icon={Copy01Icon} className="size-4" />,
      onSelect: () => {
        void navigator.clipboard.writeText(identifier).then(
          () => toast.success(identifier),
          () => toast.error(tPr("copyFailed")),
        );
      },
    };
    if (readOnly) return [copyId, ...(pr ? prMenu() : [])];
    return [
      ...agentActions,
      copyId,
      ...prMenu(),
      ...relationsAction(),
      ...(!issue.objective_id && hasObjectives ? [objectiveAction] : []),
      ...(!issue.due_date ? [dueDateAction] : []),
      ...extraActions,
      ...trashAction(onDelete),
    ];
  }, [t, tAgent, tRel, tCommon, tAction, tPr, tBulk, isPending, requestUnlink, openPullRequest, setAutoMerge]);
}
