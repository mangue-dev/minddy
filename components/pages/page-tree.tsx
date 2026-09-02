"use client";

// The TREE of the project pages, in the secondary sidebar (MIN-270).
//
// It is reconstructed from the flat list (`buildPageTree`): a request for
// the entire project, unlimited depth, and no notion of “load the
// children” — they are already there. What persists is therefore not the data but
// the OPEN state, by project, in `localStorage`: return to a project
// must find the tree unfolded as we left it, otherwise we go back
// time to reopen the same three branches.
//
// Drag and drop is native HTML rather than dnd-kit, on purpose: which
// decides the gesture here is the VERTICAL position of the cursor IN the line
// hovered over (top third / middle / bottom third → before / inside / after, cf.
// lib/pages-move.ts), and the native event gives it exactly, line by
// line. A sensor that only renders colliding rectangles would require
// recalculate next.

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type DragEvent,
} from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button, cn } from "mangue-ui";
import {
  ChevronRight,
  FileText,
  MoreHorizontal,
  Plus,
  Star,
} from "lucide-react";

import type { PageSummary } from "@/lib/pages-api";
import type { PageTreeNode } from "@/lib/pages";
import { ancestorsOf, splitFavoritePageTree } from "@/lib/pages";
import { dropModeAt, type PageDropMode } from "@/lib/pages-move";
import { matchesFilter } from "@/components/sidebar-filter-field";
import {
  IssueActionsMenu,
  IssueContextMenu,
  type ContextMenuAction,
} from "@/components/issue-context-menu";
import {
  PagePresenceDot,
  usePresentOn,
} from "@/components/pages/page-presence";
import {
  usePageDocumentMenu,
  type PageMenuTarget,
} from "@/components/pages/page-document-actions";

/** Ligne d'arbre : 28 px de haut, 16 px de retrait par niveau. */
const INDENT = 16;

/** Open state persistence key — one per project. */
function expandedKey(projectId: string): string {
  return `minddy.pages.expanded.${projectId}`;
}

function readExpanded(projectId: string): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(expandedKey(projectId));
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    return new Set(Array.isArray(parsed) ? (parsed as string[]) : []);
  } catch {
    return new Set();
  }
}

export interface PageTreeProps {
  projectId: string;
  pages: PageSummary[];
  tree: PageTreeNode<PageSummary>[];
  /** The open page, highlighted and whose ancestors unfold. */
  activePageId: string | null;
  /** Title line text filter — not empty, the tree becomes a list. */
  query: string;
  onCreateChild: (parentId: string) => void;
  /** Fetch the body while pointer or keyboard intent precedes navigation. */
  onPrefetch: (pageId: string) => void;
  onMove: (dragId: string, targetId: string, mode: PageDropMode) => void;
  onTrash: (page: PageMenuTarget) => void;
  /** Pin/unpin. The favorite is SHARED by the project (lib/pages.ts). */
  onToggleFavorite: (page: PageMenuTarget) => void;
}

