"use client";

// L'onglet PAGES d'un projet (MIN-270) : la barre secondaire et son arbre.
//
// Il vit dans le LAYOUT du segment, pas dans chacune de ses pages. Deux raisons,
// et la seconde suffit : l'arbre ne se remonte pas d'une page à l'autre (état
// d'ouverture, position de défilement, requête), et la barre secondaire ne
// disparaît donc jamais le temps d'une navigation — c'est elle qui tient la
// sidebar primaire au rail.

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Skeleton, Tooltip, TooltipContent, TooltipTrigger, cn, toast } from "mangue-ui";
import { Plus, Trash2 } from "lucide-react";

import { SecondarySidebar } from "@/components/secondary-sidebar";
import { PageTree } from "@/components/pages/page-tree";
import { usePagesQuery } from "@/lib/use-pages-query";
import { computePageMove, type PageDropMode } from "@/lib/pages-move";
import { isPageCycleError, type PageSummary } from "@/lib/pages-api";
import { useTrashQuery } from "@/lib/use-trash-query";

export function PagesShell({ children }: { children: React.ReactNode }) {
  const t = useTranslations("Pages");
  const tCommon = useTranslations("Common");
  const params = useParams<{ id: string }>();
  const projectId = params.id;
  const router = useRouter();
  const pathname = usePathname();

  const base = `/projects/${projectId}/pages`;
  const activePageId = useMemo(() => {
    const rest = pathname.startsWith(`${base}/`) ? pathname.slice(base.length + 1) : "";
    const segment = rest.split("/")[0];
    return segment && segment !== "trash" ? segment : null;
  }, [pathname, base]);

  const { pages, tree, loading, createPage, updatePage, trashPage, restorePage } =
    usePagesQuery(projectId);
  const [query, setQuery] = useState("");

  // La corbeille du projet ne s'affiche que si elle a quelque chose : une entrée
  // permanente en bas de l'arbre serait, la plupart du temps, un lien vers une
  // page vide.
  const { items: trashItems } = useTrashQuery();
  const trashedPages = trashItems.filter(
    (item) => item.type === "page" && item.project_id === projectId
  ).length;

  const create = useCallback(
    async (parentId: string | null) => {
      try {
        // La position est calculée par le SERVEUR (fin de la fratrie) : il est
        // le seul à voir les pages que ce client n'a pas encore.
        const page = await createPage({ parent_id: parentId });
        router.push(`${base}/${page.id}`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : t("createFailed"));
      }
    },
    [createPage, pages, router, base, t]
  );

  const move = useCallback(
    (dragId: string, targetId: string, mode: PageDropMode) => {
      const patch = computePageMove(pages, dragId, targetId, mode);
      // `null` = geste sans effet (sur soi-même) ou boucle : rien à dire, rien
      // n'a bougé à l'écran non plus.
      if (!patch) return;
      void updatePage(dragId, patch).catch((err: unknown) => {
        // L'arbre est déjà revenu en place (le cache a été rejoué à l'envers) ;
        // il reste à DIRE pourquoi, sinon le geste semble n'avoir servi à rien.
        toast.error(
          isPageCycleError(err)
            ? t("moveCycle")
            : err instanceof Error
              ? err.message
              : t("moveFailed")
        );
      });
    },
    [pages, updatePage, t]
  );

  const trash = useCallback(
    (page: PageSummary) => {
      void (async () => {
        try {
          const trashed = await trashPage(page.id);
          // Ouvert sur une page qui vient de partir à la corbeille : on remonte
          // à la liste plutôt que de laisser un document fantôme à l'écran.
          if (activePageId === page.id) router.push(base);
          toast.success(
            trashed > 1
              ? t("trashedWithChildren", { count: trashed })
              : t("trashed", { title: page.title || t("untitled") }),
            {
              action: {
                label: tCommon("undo"),
                onClick: () => void restorePage(page.id),
              },
            }
          );
        } catch (err) {
          toast.error(err instanceof Error ? err.message : t("deleteFailed"));
        }
      })();
    },
    [trashPage, restorePage, activePageId, router, base, t, tCommon]
  );

  return (
    <div className="flex h-full min-h-0">
      <SecondarySidebar
        title={t("title")}
        hiddenOnMobile={pathname !== base}
        filter={{
          value: query,
          onChange: setQuery,
          placeholder: t("filterPlaceholder", { count: pages.length }),
          clearLabel: tCommon("clearFilter"),
        }}
        actions={
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-7"
                aria-label={t("newPage")}
                onClick={() => void create(null)}
              >
                <Plus className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t("newPage")}</TooltipContent>
          </Tooltip>
        }
      >
        {loading ? (
          <div className="flex flex-col gap-1.5 px-2 pt-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-7 rounded-md" />
            ))}
          </div>
        ) : pages.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">
            {t("sidebarEmpty")}
          </p>
        ) : (
          <PageTree
            projectId={projectId}
            pages={pages}
            tree={tree}
            activePageId={activePageId}
            query={query}
            onCreateChild={(parentId) => void create(parentId)}
            onMove={move}
            onTrash={trash}
          />
        )}

        {trashedPages > 0 && !query ? (
          <div className="mt-auto border-t border-border px-2 py-2">
            <Link
              href={`${base}/trash`}
              className={cn(
                "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
                pathname === `${base}/trash`
                  ? "bg-muted font-medium"
                  : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
              )}
            >
              <Trash2 className="size-3.5 shrink-0" />
              <span className="min-w-0 flex-1 truncate">{t("trashTitle")}</span>
              <span className="shrink-0 text-xs tabular-nums">{trashedPages}</span>
            </Link>
          </div>
        ) : null}
      </SecondarySidebar>

      <div
        className={cn(
          "min-h-0 min-w-0 flex-1 flex-col md:flex",
          pathname === base ? "hidden" : "flex"
        )}
      >
        {children}
      </div>
    </div>
  );
}
