"use client";

import { useMobileLayout } from "@/lib/use-mobile-layout";
import { CommandGroup, CommandItem } from "@/components/ui/command";
import { SearchMenu } from "@/components/search-menu";
import { actionMenuItems } from "@/lib/visible-overlays";

// Ticket actions menu: a real Radix dropdown (the same as dropdowns
// classics of the app), available in two anchors which share the same body —
// • IssueContextMenu — anchored to the pointer position (right click on a card,
// or on a board view pill), with a search field at the top to
// filter actions (can be deactivated in short menus);
// • IssueActionsMenu — anchored to a trigger (the “⋯” button of the issue panel).
// An action carrying `children` becomes a side flyout submenu
// (inline accordion on mobile, managed by the dropdown-menu primitive).
//
// Search (when enabled) filters entries at every level (label + keywords):
// a submenu entry that matches is listed as its own row, behind the path of
// the branches holding it (Relations › Blocked by, MIN-845). Filtering keeps
// the focus in the field; ↓ goes down the list, Enter triggers the first
// entry, Escape closes.

import * as React from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSearchScope,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronRightIcon } from "lucide-react";
import { HugeiconsIcon } from "@hugeicons/react";
import { CheckIcon } from "@hugeicons/core-free-icons";
import { Kbd } from "@/components/ui/kbd";
import { DropdownSearchRow, searchInputClass } from "@/components/search-menu";
import { searchActionTree } from "@/lib/action-menu-search";

export interface ContextMenuAction {
  id: string;
  label: string;
  /** Additional search terms (synonyms, English/French, etc.). */
  keywords?: string[];
  icon?: React.ReactNode;
  /** Corresponding shortcut key, displayed on the right (e.g. “⇧P”). */
  shortcut?: string;
  /** Separates the entry from the previous group, in a submenu too (ignored if it opens the list). */
  separatorBefore?: boolean;
  /** `destructive` = red, for irreversible actions (delete). */
  variant?: "default" | "destructive";
  /** Input shown but inert (the action exists, it just isn't
 possible here — e.g. delete the last view of a board). */
  disabled?: boolean;
  /** Sub-actions: when present, the action becomes a flyout sub-menu
 instead of triggering `onSelect`. */
  children?: ContextMenuAction[];
  /** Selection opens another surface that takes focus instead of the trigger. */
  transfersFocus?: boolean;
  /** The entry is the current value of a property submenu: a check on the right. */
  checked?: boolean;
  /** A toggle among several (categories): selecting it keeps the menu open,
   *  which then closes on a click outside or Escape. */
  keepOpen?: boolean;
  /** Renders the label (e.g. an objective's name in its color); `label`
   *  stays the searched and accessible text. */
  labelNode?: React.ReactNode;
  onSelect?: () => void;
}

/**
 * The label of a search result found inside a submenu: the branches leading
 * to it, muted and separated by a chevron, then the entry itself.
 */
export function ActionPathLabel({ path, label }: { path: readonly string[]; label: React.ReactNode }) {
  return (
    <span className="flex min-w-0 items-center gap-1">
      {path.map((part, i) => (
        <React.Fragment key={i}>
          <span className="max-w-28 shrink-0 truncate text-muted-foreground">{part}</span>
          <ChevronRightIcon aria-hidden className="size-3 text-muted-foreground" />
        </React.Fragment>
      ))}
      <span className="truncate">{label}</span>
    </span>
  );
}

/**
 * Search state shared by the searchable dropdowns (this action menu and the
 * page block menu): the query, reset on close, the focus placed in the field
 * on open, and the field's keyboard contract.
 */
export function useActionMenuSearch(open: boolean, searchable = true) {
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

  // Search remains inside this menu, even if an inactive board retains another
  // open portaled menu earlier in the document.
  const items = () => actionMenuItems(inputRef.current);

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
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

  // The caret stays in the search field (see DropdownMenuSearchScope for the
  // hovered options). Radix still moves the focus in two cases: to the menu
  // itself when the pointer leaves a submenu trigger, and to an option the
  // arrow keys reached. The first goes straight back to the field; in the
  // second, typing still searches instead of Radix's typeahead. Native
  // capture listeners run before React's, for submenus (portaled) too.
  React.useEffect(() => {
    if (!open || !searchable) return;
    const inThisMenu = (target: EventTarget | null) => {
      const input = inputRef.current;
      return !!input && target instanceof Element && !!target.closest('[role="menu"]') && target !== input;
    };
    const onFocusIn = (event: FocusEvent) => {
      const input = inputRef.current;
      if (input && event.target === input.closest('[role="menu"]')) input.focus({ preventScroll: true });
    };
    const onKeyDownCapture = (event: KeyboardEvent) => {
      const input = inputRef.current;
      if (!input || !inThisMenu(event.target)) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      // Space still selects the focused option, as in any menu.
      const typed = event.key.length === 1 && event.key !== " ";
      if (!typed && event.key !== "Backspace") return;
      event.preventDefault();
      event.stopPropagation();
      setQuery((current) => (typed ? current + event.key : current.slice(0, -1)));
      input.focus({ preventScroll: true });
    };
    document.addEventListener("focusin", onFocusIn, true);
    document.addEventListener("keydown", onKeyDownCapture, true);
    return () => {
      document.removeEventListener("focusin", onFocusIn, true);
      document.removeEventListener("keydown", onKeyDownCapture, true);
    };
  }, [open, searchable]);

  return { query: searchable ? query : "", setQuery, inputRef, onKeyDown };
}

