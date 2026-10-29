"use client";

// Rows of the palette's content pickers (MIN-844), drawn like the palette's
// own search rows so a picked issue looks the same as a found one: status
// icon and title with the identifier as context, an objective's status and
// name in its color, a pull request's number, a page's icon.

import { HugeiconsIcon } from "@hugeicons/react";
import { File02Icon, GitMergeIcon, GitPullRequestDraftIcon, GitPullRequestIcon } from "@hugeicons/core-free-icons";
import { useMemo, useRef, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Spinner } from "@/components/ui/spinner";
import { ObjectiveStatusIndicator, StatusIndicator } from "@/components/issue-indicators";
import { OBJECTIVE_TEXT, objectiveTextStyle } from "@/components/objective-label";
import type { PaletteItem } from "@/lib/command-palette/types";
import { issueIdentifier } from "@/lib/issue-constants";
import { isHierarchyRelation, type RelationMenuKind } from "@/lib/issue-hierarchy";
import { issueSearchTier, orderIssuesForSearch } from "@/lib/issue-search-order";
import { usePalettePicker, type PalettePickerRequest } from "@/lib/palette-picker";
import type { PullRequestListItem } from "@/lib/agent-api";
import type { IssueStatus } from "@/lib/issue-constants";
import { useOrderedObjectives } from "@/lib/use-ordered-objectives";
import type { Objective } from "@/lib/types";

/** What an issue row needs, whichever cache the issue comes from. */
export interface PickerIssue {
  id: string;
  number: number;
  title: string;
  status: IssueStatus;
}

/** A row's choice. Return false to keep the palette open (next step). */
type Pick = () => void | false;

/**
 * An issue row. Its id is the palette's issue id, so the issues found by
 * meaning resolve to it; work under way ranks first and the typed identifier
 * before everything (MIN-726).
 */
export function issuePickerRow(issue: PickerIssue, projectKey: string, category: string, pick: Pick): PaletteItem {
  const identifier = issueIdentifier(projectKey, issue.number);
  return {
    id: `issue-${issue.id}`,
    title: issue.title,
    icon: <StatusIndicator status={issue.status} className="size-4" />,
    contextLabel: identifier,
    keywords: [identifier],
    exactKeywords: [identifier, String(issue.number)],
    searchTier: issueSearchTier(issue.status),
    filterCategory: category,
    entityType: "issue",
    execute: pick,
  };
}

export function objectivePickerRow(objective: Objective, category: string, pick: Pick): PaletteItem {
  return {
    id: `objective-${objective.id}`,
    title: objective.name,
    icon: <ObjectiveStatusIndicator status={objective.status} className="size-4" />,
    titleClassName: OBJECTIVE_TEXT,
    titleStyle: objectiveTextStyle(objective.color),
    filterCategory: category,
    entityType: "objective",
    execute: pick,
  };
}

export function pullRequestPickerRow(pr: PullRequestListItem, category: string, pick: Pick): PaletteItem {
  const number = `#${pr.pr_number}`;
  const icon = pr.pr_state === "merged" ? GitMergeIcon : pr.pr_state === "draft" ? GitPullRequestDraftIcon : GitPullRequestIcon;
  return {
    id: `pull-request-${pr.prId}`,
    title: pr.title || pr.head_branch || number,
    icon: <HugeiconsIcon icon={icon} className="size-4" />,
    contextLabel: number,
    keywords: [number, String(pr.pr_number), pr.head_branch ?? ""].filter(Boolean),
    exactKeywords: [number, String(pr.pr_number)],
    filterCategory: category,
    entityType: "pull-request",
    execute: pick,
  };
}

export function pagePickerRow(
  page: { id: string; title: string; icon: string | null },
  untitled: string,
  category: string,
  pick: Pick,
): PaletteItem {
  return {
    id: `page-${page.id}`,
    title: page.title.trim() || untitled,
    icon: page.icon
      ? <span className="flex size-4 items-center justify-center text-sm leading-none">{page.icon}</span>
      : <HugeiconsIcon icon={File02Icon} className="size-4" />,
    filterCategory: category,
    entityType: "page",
    execute: pick,
  };
}

/** The status line of a picker whose rows are still loading. */
export function PickerLoading({ label }: { label: string }): ReactNode {
  return (
    <span role="status" className="flex items-center gap-2">
      <Spinner className="size-3.5" />
      {label}
    </span>
  );
}

