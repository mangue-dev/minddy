"use client";

// Options of the palette's inline edit forms (MIN-820). Each field reads like
// the board's own picker for it: the same glyph, color, order and "Not set"
// wording, so a value looks the same in ⌘; as on the card it edits.
//
// `current` checks the ticket's value (`selected`); bulk forms leave it out,
// a selection having no single value.

import { HugeiconsIcon } from "@hugeicons/react";
import { CancelCircleIcon, GlobeIcon, LockIcon, Target01Icon, TriangleIcon, UserCircleIcon } from "@hugeicons/core-free-icons";
import { Dot } from "@/components/ui/color-dot";
import { ObjectiveStatusIndicator, PriorityIndicator, StatusIndicator } from "@/components/issue-indicators";
import { FEEDBACK_POST_STATUSES, FEEDBACK_TO_ISSUE_STATUS, type FeedbackPostStatus } from "@/lib/feedback/types";
import { OBJECTIVE_STATUSES } from "@/lib/objective-constants";
import { ObjectivePill } from "@/components/objective-label";
import { UserAvatar } from "@/components/user-avatar";
import { SMART_ASSIGN_ICON } from "@/components/feature-icons";
import { displayName } from "@/lib/display-name";
import {
  ALL_STATUSES,
  EFFORTS,
  PRIORITIES,
  type IssueEffort,
  type IssuePriority,
  type IssueStatus,
} from "@/lib/issue-constants";
import type { FormSelectOption } from "@/lib/command-palette/registry/types";
import type { ObjectiveStatus } from "@/lib/objective-validation";
import type { Category, Member } from "@/lib/types";

/** Value of the clear option of the nullable fields. */
export const PALETTE_NONE = "__none__";

/** No `current` (bulk): nothing is marked. */
type Current<T> = { current?: T };

function mark<T>(options: Current<T>, value: T): boolean {
  return "current" in options && options.current === value;
}

export function statusOptions(
  label: (status: IssueStatus) => string,
  options: Current<IssueStatus> = {}
): FormSelectOption[] {
  return ALL_STATUSES.map((s) => ({
    value: s.value,
    label: label(s.value),
    icon: <StatusIndicator status={s.value} className="size-4" />,
    selected: mark(options, s.value),
  }));
}

/** "none" is the first rung of the scale and reads "Not set" (`Priority.none`). */
export function priorityOptions(
  label: (priority: IssuePriority) => string,
  options: Current<IssuePriority> = {}
): FormSelectOption[] {
  return PRIORITIES.map((p) => ({
    value: p.value,
    label: label(p.value),
    icon: <PriorityIndicator priority={p.value} className="size-4" />,
    selected: mark(options, p.value),
  }));
}

/** The card's effort glyph: a triangle, dimmed while the effort is not set. */
export function effortOptions(
  noneLabel: string,
  options: Current<IssueEffort | null> = {}
): FormSelectOption[] {
  return [
    {
      value: PALETTE_NONE,
      label: noneLabel,
      icon: <HugeiconsIcon icon={TriangleIcon} className="size-4 opacity-60" />,
      selected: mark(options, null),
    },
    ...EFFORTS.map((e) => ({
      value: e.value,
      label: e.label,
      icon: <HugeiconsIcon icon={TriangleIcon} className="size-4" />,
      selected: mark<IssueEffort | null>(options, e.value),
    })),
  ];
}

/** Members with their avatar; the clear option carries the Smart Assign glyph
    when Smart Assign fills an empty assignee (MIN-811). */
export function assigneeOptions(
  members: readonly Member[],
  none: { label: string; smartAssign?: boolean },
  options: Current<string | null> = {}
): FormSelectOption[] {
  return [
    {
      value: PALETTE_NONE,
      label: none.label,
      icon: none.smartAssign ? (
        <HugeiconsIcon icon={SMART_ASSIGN_ICON} strokeWidth={1.75} className="size-4" />
      ) : (
        <HugeiconsIcon icon={UserCircleIcon} className="size-4 opacity-60" />
      ),
      selected: mark(options, null),
    },
    ...members.map((m) => ({
      value: m.user_id,
      label: displayName(m),
      icon: <UserAvatar seed={m.avatar_seed} className="size-4" />,
      selected: mark<string | null>(options, m.user_id),
    })),
  ];
}

