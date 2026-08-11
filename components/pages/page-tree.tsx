"use client";

// L'ARBRE des pages du projet, dans la sidebar secondaire (MIN-270).
//
// Il se reconstruit depuis la liste à plat (`buildPageTree`) : une requête pour
// tout le projet, profondeur illimitée, et aucune notion de « charger les
// enfants » — ils sont déjà là. Ce qui se persiste n'est donc pas la donnée mais
// l'état d'OUVERTURE, par projet, dans `localStorage` : revenir sur un projet
// doit retrouver l'arbre déplié comme on l'avait laissé, sinon on repasse son
// temps à rouvrir les mêmes trois branches.
//
// Le glisser-déposer est en HTML natif plutôt qu'en dnd-kit, à dessein : ce qui
// décide du geste ici est la position VERTICALE du curseur DANS la ligne
// survolée (tiers haut / milieu / tiers bas → avant / dedans / après, cf.
// lib/pages-move.ts), et l'événement natif la donne exactement, ligne par
// ligne. Un capteur qui ne rend que des rectangles en collision obligerait à la
// recalculer à côté.

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type DragEvent,
} from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  cn,
} from "mangue-ui";
import {
  ChevronRight,
  FileText,
  MoreHorizontal,
  Plus,
  Trash2,
} from "lucide-react";

import type { PageSummary } from "@/lib/pages-api";
import type { PageTreeNode } from "@/lib/pages";
import { ancestorsOf } from "@/lib/pages";
import { dropModeAt, type PageDropMode } from "@/lib/pages-move";
import { matchesFilter } from "@/components/sidebar-filter-field";
import {
  PagePresenceDot,
  usePresentOn,
} from "@/components/pages/page-presence";

/** Ligne d'arbre : 28 px de haut, 16 px de retrait par niveau. */
const INDENT = 16;

/** Clé de persistance de l'état d'ouverture — une par projet. */
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
  /** La page ouverte, mise en évidence et dont les ancêtres se déplient. */
  activePageId: string | null;
  /** Filtre texte de la ligne de titre — non vide, l'arbre devient une liste. */
  query: string;
  onCreateChild: (parentId: string) => void;
  onMove: (dragId: string, targetId: string, mode: PageDropMode) => void;
  onTrash: (page: PageSummary) => void;
}