/** The search row at the top of a searchable dropdown, followed by its separator. */
export function ActionMenuSearchField({ search }: { search: ReturnType<typeof useActionMenuSearch> }) {
  const t = useTranslations("Picker");
  return (
    <>
      <DropdownSearchRow>
        <input
          ref={search.inputRef}
          value={search.query}
          onChange={(e) => search.setQuery(e.target.value)}
          onKeyDown={search.onKeyDown}
          placeholder={t("search")}
          className={searchInputClass}
          aria-label={t("search")}
        />
      </DropdownSearchRow>
      <DropdownMenuSeparator />
    </>
  );
}

/** Sheet: a clickable item, possibly with a shortcut on the right. A search
 *  result found in a submenu carries its `path`. */
function LeafItem({
  action,
  path = [],
  disabled = action.disabled,
  onActionSelect,
}: {
  action: ContextMenuAction;
  path?: readonly string[];
  disabled?: boolean;
  onActionSelect?: (action: ContextMenuAction) => void;
}) {
  return (
    <DropdownMenuItem
      variant={action.variant}
      disabled={disabled}
      data-checked={action.checked || undefined}
      onSelect={(event) => {
        // A toggle stays in its open menu, to set several in a row.
        if (action.keepOpen) {
          event.preventDefault();
          action.onSelect?.();
          return;
        }
        if (onActionSelect) onActionSelect(action);
        else action.onSelect?.();
      }}
    >
      {action.icon}
      {path.length > 0
        ? <ActionPathLabel path={path} label={action.labelNode ?? action.label} />
        : <span className="truncate">{action.labelNode ?? action.label}</span>}
      {action.checked && <HugeiconsIcon icon={CheckIcon} className="ml-auto size-4" />}
      {action.shortcut && (
        <DropdownMenuShortcut>
          <Kbd size="sm">{action.shortcut}</Kbd>
        </DropdownMenuShortcut>
      )}
    </DropdownMenuItem>
  );
}

/** Branch or leaf depending on the presence of children. */
function ActionNode({
  action,
  onActionSelect,
}: {
  action: ContextMenuAction;
  onActionSelect?: (action: ContextMenuAction) => void;
}) {
  if (action.children && action.children.length > 0) {
    return (
      <DropdownMenuSub>
        {/* A shortcut pushes the chevron right instead of sharing the space. */}
        <DropdownMenuSubTrigger className="[&>[data-slot=dropdown-menu-shortcut]+svg]:ml-0">
          {action.icon}
          <span className="truncate">{action.label}</span>
          {action.shortcut && (
            <DropdownMenuShortcut>
              <Kbd size="sm">{action.shortcut}</Kbd>
            </DropdownMenuShortcut>
          )}
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent>
          {action.children.map((child, i) => (
            <React.Fragment key={child.id}>
              {child.separatorBefore && i > 0 && <DropdownMenuSeparator />}
              <LeafItem action={child} onActionSelect={onActionSelect} />
            </React.Fragment>
          ))}
        </DropdownMenuSubContent>
      </DropdownMenuSub>
    );
  }
  return <LeafItem action={action} onActionSelect={onActionSelect} />;
}

/** Shared body for both anchors: optional search and the action list. */
function ActionMenuBody({
  actions,
  open,
  searchable,
  onActionSelect,
}: {
  actions: ContextMenuAction[];
  open: boolean;
  searchable: boolean;
  onActionSelect?: (action: ContextMenuAction) => void;
}) {
  const t = useTranslations("Picker");
  const search = useActionMenuSearch(open, searchable);
  const visible = searchActionTree(actions, search.query);

  // The options leave the caret in the search field (DropdownMenuSearchScope).
  const Scope = searchable ? DropdownMenuSearchScope : React.Fragment;
  return (
    <Scope>
      {searchable && <ActionMenuSearchField search={search} />}
      {visible.length === 0 ? (
        <div className="px-2.5 py-1.5 text-sm text-muted-foreground">
          {t("noResults")}
        </div>
      ) : (
        visible.map(({ action, path, disabled }, i) => (
          <React.Fragment key={[...path, action.id].join("/")}>
            {/* A separator at the top of the list (previous group entirely
 filtered) would be an orphan bar: we only make it between two visible
 entries. A nested match sits with its branch's group. */}
            {action.separatorBefore && path.length === 0 && i > 0 && <DropdownMenuSeparator />}
            {path.length > 0
              ? <LeafItem action={action} path={path} disabled={disabled} onActionSelect={onActionSelect} />
              : <ActionNode action={action} onActionSelect={onActionSelect} />}
          </React.Fragment>
        ))
      )}
    </Scope>
  );
}