export function PageTree({
  projectId,
  pages,
  tree,
  activePageId,
  query,
  onCreateChild,
  onPrefetch,
  onMove,
  onTrash,
  onToggleFavorite,
}: PageTreeProps) {
  const t = useTranslations("Pages");
  const tCommon = useTranslations("Common");

  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  // Read after editing: `localStorage` does not exist in server rendering, and
  // starting from a state different from that of the HTML would cause the hydration to diverge.
  useEffect(() => {
    setExpanded(readExpanded(projectId));
  }, [projectId]);

  const persist = useCallback(
    (next: Set<string>) => {
      setExpanded(next);
      try {
        window.localStorage.setItem(
          expandedKey(projectId),
          JSON.stringify([...next])
        );
      } catch {
        // Private mode, full quota: the tree works, it doesn't remember.
      }
    },
    [projectId]
  );

  const toggle = useCallback(
    (pageId: string) => {
      const next = new Set(expanded);
      if (!next.delete(pageId)) next.add(pageId);
      persist(next);
    },
    [expanded, persist]
  );

  // The open page is ALWAYS visible: open a subpage from the
  // search or a block link unfolds its parent chain. Without that, the line
  // selected is folded under a closed parent, and nothing on the screen says where
  // we are.
  useEffect(() => {
    if (!activePageId) return;
    const chain = ancestorsOf(pages, activePageId).map((page) => page.id);
    if (chain.length === 0) return;
    setExpanded((current) => {
      if (chain.every((id) => current.has(id))) return current;
      const next = new Set(current);
      for (const id of chain) next.add(id);
      try {
        window.localStorage.setItem(
          expandedKey(projectId),
          JSON.stringify([...next])
        );
      } catch {
        /* voir persist */
      }
      return next;
    });
  }, [activePageId, pages, projectId]);

  /* ── The filter ──────────────────────────── ─────────────────────────────
     Filtering a tree while keeping it as a tree requires deciding what to do with it.
     parent who does not match but has a child who matches. The answer
     retained is NOT to decide: under filter, the tree becomes a LIST to
     Flat pages that match. We are looking for a page, not a branch. */
  const filtered = useMemo(() => {
    const needle = query.trim();
    if (!needle) return null;
    return pages
      .filter((page) => matchesFilter(needle, [page.title]))
      .sort((a, b) => a.title.localeCompare(b.title));
  }, [pages, query]);

  /* ── Favorites ──────────────────────────────────────────────────────────
     Each favorite becomes a root in the upper forest and brings its complete
     subtree with it. The lower forest excludes those nodes, so a nested favorite
     and every one of its descendants appear exactly once in the sidebar.

     There is no section title: the star on favorite rows and the separator make
     the distinction without spending another line of sidebar space. */
  const { favorites, regular } = useMemo(
    () => splitFavoritePageTree(tree),
    [tree]
  );

  /* ── The deposit ────────────────────────────── ────────────────────────────── */
  const [dragId, setDragId] = useState<string | null>(null);
  const [drop, setDrop] = useState<{ id: string; mode: PageDropMode } | null>(
    null
  );

  const endDrag = useCallback(() => {
    setDragId(null);
    setDrop(null);
  }, []);

  const createChild = useCallback(
    (parentId: string) => {
      if (!expanded.has(parentId)) {
        const next = new Set(expanded);
        next.add(parentId);
        persist(next);
      }
      onCreateChild(parentId);
    },
    [expanded, onCreateChild, persist]
  );

  // One action list serves the hover menu, the context menu, and the open page.
  const { actionsFor, dialogs } = usePageDocumentMenu({
    projectId,
    pages,
    onCreateChild: createChild,
    onToggleFavorite,
    onTrash,
  });

  if (filtered) {
    return filtered.length === 0 ? (
      <p className="px-4 py-6 text-center text-sm text-muted-foreground">
        {tCommon("noFilterMatch")}
      </p>
    ) : (
      <div className="flex flex-col gap-0.5 px-2 pt-2 pb-4">
        {filtered.map((page) => (
          <PageRow
            key={page.id}
            page={page}
            depth={0}
            hasChildren={false}
            open={false}
            active={page.id === activePageId}
            drop={null}
            dragging={false}
            untitled={t("untitled")}
            actions={actionsFor(page)}
            onToggle={() => {}}
            onCreateChild={createChild}
            onPrefetch={onPrefetch}
          />
        ))}
        {dialogs}
      </div>
    );
  }

  const renderRows = (
    nodes: PageTreeNode<PageSummary>[],
    favoriteSection: boolean
  ): React.ReactNode[] => {
    const rendered: React.ReactNode[] = [];
    const walk = (branch: PageTreeNode<PageSummary>[]) => {
      for (const node of branch) {
        const open = expanded.has(node.id);
        rendered.push(
          <PageRow
            key={node.id}
            page={node}
            depth={node.depth}
            hasChildren={node.children.length > 0}
            open={open}
            active={node.id === activePageId}
            drop={drop?.id === node.id ? drop.mode : null}
            dragging={dragId === node.id}
            untitled={t("untitled")}
            actions={actionsFor(node)}
            pinned={favoriteSection && node.favorite}
            onToggle={() => toggle(node.id)}
            onCreateChild={createChild}
            onPrefetch={onPrefetch}
            onDragStart={() => setDragId(node.id)}
            onDragOverRow={(mode) => {
              if (!dragId || dragId === node.id) return;
              setDrop({ id: node.id, mode });
            }}
            onDropRow={(mode) => {
              if (dragId && dragId !== node.id) onMove(dragId, node.id, mode);
              endDrag();
            }}
            onDragEnd={endDrag}
          />
        );
        if (open) walk(node.children);
      }
    };
    walk(nodes);
    return rendered;
  };
  const favoriteRows = renderRows(favorites, true);
  const regularRows = renderRows(regular, false);

  return (
    <div className="flex flex-col gap-0.5 px-2 pt-2 pb-4">
      {favorites.length > 0 && (
        <>
          {favoriteRows}
          {regularRows.length > 0 && (
            <div className="mx-2 my-1.5 h-px shrink-0 bg-border" aria-hidden />
          )}
        </>
      )}
      {regularRows}
      {dialogs}
    </div>
  );
}