export function PageTree({
  projectId,
  pages,
  tree,
  activePageId,
  query,
  onCreateChild,
  onMove,
  onTrash,
}: PageTreeProps) {
  const t = useTranslations("Pages");
  const tCommon = useTranslations("Common");

  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  // Lu après le montage : `localStorage` n'existe pas au rendu serveur, et
  // partir d'un état différent de celui du HTML ferait diverger l'hydratation.
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
        // Mode privé, quota plein : l'arbre marche, il ne se souvient pas.
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

  // La page ouverte est TOUJOURS visible : ouvrir une sous-page depuis la
  // recherche ou un lien de bloc déplie sa chaîne de parents. Sans ça, la ligne
  // sélectionnée est repliée sous un parent fermé, et rien à l'écran ne dit où
  // l'on est.
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

  /* ── Le filtre ─────────────────────────────────────────────────────────
     Filtrer un arbre en le gardant en arbre demande de décider quoi faire d'un
     parent qui ne correspond pas mais dont un enfant correspond. La réponse
     retenue est de ne PAS trancher : sous filtre, l'arbre devient une LISTE à
     plat des pages qui correspondent. On cherche une page, pas une branche. */
  const filtered = useMemo(() => {
    const needle = query.trim();
    if (!needle) return null;
    return pages
      .filter((page) => matchesFilter(needle, [page.title]))
      .sort((a, b) => a.title.localeCompare(b.title));
  }, [pages, query]);

  /* ── Le dépôt ──────────────────────────────────────────────────────────── */
  const [dragId, setDragId] = useState<string | null>(null);
  const [drop, setDrop] = useState<{ id: string; mode: PageDropMode } | null>(
    null
  );

  const endDrag = useCallback(() => {
    setDragId(null);
    setDrop(null);
  }, []);

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
            onToggle={() => {}}
            onCreateChild={onCreateChild}
            onTrash={onTrash}
          />
        ))}
      </div>
    );
  }

  const rows: React.ReactNode[] = [];
  const walk = (nodes: PageTreeNode<PageSummary>[]) => {
    for (const node of nodes) {
      const open = expanded.has(node.id);
      rows.push(
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
          onToggle={() => toggle(node.id)}
          onCreateChild={(parentId) => {
            if (!expanded.has(parentId)) {
              const next = new Set(expanded);
              next.add(parentId);
              persist(next);
            }
            onCreateChild(parentId);
          }}
          onTrash={onTrash}
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
  walk(tree);

  return <div className="flex flex-col gap-0.5 px-2 pt-2 pb-4">{rows}</div>;
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
  onToggle,
  onCreateChild,
  onTrash,
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
  /** La cible de dépôt courante, quand c'est CETTE ligne qui est survolée. */
  drop: PageDropMode | null;
  dragging: boolean;
  untitled: string;
  onToggle: () => void;
  onCreateChild: (parentId: string) => void;
  onTrash: (page: PageSummary) => void;
  onDragStart?: () => void;
  onDragOverRow?: (mode: PageDropMode) => void;
  onDropRow?: (mode: PageDropMode) => void;
  onDragEnd?: () => void;
}) {
  const t = useTranslations("Pages");
  const [menuOpen, setMenuOpen] = useState(false);
  // Moi compris : un autre onglet à moi est bien quelqu'un sur la page, et la
  // ligne ACTIVE est celle que je lis — on n'y met donc pas de pastille.
  const present = usePresentOn(active ? null : page.id);

  const modeFrom = (event: DragEvent<HTMLDivElement>): PageDropMode => {
    const rect = event.currentTarget.getBoundingClientRect();
    return dropModeAt(event.clientY - rect.top, rect.height);
  };

  return (
    <div
      className={cn(
        "group/page relative flex items-center rounded-md pr-1 transition-colors",
        active ? "bg-muted" : "hover:bg-muted/60 focus-within:bg-muted/60",
        dragging && "opacity-40",
        // « Dedans » se dit par le fond de la ligne cible, « avant / après » par
        // un trait à son bord : deux signaux différents pour deux gestes
        // différents, lisibles sans avoir à viser au pixel.
        drop === "inside" && "ring-1 ring-inset ring-primary"
      )}
      draggable={!!onDragStart}
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = "move";
        // Firefox n'amorce pas un glissé sans données.
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

      {/* Le retrait est porté par un cale à gauche du chevron, pas par un
          padding sur la ligne : le fond de survol doit courir sur toute la
          largeur de la colonne, à tous les niveaux. */}
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
            et pas un avatar : à cet endroit l'information utile est binaire —
            qui, on le lit en ouvrant la page. */}
        <PagePresenceDot count={present.length} />
      </Link>

      {/* Les deux gestes de survol. Ils réservent leur place (`opacity`, pas
          `hidden`) : sans ça le titre se raccourcirait au passage de la souris. */}
      <div
        className={cn(
          "flex shrink-0 items-center opacity-0 transition-opacity",
          "group-hover/page:opacity-100 group-focus-within/page:opacity-100",
          menuOpen && "opacity-100"
        )}
      >
        <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-6"
              aria-label={t("pageOptions")}
            >
              <MoreHorizontal className="size-3.5" />
            </Button>
          </DropdownMenuTrigger>
          {/* Le menu se taille sur SON texte, pas sur une largeur écrite ici :
              « Déplacer vers la corbeille » repassait à la ligne dans les 48
              unités qu'on lui donnait, et toute valeur fixe se refait périmer
              par la traduction suivante. */}
          <DropdownMenuContent
            align="start"
            className="w-auto min-w-48 [&_[role=menuitem]]:whitespace-nowrap"
          >
            <DropdownMenuItem onSelect={() => onCreateChild(page.id)}>
              <Plus className="size-4" />
              {t("newSubpage")}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onSelect={() => onTrash(page)}
            >
              <Trash2 className="size-4" />
              {t("deletePage")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
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
    </div>
  );
}