export interface RelationPickerOptions {
  /** Distinguishes this surface's steps from another surface's. */
  scope: string;
  /** The relation chosen in the surface's own type dropdown. */
  step: RelationMenuKind;
  /** Eligible issues for `step`, already filtered and ordered. */
  issues: readonly PickerIssue[];
  /** Eligible objectives for `step` (none for a hierarchy entry). */
  objectives: readonly Objective[];
  projectKey: string;
  /** Project searched by meaning for issues. */
  projectId: string | null;
  loading?: boolean;
  onPickIssue: (type: RelationMenuKind, issueId: string, issue: PickerIssue) => void;
  onPickObjective: (type: RelationMenuKind, objectiveId: string, objective: Objective) => void;
  onClose: () => void;
}

/** The translated words of the relation picker. */
export interface RelationPickerLabels {
  issues: string;
  objectives: string;
  loading: string;
  /** The question of the chosen relation ("Blocking which issue or objective?"). */
  pick: (type: RelationMenuKind) => string;
}

/**
 * The relation picker's request: the issues and objectives that may take the
 * relation chosen in the surface's type dropdown. The type itself is never a
 * palette step: the palette lists content only. Pure, for the hook below and
 * its tests.
 */
export function relationPickerRequest(
  options: RelationPickerOptions,
  labels: RelationPickerLabels,
): PalettePickerRequest {
  const { scope, step, onClose } = options;
  // A hierarchy entry (parent of, sub-issue of) links issues only (MIN-804).
  const objectiveRows = isHierarchyRelation(step) ? [] : options.objectives.map((objective) =>
    objectivePickerRow(objective, "relation-objectives", () => {
      options.onPickObjective(step, objective.id, objective);
    }));
  return {
    key: `${scope}:${step}`,
    placeholder: labels.pick(step),
    categories: [
      { id: "relation-issues", label: labels.issues },
      { id: "relation-objectives", label: labels.objectives },
    ],
    items: [
      ...options.issues.map((issue) =>
        issuePickerRow(issue, options.projectKey, "relation-issues", () => {
          options.onPickIssue(step, issue.id, issue);
        })),
      ...objectiveRows,
    ],
    semanticProjectId: options.projectId,
    status: options.loading ? <PickerLoading label={labels.loading} /> : undefined,
    onClose,
  };
}

/**
 * The relation picker of every surface (card, side panel, objective, creation
 * dialog), once its type dropdown chose the relation. Null shows nothing.
 */
export function useRelationPalettePicker(options: RelationPickerOptions | null): void {
  const t = useTranslations("Relations");
  const tIssue = useTranslations("Issue");
  const tCommon = useTranslations("Common");
  const labels = useMemo<RelationPickerLabels>(() => ({
    issues: tIssue("entityPlural"),
    objectives: t("objectives"),
    loading: tCommon("loading"),
    pick: (type) => t(`pick_${type}`),
  }), [t, tIssue, tCommon]);
  // The handlers change on every render of their surface; the rows read the
  // latest ones, so the request only changes with the data it shows.
  const handlers = useRef(options);
  handlers.current = options;

  const scope = options?.scope ?? "";
  const step = options?.step;
  const issues = options?.issues;
  const objectives = options?.objectives;
  const projectKey = options?.projectKey ?? "";
  const projectId = options?.projectId ?? null;
  const loading = options?.loading ?? false;

  const request = useMemo<PalettePickerRequest | null>(() => step ? relationPickerRequest({
    scope, step, projectKey, projectId, loading,
    issues: issues ?? [],
    objectives: objectives ?? [],
    onPickIssue: (type, issueId, issue) => handlers.current?.onPickIssue(type, issueId, issue),
    onPickObjective: (type, objectiveId, objective) => handlers.current?.onPickObjective(type, objectiveId, objective),
    onClose: () => handlers.current?.onClose(),
  }, labels) : null, [scope, step, issues, objectives, projectKey, projectId, loading, labels]);

  usePalettePicker(request);
}

/**
 * The relation picker for surfaces whose candidates are not ordered yet (a
 * board card, the side panel's right-click entry): work under way first
 * (MIN-726), objectives in picker order (MIN-785). Mounted only while open,
 * so a board's cards do not each order the project's objectives.
 */
export function RelationPalettePicker(options: RelationPickerOptions): null {
  const objectives = useOrderedObjectives(options.objectives);
  const issues = useMemo(() => orderIssuesForSearch(options.issues, (issue) => issue.status), [options.issues]);
  useRelationPalettePicker({ ...options, issues, objectives });
  return null;
}
