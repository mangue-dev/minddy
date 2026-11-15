"use client";

// The options of each issue field, built once for every surface that lists
// them: the field pickers (card, side panel, create dialog), the hover
// shortcut menu, the right-click property menus and the ⌘; palette. A value
// therefore reads the same everywhere: same glyph, order and search terms.
// Each surface adds its own "none" entry and its own checked state.

import type { ReactNode } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { TriangleIcon } from "@hugeicons/core-free-icons";
import { Dot } from "@/components/ui/color-dot";
import { ObjectiveStatusIndicator, PriorityIndicator, StatusIndicator } from "@/components/issue-indicators";
import { ObjectiveName, ObjectivePill } from "@/components/objective-label";
import { UserAvatar } from "@/components/user-avatar";
import type { ContextMenuAction } from "@/components/issue-context-menu";
import { displayName } from "@/lib/display-name";
import {
  ALL_STATUSES,
  EFFORTS,
  PRIORITIES,
  type IssuePriority,
  type IssueStatus,
} from "@/lib/issue-constants";
import type { ObjectiveStatus } from "@/lib/objective-validation";
import type { Category, Member } from "@/lib/types";

export interface FieldOption {
  value: string;
  /** The searched and accessible text, shown unless `labelNode` is given. */
  label: string;
  icon?: ReactNode;
  labelNode?: ReactNode;
  /** Search terms beyond the label (a member's email). */
  keywords?: string[];
}

/** The effort glyph of every effort option, set or not. */
export const EFFORT_OPTION_ICON = <HugeiconsIcon icon={TriangleIcon} className="size-4 text-muted-foreground" />;

export function statusFieldOptions(label: (status: IssueStatus) => string): FieldOption[] {
  return ALL_STATUSES.map((s) => ({
    value: s.value,
    label: label(s.value),
    icon: <StatusIndicator status={s.value} className="size-4" />,
  }));
}

/** "none" is the first rung of the scale and reads "Not set" (`Priority.none`). */
export function priorityFieldOptions(label: (priority: IssuePriority) => string): FieldOption[] {
  return PRIORITIES.map((p) => ({
    value: p.value,
    label: label(p.value),
    icon: <PriorityIndicator priority={p.value} className="size-4" />,
  }));
}

export function effortFieldOptions(): FieldOption[] {
  return EFFORTS.map((e) => ({ value: e.value, label: e.label, icon: EFFORT_OPTION_ICON }));
}

/** Members with their avatar; menus use the smaller `size-4` face. */
export function memberFieldOptions(
  members: readonly Member[],
  { avatarClassName = "size-5" }: { avatarClassName?: string } = {}
): FieldOption[] {
  return members.map((m) => ({
    value: m.user_id,
    label: displayName(m),
    keywords: m.email ? [m.email] : undefined,
    icon: <UserAvatar seed={m.avatar_seed} className={avatarClassName} />,
  }));
}

/** Categories with their color dot, in the order given (the project's settings order). */
export function categoryFieldOptions(
  categories: readonly Pick<Category, "id" | "name" | "color">[]
): FieldOption[] {
  return categories.map((c) => ({ value: c.id, label: c.name, icon: <Dot color={c.color} /> }));
}

interface FieldObjective {
  id: string;
  name: string;
  color: string | null;
  status?: ObjectiveStatus;
}

/**
 * Objectives in the order given (callers pass picker order,
 * lib/objective-order.ts). Pickers and the palette show the colored pill;
 * right-click menus show the status glyph as the row icon and the name in
 * its color, like their other rows.
 */
export function objectiveFieldOptions(
  objectives: readonly FieldObjective[],
  { presentation = "pill" }: { presentation?: "pill" | "menu" } = {}
): FieldOption[] {
  return objectives.map((o) =>
    presentation === "menu"
      ? {
          value: o.id,
          label: o.name,
          labelNode: <ObjectiveName objective={o} />,
          icon: o.status ? <ObjectiveStatusIndicator status={o.status} className="size-4" /> : undefined,
        }
      : { value: o.id, label: o.name, labelNode: <ObjectivePill objective={o} /> }
  );
}

/** The ticket's categories after choosing `categoryId`: added, or removed when
    it already had it. */
export function toggleCategory(categoryIds: readonly string[], categoryId: string): string[] {
  return categoryIds.includes(categoryId)
    ? categoryIds.filter((id) => id !== categoryId)
    : [...categoryIds, categoryId];
}

/** Field options as the entries of a property submenu. */
export function fieldMenuChildren(
  idPrefix: string,
  options: readonly FieldOption[],
  {
    isChecked,
    onSelect,
    keepOpen,
  }: {
    isChecked: (value: string) => boolean;
    onSelect: (value: string) => void;
    /** Several values can apply (categories): selecting keeps the menu open. */
    keepOpen?: boolean;
  }
): ContextMenuAction[] {
  return options.map((o) => ({
    id: `${idPrefix}-${o.value}`,
    label: o.label,
    labelNode: o.labelNode,
    keywords: o.keywords,
    icon: o.icon,
    checked: isChecked(o.value),
    ...(keepOpen ? { keepOpen } : {}),
    onSelect: () => onSelect(o.value),
  }));
}
