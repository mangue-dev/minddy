"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { Cancel01Icon, CommandIcon } from "@hugeicons/core-free-icons";
import { useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { AnimatePresence, motion, useIsPresent, useReducedMotion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import { TRASH_RETENTION_DAYS } from "@/lib/trash-retention";
import { Kbd } from "@/components/ui/kbd";
import { NumoIcon } from "@/components/numo-icon";
import {
  useBulkActions,
  type BulkCycleActions,
  type BulkPullRequestLinks,
} from "@/lib/bulk-actions-context";
import { useIssuePrStore } from "@/components/issue-pr-context";
import { useQueryClient } from "@tanstack/react-query";
import { linkablePullRequests } from "@/components/pull-requests/pr-link-target-picker";
import { allPullRequestsQueryOptions } from "@/lib/use-agent-runs";
import type { PullRequestListItem } from "@/lib/agent-api";
import { bulkPullRequestLinks } from "@/lib/bulk-pull-request-links";
import { useUndoHistory } from "@/lib/undo/undo-context";
import { useLinkIssuesToPullRequest, useUnlinkIssuesFromPullRequests } from "@/lib/use-link-issues-to-pull-request";
import type { IssueUpdateInput, Member, Objective } from "@/lib/types";
import { ProjectsContext } from "@/lib/projects-context-store";
import { useIssueSelection } from "@/lib/issue-selection-context";
import { smartAssignFillsEmptyAssignee } from "@/lib/smart-assign-config";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/**
 * Hosts the selection pill inside the content pane, so it floats within the
 * rounded card instead of straddling its bottom edge, and keeps it mounted
 * through its exit animation. Callers render the pill conditionally inside it.
 */
export function BulkIssueActionsPresence({ children }: { children: ReactNode }) {
  const anchor = useRef<HTMLSpanElement>(null);
  // Same anchor as the content toaster: the pane wraps <main>, and scrolling
  // never moves what is portaled next to it.
  const [pane, setPane] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => {
    setPane(anchor.current?.closest("main")?.parentElement ?? null);
  }, []);
  const presence = <AnimatePresence>{children}</AnimatePresence>;
  return (
    <>
      <span ref={anchor} hidden />
      {pane ? createPortal(presence, pane) : presence}
    </>
  );
}

/**
 * Linear-style floating selection pill (MIN-75). It no longer carries its own
 * cmdk dropdown: "Actions" hands the selection to the global command palette
 * (⌘K) via {@link useBulkActions}, so bulk edits reuse the palette's inline
 * submenu forms (one "Change Status" that opens a select, etc.). The pill
 * keeps only the fast paths: the count, Actions, an icon-only "Ask Numo", and
 * clear.
 */
export function BulkIssueActions({
  count,
  members,
  onUpdate,
  onDelete,
  onClear,
  onAskNumo,
  onCopyPrompt,
  cycle,
  objectives,
  onLink,
  issues,
  surface,
}: {
  count: number;
  members: Member[];
  onUpdate: (patch: IssueUpdateInput) => void;
  onDelete?: () => void;
  onClear: () => void;
  onAskNumo: () => void;
  /** Combined prompt of the selection — copied (⇧P) and offered as a palette
      row (MIN-539). */
  onCopyPrompt?: () => void;
  cycle?: BulkCycleActions;
  objectives?: Objective[];
  onLink?: () => void;
  /** The selected tickets, for the pull request links and Smart Assign.
      Absent: no pull request link offered. */
  issues?: ReadonlyArray<{ id: string; project_id: string; status?: string }>;
  /** The screen from which the selection starts, for analytics (“board” default). */
  surface?: string;
}) {
  const t = useTranslations("BulkActions");
  const tCommon = useTranslations("Common");
  // The palette's "Move to trash" row only opens this dialog: the selection
  // reaches the trash once the user confirms it here (MIN-743).
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const requestDelete = onDelete ? () => setConfirmDeleteOpen(true) : undefined;
  // Same for unlinking the selection from all its pull requests.
  const tPr = useTranslations("PullRequests");
  const [pendingUnlink, setPendingUnlink] = useState<{ count: number; run: () => void } | null>(null);
  const { requestBulkActions } = useBulkActions();
  // An exiting pill no longer offers the right-click trash entry.
  const present = useIsPresent();
  // Each bulk action is one gesture: ⌘Z undoes it for the whole selection,
  // not one issue per keystroke (MIN-795).
  const { linked } = useUndoHistory();

  // Cross-project boards flatten every project's members, so the same person can
  // appear once per shared project — de-dupe by user id (also fixes the React
  // duplicate-key warning the assignee list used to throw).
  const uniqueMembers = useMemo(() => {
    const seen = new Set<string>();
    return members.filter((m) => {
      if (seen.has(m.user_id)) return false;
      seen.add(m.user_id);
      return true;
    });
  }, [members]);

  // The palette's clear option names Smart Assign only when it fills every
  // selected ticket's empty assignee — the card's rule, applied to each.
  const projects = useContext(ProjectsContext)?.projects;
  const smartAssign =
    !!issues?.length &&
    issues.every((issue) =>
      smartAssignFillsEmptyAssignee(
        projects?.find((project) => project.id === issue.project_id)?.smart_assign_enabled,
        issue.status
      )
    );

  const prStore = useIssuePrStore();
  const queryClient = useQueryClient();
  const selectionProject = issues && new Set(issues.map((issue) => issue.project_id)).size === 1
    ? issues[0].project_id
    : null;
  // The open pull requests are read when the actions open (or on hover of
  // Actions), never just because tickets are selected.
  const openPullRequestsQuery = { ...allPullRequestsQueryOptions("open"), staleTime: 30_000 };
  const readOpenPullRequests = async (): Promise<PullRequestListItem[]> => {
    if (!issues?.length) return [];
    try {
      const data = await queryClient.fetchQuery(openPullRequestsQuery);
      return linkablePullRequests(data.pullRequests, selectionProject);
    } catch {
      return [];
    }
  };
  const warmPullRequests = () => {
    if (issues?.length) void queryClient.prefetchQuery(openPullRequestsQuery);
  };
  const linkIssuesToPullRequest = useLinkIssuesToPullRequest();
  const unlinkIssuesFromPullRequests = useUnlinkIssuesFromPullRequests();

  const pullRequestLinks = (openPullRequests: PullRequestListItem[]): BulkPullRequestLinks | undefined => {
    if (!issues?.length) return undefined;
    const links = bulkPullRequestLinks(issues, prStore.get, openPullRequests, prStore.linkedPullRequestIds);
    if (links.options.length === 0 && links.partial.length === 0 && links.unlinkable.length === 0) return undefined;
    return {
      options: links.options,
      partial: links.partial,
      onLink: (pr) => void linkIssuesToPullRequest(links.targets(pr.prId), pr),
      unlinkCount: links.unlinkable.length,
      onUnlinkAll: () =>
        setPendingUnlink({
          count: links.unlinkable.length,
          run: () => void unlinkIssuesFromPullRequests(links.unlinkable),
        }),
    };
  };

  const openActions = async () => {
    const openPullRequests = await readOpenPullRequests();
    requestBulkActions({
      count,
      surface,
      members: uniqueMembers,
      smartAssign,
      onUpdate: (patch) => linked(() => onUpdate(patch)),
      onDelete: requestDelete,
      onAskNumo,
      onCopyPrompt,
      cycle: cycle && {
        ...cycle,
        onAdd: () => linked(cycle.onAdd),
        onRemove: () => linked(cycle.onRemove),
      },
      objectives,
      onLink,
      pullRequestLinks: pullRequestLinks(openPullRequests),
    });
  };

  // A right-click on a selected card offers the same trash entry, behind the
  // same confirmation (lib/issue-selection-context.tsx).
  const { registerRequestDelete } = useIssueSelection();
  const canDelete = !!onDelete;
  useEffect(() => {
    if (!present || !canDelete) return;
    registerRequestDelete(() => setConfirmDeleteOpen(true));
    return () => registerRequestDelete(null);
  }, [registerRequestDelete, present, canDelete]);

  return (
    <SelectionPill
      label={t("selected", { count })}
      onActions={openActions}
      onWarmActions={warmPullRequests}
      onAskNumo={onAskNumo}
      onClear={onClear}
    >
      {onDelete && (
        <ConfirmDeleteDialog
          open={confirmDeleteOpen}
          onOpenChange={setConfirmDeleteOpen}
          title={t("deleteConfirm", { count })}
          description={t("deleteConfirmDescription", { days: TRASH_RETENTION_DAYS })}
          confirmLabel={tCommon("moveToTrash")}
          cancelLabel={tCommon("cancel")}
          onConfirm={() => linked(onDelete)}
        />
      )}
      <ConfirmDeleteDialog
        open={pendingUnlink !== null}
        onOpenChange={(open) => {
          if (!open) setPendingUnlink(null);
        }}
        title={tPr("unlinkFromPullRequestsTitle", { count: pendingUnlink?.count ?? 0 })}
        description={tPr("unlinkFromPullRequestsDescription")}
        confirmLabel={tPr("unlinkIssue")}
        cancelLabel={tCommon("cancel")}
        onConfirm={() => pendingUnlink?.run()}
      />
    </SelectionPill>
  );
}

/**
 * The floating pill of every multi-selection (MIN-75, MIN-873): the count,
 * "Actions" (which hands the selection to ⌘K), an icon-only "Ask Numo" and
 * clear. While it is mounted, ⌘K opens the selection's actions instead of the
 * search palette. Dialogs the actions open go in `children`.
 */
export function SelectionPill({
  label,
  onActions,
  onWarmActions,
  onAskNumo,
  onClear,
  children,
}: {
  /** "3 issues selected". */
  label: string;
  onActions: () => void | Promise<void>;
  /** Hover or focus of "Actions": warms what the actions will read. */
  onWarmActions?: () => void;
  onAskNumo: () => void;
  onClear: () => void;
  children?: ReactNode;
}) {
  const t = useTranslations("BulkActions");
  const { registerSelectionActions } = useBulkActions();
  const reducedMotion = useReducedMotion();
  // An exiting pill still shows the last count, but no longer owns ⌘K.
  const present = useIsPresent();

  // ⌘K while something is selected opens these actions, not the search
  // palette: the pill hands its latest gesture to the launcher for as long as
  // it lives.
  const openActionsRef = useRef(onActions);
  openActionsRef.current = onActions;
  useEffect(() => {
    if (!present) return;
    registerSelectionActions(() => void openActionsRef.current());
    return () => registerSelectionActions(null);
  }, [registerSelectionActions, present]);

  // No `backdrop-blur`: `bg-background/95` already completely hides the background,
  // the blur was not visible and cost a composition layer (MIN-323).
  return (
    // Absolute inside the pane (see BulkIssueActionsPresence). Tailwind's
    // `translate` composes with motion's `transform`, so the centering
    // survives the animation.
    <motion.div
      data-bulk-issue-actions
      className="absolute bottom-4 app-mobile:bottom-[var(--mobile-nav-clearance)] left-1/2 z-40 flex -translate-x-1/2 items-center gap-1 rounded-full border border-border bg-background/95 p-1.5 shadow-xl app-mobile:max-w-[calc(100%-2rem)]"
      initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.96 }}
      transition={{ type: "spring", duration: 0.28, bounce: 0.15 }}
    >
      <span className="min-w-0 px-3 text-sm font-medium whitespace-nowrap app-mobile:truncate app-mobile:px-1">
        {label}
      </span>
      <Button
        type="button"
        size="sm"
        className="h-8 gap-1.5 rounded-full px-3 text-xs"
        onClick={() => void onActions()}
        onPointerEnter={onWarmActions}
        onFocus={onWarmActions}
      >
        <HugeiconsIcon icon={CommandIcon} className="size-3.5" />
        {t("actions")}
      </Button>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8 rounded-full"
            onClick={onAskNumo}
            aria-label={t("askNumo")}
          >
            <NumoIcon className="size-4" />
          </Button>
        </TooltipTrigger>
        {/* The shortcut is discovered where the action lives (MIN-105). */}
        <TooltipContent className="flex items-center gap-1.5">
          {t("askNumo")}
          <Kbd size="sm">@</Kbd>
        </TooltipContent>
      </Tooltip>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-8 rounded-full"
        onClick={onClear}
        aria-label={t("clear")}
      >
        <HugeiconsIcon icon={Cancel01Icon} className="size-4" />
      </Button>
      {children}
    </motion.div>
  );
}
