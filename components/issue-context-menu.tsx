"use client";

// Ticket actions menu: a real Radix dropdown (the same as dropdowns
// classics of the app), available in two anchors which share the same body —
// • IssueContextMenu — anchored to the pointer position (right click on a card,
// or on a board view pill), with a search field at the top to
// filter actions (can be deactivated in short menus);
// • IssueActionsMenu — anchored to a trigger (the “⋯” button of the issue panel).
// An action carrying `children` becomes a side flyout submenu
// (inline accordion on mobile, managed by mangue-ui).
//
// Search (when enabled) filters top level entries
// (label + keywords), like the old cmdk version. Filtering keeps the focus
// in the field; ↓ goes down the list, Enter triggers the first entry,
// Close escape.

import * as React from "react";
import { useTranslations } from "next-intl";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "mangue-ui";
import { Kbd } from "@/components/ui/kbd";
import { DropdownSearchRow, searchInputClass } from "@/components/search-menu";

export interface ContextMenuAction {
  id: string;
  label: string;
  /** Additional search terms (synonyms, English/French, etc.). */
  keywords?: string[];
  icon?: React.ReactNode;
  /** Corresponding shortcut key, displayed on the right (e.g. “⇧P”). */
  shortcut?: string;
  /** Separates the entry from the previous group (ignored if it opens the list). */
  separatorBefore?: boolean;
  /** `destructive` = red, for irreversible actions (delete). */
  variant?: "default" | "destructive";
  /** Input shown but inert (the action exists, it just isn't
 possible here — e.g. delete the last view of a board). */
  disabled?: boolean;
  /** Sub-actions: when present, the action becomes a flyout sub-menu
 instead of triggering `onSelect`. */
  children?: ContextMenuAction[];
  onSelect?: () => void;
}

/** The entry matches the search if its label or one of its keywords contains it. */
function actionMatches(action: ContextMenuAction, query: string): boolean {
  if (!query) return true;
  const haystack = [action.label, ...(action.keywords ?? [])]
    .join(" ")
    .toLowerCase();
  return haystack.includes(query);
}

/** Sheet: a clickable item, possibly with a shortcut on the right. */
function LeafItem({ action }: { action: ContextMenuAction }) {
  return (
    <DropdownMenuItem
      variant={action.variant}
      disabled={action.disabled}
      onSelect={() => action.onSelect?.()}
    >
      {action.icon}
      <span className="truncate">{action.label}</span>
      {action.shortcut && (
        <DropdownMenuShortcut>
          <Kbd size="sm">{action.shortcut}</Kbd>
        </DropdownMenuShortcut>
      )}
    </DropdownMenuItem>
  );
}

/** Branch or leaf depending on the presence of children. */
function ActionNode({ action }: { action: ContextMenuAction }) {
  if (action.children && action.children.length > 0) {
    return (
      <DropdownMenuSub>
        <DropdownMenuSubTrigger>
          {action.icon}
          <span className="truncate">{action.label}</span>
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent>
          {action.children.map((child) => (
            <LeafItem key={child.id} action={child} />
          ))}
        </DropdownMenuSubContent>
      </DropdownMenuSub>
    );
  }
  return <LeafItem action={action} />;
}

