"use client";

import type { ReactNode } from "react";
import {
  IssueActionsMenu,
  type ContextMenuAction,
  type ContextMenuActions,
} from "@/components/issue-context-menu";

// The filter menus of the collections (board, triage, feedback, pull
// requests, objectives, admin costs) are the searchable action menu of the
// issue cards: each facet is a submenu, the search reaches every value
// ("Priority › High"), and a toggle keeps the menu open to set several in a
// row. On a phone the same tree becomes one searchable sheet.

/** One facet of a filter menu: a submenu whose trigger carries, when the
    facet is active, how many values are selected — a bare number, the same
    count treatment as the sidebar. */
export function filterFacet({
  id,
  label,
  count,
  icon,
  separatorBefore,
  children,
}: {
  id: string;
  label: string;
  count: number;
  icon?: ReactNode;
  separatorBefore?: boolean;
  children: ContextMenuAction[];
}): ContextMenuAction {
  return { id, label, icon, separatorBefore, trailing: count > 0 ? count : undefined, children };
}

/** One toggle row of a filter menu — Linear style: selecting it toggles
    WITHOUT closing the menu, and the check sits on the right. */
export function filterToggle({
  id,
  label,
  active,
  onToggle,
  ...rest
}: {
  id: string;
  label: string;
  active: boolean;
  onToggle: () => void;
} & Pick<ContextMenuAction, "icon" | "labelNode" | "keywords" | "trailing" | "disabled" | "separatorBefore">): ContextMenuAction {
  return { id, label, checked: active, keepOpen: true, onSelect: onToggle, ...rest };
}

/** The filter menu of a collection, anchored to its icon button. */
export function FilterMenu({
  label,
  trigger,
  actions,
  onQueryChange,
  onOpenChange,
}: {
  /** The tooltip of the icon-only trigger. */
  label: string;
  trigger: ReactNode;
  actions: ContextMenuActions;
  /** Notified of the typed search query (a facet searched on the server). */
  onQueryChange?: (query: string) => void;
  onOpenChange?: (open: boolean) => void;
}) {
  return (
    <IssueActionsMenu
      searchable
      align="end"
      tooltip={label}
      trigger={trigger}
      actions={actions}
      onQueryChange={onQueryChange}
      onOpenChange={onOpenChange}
    />
  );
}
