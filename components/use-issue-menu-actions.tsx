"use client";

import { useCallback } from "react";
import { useAppRouter } from "@/lib/use-app-router";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowRight01Icon, Copy01Icon, Delete02Icon, LinkSquare01Icon, GitPullRequestIcon, Link02Icon, Cancel01Icon, Target01Icon } from "@hugeicons/core-free-icons";
import { RelationIcon } from "@/components/issue-indicators";
import { KEY_FOR_FIELD, RELATION_SHORTCUT_HINT, type ShortcutField } from "@/components/issue-field-shortcuts";
import type { ContextMenuAction } from "@/components/issue-context-menu";
import { useOptionalAppTabSession } from "@/lib/app-tabs-context";
import { usePrUnlinkConfirmation } from "@/components/pull-requests/pr-unlink-confirmation";
import { issueIdentifier } from "@/lib/issue-constants";
import { RELATION_TYPES } from "@/lib/relation-constants";
import type { IssuePr } from "@/lib/agent-api";
import type { HierarchyRelation, RelationMenuKind } from "@/lib/issue-hierarchy";
import type { Issue } from "@/lib/types";
import { DATE_ICON } from "@/components/feature-icons";

export interface IssueMenuOptions {
  issue: Issue;
  projectKey: string;
  agentActions: ContextMenuAction[];
  pr: IssuePr | null;
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
  const appTabs = useOptionalAppTabSession();
  const { isPending, requestUnlink } = usePrUnlinkConfirmation();

  return useCallback(({
    issue, projectKey, agentActions, pr, hasObjectives, onSelectRelation, hierarchyRelations = [],
    onOpenField, extraActions = [], onDelete, onLinkPullRequest, readOnly = false,
  }: IssueMenuOptions): ContextMenuAction[] => {
    const identifier = issueIdentifier(projectKey, issue.number);
    const openPr: ContextMenuAction[] = pr
      ? [
          {
            id: "open-pr",
            label: tAgent("viewPullRequest"),
            keywords: [
              "pull request",
              "pr",
              "review",
              "github",
              "gitlab",
              "merge",
            ],
            icon: <HugeiconsIcon icon={GitPullRequestIcon} className="size-4" />,
            children: [
              {
                id: "open-pr-current-tab",
                label: tAction("openInCurrentTab"),
                icon: <HugeiconsIcon icon={ArrowRight01Icon} className="size-4" />,
                onSelect: () => navigate(`/pull-requests?pr=${pr.prId}`),
              },
              {
                id: "open-pr-new-tab",
                label: tAction("openInNewTab"),
                icon: <HugeiconsIcon icon={LinkSquare01Icon} className="size-4" />,
                onSelect: () => {
                  const href = `/pull-requests?pr=${pr.prId}`;
                  if (appTabs) void appTabs.create(href);
                  else window.open(href, "_blank", "noopener,noreferrer");
                },
              },
            ],
          },
        ]
      : [];
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
    if (readOnly) return [copyId, ...openPr];
    return [
      ...agentActions,
      copyId,
      // Open pull request — only offered when a PR exists for the ticket.
      ...openPr,
      ...(pr ? [{
        id: "unlink-pr",
        label: tPr("unlinkIssue"),
        keywords: ["unlink", "detach", "pull request", "pr"],
        icon: <HugeiconsIcon icon={Cancel01Icon} className="size-4" />,
        disabled: isPending,
        transfersFocus: true,
        onSelect: () => requestUnlink({ prId: pr.prId, issueId: issue.id, identifier }),
      }] : []),
      // An issue keeps at most one live pull request (the server refuses a
      // second), so the entry only shows while it has none.
      ...(onLinkPullRequest && !(pr && (pr.state === "open" || pr.state === "draft")) ? [{
        id: "link-pr",
        label: tPr("linkToPullRequest"),
        keywords: ["link", "lier", "pull request", "pr", "merge request"],
        icon: <HugeiconsIcon icon={GitPullRequestIcon} className="size-4" />,
        transfersFocus: true,
        onSelect: onLinkPullRequest,
      }] : []),
      ...(onSelectRelation
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
        : []),
      ...(!issue.objective_id && hasObjectives
        ? [
            {
              id: "set-objective",
              label: t("actionLinkObjective"),
              keywords: ["objectif", "objective", "goal", "lier", "link"],
              icon: <HugeiconsIcon icon={Target01Icon} className="size-4" />,
              shortcut: KEY_FOR_FIELD.objective,
              transfersFocus: true,
              onSelect: () => onOpenField("objective"),
            },
          ]
        : []),
      ...(!issue.due_date
        ? [
            {
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
            },
          ]
        : []),
      ...extraActions,
      ...(onDelete
        ? [
            {
              id: "delete",
              label: tCommon("moveToTrash"),
              keywords: [
                "corbeille",
                "trash",
                "supprimer",
                "delete",
                "remove",
                "archiver",
              ],
              icon: <HugeiconsIcon icon={Delete02Icon} className="size-4" />,
              separatorBefore: true,
              variant: "destructive" as const,
              transfersFocus: true,
              onSelect: () => onDelete(),
            },
          ]
        : []),
    ];
  }, [t, tAgent, tRel, tCommon, tAction, tPr, navigate, appTabs, isPending, requestUnlink]);
}