interface PaletteObjective {
  id: string;
  name: string;
  color: string | null;
  status?: ObjectiveStatus;
}

/** Objectives as their colored pill, in the order they are given — the
    caller passes them in picker order (lib/objective-order.ts). */
export function objectiveOptions(
  objectives: readonly PaletteObjective[],
  noneLabel: string,
  options: Current<string | null> = {}
): FormSelectOption[] {
  return [
    {
      value: PALETTE_NONE,
      label: noneLabel,
      icon: <HugeiconsIcon icon={Target01Icon} className="size-4 opacity-60" />,
      selected: mark(options, null),
    },
    ...objectives.map((objective) => ({
      value: objective.id,
      label: objective.name,
      labelNode: <ObjectivePill objective={objective} />,
      selected: mark<string | null>(options, objective.id),
    })),
  ];
}

/** Categories with their color dot, in the project's settings order (the
    lists are read ordered by `position`). `current` marks every category the
    ticket already has: choosing one toggles it. */
export function categoryOptions(
  categories: readonly Pick<Category, "id" | "name" | "color">[],
  current?: readonly string[]
): FormSelectOption[] {
  return categories.map((category) => ({
    value: category.id,
    label: category.name,
    icon: <Dot color={category.color} />,
    selected: current?.includes(category.id) ?? false,
  }));
}

/** The ticket's categories after choosing `categoryId`: added, or removed when
    it already had it. */
export function toggleCategory(categoryIds: readonly string[], categoryId: string): string[] {
  return categoryIds.includes(categoryId)
    ? categoryIds.filter((id) => id !== categoryId)
    : [...categoryIds, categoryId];
}

/** The value every selected record shares, for the bulk selects' checkmark;
    `{}` (nothing marked) when they differ. */
export function sharedCurrent<T, V>(items: readonly T[], value: (item: T) => V): Current<V> {
  if (items.length === 0) return {};
  const first = value(items[0]);
  return items.every((item) => value(item) === first) ? { current: first } : {};
}

/** Feedback statuses with the glyph the board and the row menu show: the
    issue status each one mirrors, and a ban for spam. */
export function feedbackStatusOptions(
  label: (status: FeedbackPostStatus) => string,
  options: Current<FeedbackPostStatus> = {}
): FormSelectOption[] {
  return FEEDBACK_POST_STATUSES.map((status) => ({
    value: status,
    label: label(status),
    icon: status === "spam"
      ? <HugeiconsIcon icon={CancelCircleIcon} className="size-4" />
      : <StatusIndicator status={FEEDBACK_TO_ISSUE_STATUS[status]} className="size-4" />,
    selected: mark(options, status),
  }));
}

/** Objective statuses with their glyph (MIN-785). */
export function objectiveStatusOptions(
  label: (status: ObjectiveStatus) => string,
  options: Current<ObjectiveStatus> = {}
): FormSelectOption[] {
  return OBJECTIVE_STATUSES.map((status) => ({
    value: status.value,
    label: label(status.value),
    icon: <ObjectiveStatusIndicator status={status.value} className="size-4" />,
    selected: mark(options, status.value),
  }));
}

/** A feedback post's visibility on the public board: "public" or "private". */
export function visibilityOptions(
  labels: { public: string; private: string },
  options: Current<boolean> = {}
): FormSelectOption[] {
  return [
    {
      value: "public",
      label: labels.public,
      icon: <HugeiconsIcon icon={GlobeIcon} className="size-4" />,
      selected: mark(options, true),
    },
    {
      value: "private",
      label: labels.private,
      icon: <HugeiconsIcon icon={LockIcon} className="size-4" />,
      selected: mark(options, false),
    },
  ];
}

/** The palette colors with their dot, after a "no color" choice. */
export function colorOptions(
  colors: readonly string[],
  labels: { none: string; color: (hex: string) => string },
  options: Current<string | null> = {}
): FormSelectOption[] {
  return [
    {
      value: PALETTE_NONE,
      label: labels.none,
      icon: <Dot color={null} />,
      selected: mark(options, null),
    },
    ...colors.map((hex) => ({
      value: hex,
      label: labels.color(hex),
      icon: <Dot color={hex} />,
      selected: mark<string | null>(options, hex),
    })),
  ];
}