/** Mobile actions stay in one searchable sheet, including nested groups. */
function MobileActionMenu({ actions, onSelect, ...props }: {
  actions: ContextMenuAction[];
  onSelect: (action: ContextMenuAction) => void;
} & Omit<React.ComponentProps<typeof SearchMenu>, "children">) {
  const rows = (items: ContextMenuAction[], parentLabel = "", parentDisabled = false): React.ReactNode =>
    items.map((action) => action.children?.length ? <CommandGroup key={action.id} heading={action.label}>
      {rows(action.children, action.label, parentDisabled || !!action.disabled)}
    </CommandGroup> : <CommandItem key={action.id} value={action.id}
      keywords={[action.label, parentLabel, ...(action.keywords ?? [])]}
      disabled={parentDisabled || action.disabled} onSelect={() => onSelect(action)}>
      <span className={action.variant === "destructive" ? "flex items-center gap-2 text-destructive [&_svg]:text-destructive" : "flex items-center gap-2"}>
        {action.icon}<span>{action.labelNode ?? action.label}</span>
      </span>
    </CommandItem>);
  return <SearchMenu {...props}><CommandGroup>{rows(actions)}</CommandGroup></SearchMenu>;
}

/** Pointer-anchored actions menu (right click on a card, tab, sidebar row…). */
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
  const mobile = useMobileLayout() === true;
  const lastPosition = React.useRef({ x: 0, y: 0 });
  if (position) lastPosition.current = position;
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);
  // Portals have no server markup. Keep the first client render identical
  // before attaching the pointer anchor, including when the menu is closed.
  if (!mounted) return null;
  if (mobile) return <MobileActionMenu position={position} open={!!position}
    onOpenChange={(next) => { if (!next) onClose(); }} actions={actions}
    onSelect={(action) => {
      if (action.keepOpen) return void action.onSelect?.();
      onClose();
      requestAnimationFrame(() => action.onSelect?.());
    }} />;
  // The whole menu — trigger included — is portaled to <body>. The invisible
  // trigger carries the anchor coordinates; inside any transformed or
  // clipped ancestor (drag-and-drop items, overflow-hidden strips) a `fixed`
  // element stops behaving like one and the anchor drifts away: the menu
  // then lands beside the tab or card instead of under it. Mounted at <body>,
  // the viewport coordinates hold in every container.
  return createPortal(
    <DropdownMenu open={!!position} onOpenChange={(open) => !open && onClose()}>
      <DropdownMenuTrigger asChild>
        <span
          aria-hidden
          style={{
            position: "fixed",
            left: lastPosition.current.x,
            top: lastPosition.current.y,
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
        onClick={(e) => e.stopPropagation()}
        onContextMenu={(e) => e.stopPropagation()}
      >
        <ActionMenuBody
          actions={actions}
          open={!!position}
          searchable={searchable}
          onActionSelect={(action) => {
            // Menus that open another floating surface must finish their own
            // close cycle first. Otherwise Radix's focus restoration dismisses
            // the freshly opened picker, which made due dates and objectives
            // appear to do nothing from a card's context menu.
            onClose();
            requestAnimationFrame(() => action.onSelect?.());
          }}
        />
      </DropdownMenuContent>
    </DropdownMenu>,
    document.body,
  );
}

/** Button-anchored actions menu; enable search for the full issue action list. */
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
  const mobile = useMobileLayout() === true;
  const [open, setOpen] = React.useState(false);
  const transferringFocus = React.useRef(false);
  const change = (next: boolean) => {
    setOpen(next);
    onOpenChange?.(next);
  };
  if (mobile && searchable) return <MobileActionMenu trigger={trigger} open={open}
    onOpenChange={change} actions={actions}
    onSelect={(action) => {
      if (action.keepOpen) return void action.onSelect?.();
      change(false);
      requestAnimationFrame(() => action.onSelect?.());
    }} />;
  return (
    <DropdownMenu open={open} onOpenChange={change}>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent
        align={align}
        side="bottom"
        className={searchable ? "min-w-64" : "min-w-56"}
        onCloseAutoFocus={(event) => {
          if (transferringFocus.current) {
            event.preventDefault();
            transferringFocus.current = false;
          }
        }}
      >
        <ActionMenuBody
          actions={actions}
          open={open}
          searchable={searchable}
          onActionSelect={(action) => {
            // Finish closing before a field picker or dialog takes focus.
            transferringFocus.current = action.transfersFocus === true;
            change(false);
            requestAnimationFrame(() => action.onSelect?.());
          }}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