/** Corps commun aux deux ancrages : recherche optionnelle + liste d'actions. */
function ActionMenuBody({
  actions,
  open,
  searchable,
}: {
  actions: ContextMenuAction[];
  open: boolean;
  searchable: boolean;
}) {
  const t = useTranslations("Picker");
  const [query, setQuery] = React.useState("");
  const inputRef = React.useRef<HTMLInputElement>(null);

  // Start from an empty search each time you close; when opening, place the
  // focus on the search (Radix focuses on the first item by default; we
  // takes over after him via an rAF).
  React.useEffect(() => {
    if (!open) {
      setQuery("");
      return;
    }
    if (!searchable) return;
    const id = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [open, searchable]);

  const q = searchable ? query.trim().toLowerCase() : "";
  const visible = actions.filter((a) => actionMatches(a, q));

  // The content is portaled to <body>; we retrieve the focusable items to
  // route the keyboard from the search field to the list.
  const items = () =>
    Array.from(
      document.querySelectorAll<HTMLElement>(
        '[data-slot="dropdown-menu-content"] [data-slot="dropdown-menu-item"]:not([data-disabled]),[data-slot="dropdown-menu-content"] [data-slot="dropdown-menu-sub-trigger"]:not([data-disabled])'
      )
    );

  const onInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") return; // let Radix close the menu
    if (e.key === "ArrowDown") {
      e.preventDefault();
      e.stopPropagation();
      items()[0]?.focus();
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      e.stopPropagation();
      const els = items();
      els[els.length - 1]?.focus();
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      items()[0]?.click();
      return;
    }
    // Prevents typing (letters, Backspace, space, etc.) from triggering the
    // Radix typeahead: only the search field receives it.
    e.stopPropagation();
  };

  return (
    <>
      {searchable && (
        <>
          <DropdownSearchRow>
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onInputKeyDown}
              placeholder={t("search")}
              className={searchInputClass}
              aria-label={t("search")}
            />
          </DropdownSearchRow>
          <DropdownMenuSeparator />
        </>
      )}
      {visible.length === 0 ? (
        <div className="px-2.5 py-1.5 text-sm text-muted-foreground">
          {t("noResults")}
        </div>
      ) : (
        visible.map((action, i) => (
          <React.Fragment key={action.id}>
            {/* A separator at the top of the list (previous group entirely
 filtered) would be an orphan bar: we only make it between two visible
 entries. */}
            {action.separatorBefore && i > 0 && <DropdownMenuSeparator />}
            <ActionNode action={action} />
          </React.Fragment>
        ))
      )}
    </>
  );
}

export function IssueContextMenu({
  position,
  onClose,
  actions,
  searchable = true,
}: {
  /** Right-click viewport coordinates; null = menu closed. */
  position: { x: number; y: number } | null;
  onClose: () => void;
  actions: ContextMenuAction[];
  /** Search field at the top. To cut on menus of two or three
 entries (view pills), where it would only make noise. */
  searchable?: boolean;
}) {
  return (
    <DropdownMenu open={!!position} onOpenChange={(open) => !open && onClose()}>
      <DropdownMenuTrigger asChild>
        <span
          aria-hidden
          style={{
            position: "fixed",
            left: position?.x ?? 0,
            top: position?.y ?? 0,
          }}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        side="bottom"
        className="min-w-64"
        // The trigger is invisible and out of flow: do not return the focus to it
        // closing (avoids a scroll jump to the point of the click).
        onCloseAutoFocus={(e) => e.preventDefault()}
        // The menu is portalized but rendered, in the React tree, inside
        // the clickable card (onClick = open the ticket). React events
        // go up the component tree despite the portal: we therefore stop the
        // spread here so that clicking on an option does not open the map.
        onClick={(e) => e.stopPropagation()}
        onContextMenu={(e) => e.stopPropagation()}
      >
        <ActionMenuBody
          actions={actions}
          open={!!position}
          searchable={searchable}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * The same actions, anchored to a button — the “⋯” in the panel header
 * of outcome. No search field by default: the list is short and is
 * scans with a glance (the native typeahead of Radix is ​​sufficient), where the right click
 * sert de palette.
 */
export function IssueActionsMenu({
  trigger,
  actions,
  align = "end",
  searchable = false,
  onOpenChange,
}: {
  trigger: React.ReactNode;
  actions: ContextMenuAction[];
  align?: "start" | "center" | "end";
  searchable?: boolean;
  /**
   * Notified each time it opens/closes. The state remains INTERNAL: the caller
   * doesn't have to hold it to know, and the only known need is to keep
   * visible a chrome which only appears on hover (the ⋯ of a tree line
   * would disappear under the menu it has just opened).
   */
  onOpenChange?: (open: boolean) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const change = (next: boolean) => {
    setOpen(next);
    onOpenChange?.(next);
  };
  return (
    <DropdownMenu open={open} onOpenChange={change}>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent align={align} side="bottom" className="min-w-56">
        <ActionMenuBody actions={actions} open={open} searchable={searchable} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