function PageRow({
  page,
  depth,
  hasChildren,
  open,
  active,
  drop,
  dragging,
  untitled,
  actions,
  pinned = false,
  onToggle,
  onCreateChild,
  onPrefetch,
  onDragStart,
  onDragOverRow,
  onDropRow,
  onDragEnd,
}: {
  page: PageSummary;
  depth: number;
  hasChildren: boolean;
  open: boolean;
  active: boolean;
  /** The current drop target, when THIS line is hovered over. */
  drop: PageDropMode | null;
  dragging: boolean;
  untitled: string;
  /** The complete menu, shared with the open page. */
  actions: ContextMenuAction[];
  /** Whether this row itself is a favorite in the upper tree. */
  pinned?: boolean;
  onToggle: () => void;
  onCreateChild: (parentId: string) => void;
  onPrefetch: (pageId: string) => void;
  onDragStart?: () => void;
  onDragOverRow?: (mode: PageDropMode) => void;
  onDropRow?: (mode: PageDropMode) => void;
  onDragEnd?: () => void;
}) {
  const t = useTranslations("Pages");
  const [menuOpen, setMenuOpen] = useState(false);
  // Right click: the position of the pointer, or `null` when the menu is closed.
  const [menuPosition, setMenuPosition] = useState<{
    x: number;
    y: number;
  } | null>(null);
  // OTHERS, never me (sorting at the source): my own tabs
  // lit a tablet in front of pages that no one else was reading. There
  // active line remains excluded in principle — that's the one I'm reading.
  const present = usePresentOn(active ? null : page.id);

  const modeFrom = (event: DragEvent<HTMLDivElement>): PageDropMode => {
    const rect = event.currentTarget.getBoundingClientRect();
    return dropModeAt(event.clientY - rect.top, rect.height);
  };

  return (
    <>
    <div
      className={cn(
        "group/page relative flex items-center rounded-md pr-1 transition-colors",
        active ? "bg-muted" : "hover:bg-muted/60 focus-within:bg-muted/60",
        dragging && "opacity-40",
        // “Inside” is said by the bottom of the target line, “before/after” by
        // a line on its edge: two different signals for two gestures
        // different, readable without having to aim at the pixel.
        drop === "inside" && "ring-1 ring-inset ring-primary"
      )}
      // Right-clicking opens the line menu, wherever it falls on it: on the
      // title, on the icon, on the blank on the right. Aiming for “⋯” requires
      // hover over the line to make it appear, then reach a square of
      // 24px; the right click does not need anything.
      //
      // `preventDefault` assumed: we replace the browser menu, like the
      // make the board maps and the primary sidebar. What he offered
      // useful here — open in a new tab — remains ⌘-click and click
      // from the middle on the link, which are real anchors.
      onContextMenu={(event) => {
        event.preventDefault();
        setMenuPosition({ x: event.clientX, y: event.clientY });
      }}
      draggable={!!onDragStart}
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = "move";
        // Firefox does not initiate a drag without data.
        event.dataTransfer.setData("text/plain", page.id);
        onDragStart?.();
      }}
      onDragOver={(event) => {
        if (!onDragOverRow) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        onDragOverRow(modeFrom(event));
      }}
      onDrop={(event) => {
        if (!onDropRow) return;
        event.preventDefault();
        onDropRow(modeFrom(event));
      }}
      onDragEnd={onDragEnd}
    >
      {drop === "before" || drop === "after" ? (
        <div
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-x-1 h-0.5 rounded-full bg-primary",
            drop === "before" ? "top-0" : "bottom-0"
          )}
        />
      ) : null}

      {/* The shrinkage is carried by a wedge to the left of the rafter, not by a
          padding on the line: the hover background must run over the entire
          width of the column, at all levels. */}
      <div style={{ width: depth * INDENT }} className="shrink-0" />

      <button
        type="button"
        onClick={onToggle}
        aria-expanded={hasChildren ? open : undefined}
        aria-label={t("toggleChildren")}
        tabIndex={hasChildren ? 0 : -1}
        className={cn(
          "flex size-5 shrink-0 items-center justify-center rounded outline-none",
          !hasChildren && "invisible"
        )}
      >
        <ChevronRight
          className={cn(
            "size-3 text-muted-foreground transition-transform",
            open && "rotate-90"
          )}
        />
      </button>

      <Link
        href={`/projects/${page.project_id}/pages/${page.id}`}
        data-sidebar-filter-result
        onMouseEnter={() => onPrefetch(page.id)}
        onFocus={() => onPrefetch(page.id)}
        className="flex min-w-0 flex-1 items-center gap-1.5 py-1.5 pr-1 text-left outline-none"
      >
        <span className="flex size-4 shrink-0 items-center justify-center text-sm leading-none">
          {page.icon ?? (
            <FileText className="size-3.5 text-muted-foreground" />
          )}
        </span>
        <span
          className={cn(
            "min-w-0 flex-1 truncate text-sm",
            active && "font-medium",
            !page.title && "text-muted-foreground"
          )}
        >
          {page.title || untitled}
        </span>
        {/* Quelqu'un d'autre lit cette page en ce moment (MIN-271). Un point,
            and not an avatar: at this location the useful information is binary —
            which, we read it when opening the page. */}
        <PagePresenceDot count={present.length} />
      </Link>

      {/* Both hover gestures. They reserve their place (`opacity`, not
          `hidden`): without this the title would be shortened when the mouse passes. */}
      <div
        className={cn(
          "flex shrink-0 items-center opacity-0 transition-opacity",
          "group-hover/page:opacity-100 group-focus-within/page:opacity-100",
          // The ⋯ only appears on hover: otherwise it would disappear under the
          // menu that he himself has just opened, the mouse having left the line.
          menuOpen && "opacity-100"
        )}
      >
        <IssueActionsMenu
          onOpenChange={setMenuOpen}
          // Three entries: the menu search field would only do
          // noise, hover and Radix typeahead are enough.
          searchable={false}
          align="start"
          actions={actions}
          trigger={
            <Button
              variant="ghost"
              size="icon"
              className="size-6"
              aria-label={t("pageOptions")}
            >
              <MoreHorizontal className="size-3.5" />
            </Button>
          }
        />
        <Button
          variant="ghost"
          size="icon"
          className="size-6"
          aria-label={t("newSubpage")}
          onClick={() => onCreateChild(page.id)}
        >
          <Plus className="size-3.5" />
        </Button>
      </div>

      {/* The star CLOSES the line, after the ⋯ and the + — it is the right edge of
          the column, where the eye sweeps to find what is pinned.
          It's out of the hover gesture block, so it doesn't fade
          not with them; and as this block reserves its place (`opacity`, not
          `hidden`), it does not move a pixel when the mouse passes.

          The BOX is that of `+` just to its left — `size-6`, contents
          centered: this is what separates it from the edge. Posed naked, the star did not
          than its 12 px and stuck to the `pr-1` of the line, while the
          two buttons breathe in their square. One more icon in
          the same row fits in the same square, otherwise the row no longer has
          de rythme. */}
      {pinned && (
        <span
          aria-hidden
          className="flex size-6 shrink-0 items-center justify-center"
        >
          <Star className="size-3 fill-amber-400 text-amber-400" />
        </span>
      )}
    </div>

    {/* The SAME menu, anchored to the pointer. Out of line, and this is deliberate:
        he places an invisible anchor in `position: fixed` at the coordinates of
        click, and the line is `draggable` — an anchor left in would stretch the
        rectangle that the browser photographs for the ghost of the slide
        to the corner of the screen. Out of the flow, it costs nothing here. */}
    <IssueContextMenu
      position={menuPosition}
      onClose={() => setMenuPosition(null)}
      actions={actions}
      searchable={false}
    />
    </>
  );
}
