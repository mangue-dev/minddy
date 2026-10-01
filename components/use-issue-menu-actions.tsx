"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowRight01Icon, DateTimeIcon, Delete02Icon, ExternalLinkIcon, GitPullRequestIcon, Link02Icon, LinkBackwardIcon, Target01Icon } from "@hugeicons/core-free-icons";
import { RelationIcon } from "@/components/issue-indicators";
import { KEY_FOR_FIELD, type ShortcutField } from "@/components/issue-field-shortcuts";
import type { ContextMenuAction } from "@/components/issue-context-menu";
import { useOptionalAppTabSession } from "@/lib/app-tabs-context";
import { useUnlinkPullRequestIssue } from "@/lib/use-unlink-pull-request-issue";
import { issueIdentifier } from "@/lib/issue-constants";
import { RELATION_TYPES } from "@/lib/relation-constants";
import type { IssuePr } from "@/lib/agent-api";
import type { Issue, IssueRelationType } from "@/lib/types";

export interface IssueMenuOptions {
  issue: Issue;
  projectKey: string;
  agentActions: ContextMenuAction[];
  pr: IssuePr | null;
  hasObjectives: boolean;
  onSelectRelation?: (type: IssueRelationType) => void;
  onOpenField: (field: ShortcutField) => void;
  extraActions?: ContextMenuAction[];
  onDelete?: () => void;
}

/** One action factory for card context menus and sidebar More menus. */
export function useIssueMenuActions() {
  const t = useTranslations("IssueUI");
  const tAgent = useTranslations("Agent");
  const tRel = useTranslations("Relations");
  const tCommon = useTranslations("Common");
  const tAction = useTranslations("CommandPaletteActions");
  const tPr = useTranslations("PullRequests");
  const router = useRouter();
  const appTabs = useOptionalAppTabSession();
  const { isPending, mutate } = useUnlinkPullRequestIssue();

  return useCallback(({
    issue, projectKey, agentActions, pr, hasObjectives, onSelectRelation,
    onOpenField, extraActions = [], onDelete,
  }: IssueMenuOptions): ContextMenuAction[] => {
    const identifier = issueIdentifier(projectKey, issue.number);
    return [
      ...agentActions,
      // Open pull request — only offered when a PR exists for the ticket.
      ...(pr
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
                  onSelect: () => router.push(`/pull-requests?pr=${pr.prId}`),
                },
                {
                  id: "open-pr-new-tab",
                  label: tAction("openInNewTab"),
                  icon: <HugeiconsIcon icon={ExternalLinkIcon} className="size-4" />,
                  onSelect: () => {
                    const href = `/pull-requests?pr=${pr.prId}`;
                    if (appTabs) void appTabs.create(href);
                    else window.open(href, "_blank", "noopener,noreferrer");
                  },
                },
              ],
            },
          ]
        : []),
      ...(pr ? [{
        id: "unlink-pr",
        label: tPr("unlinkIssue"),
        keywords: ["unlink", "detach", "pull request", "pr"],
        icon: <HugeiconsIcon icon={LinkBackwardIcon} className="size-4" />,
        disabled: isPending,
        onSelect: () => mutate({ prId: pr.prId, issueId: issue.id, identifier }),
      }] : []),
      ...(onSelectRelation
        ? [
            {
              id: "relations",
              label: tRel("relations"),
              keywords: ["relation", "link", "lier", "bloc", "block"],
              icon: <HugeiconsIcon icon={Link02Icon} className="size-4" />,
              children: RELATION_TYPES.map((type) => ({
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
              icon: <HugeiconsIcon icon={DateTimeIcon} className="size-4" />,
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
  }, [t, tAgent, tRel, tCommon, tAction, tPr, router, appTabs, isPending, mutate]);
}
