"use client";

// L'onglet PAGES d'un projet (MIN-270) : la barre secondaire et son arbre.
//
// Il vit dans le LAYOUT du segment, pas dans chacune de ses pages. Deux raisons,
// et la seconde suffit : l'arbre ne se remonte pas d'une page à l'autre (état
// d'ouverture, position de défilement, requête), et la barre secondaire ne
// disparaît donc jamais le temps d'une navigation — c'est elle qui tient la
// sidebar primaire au rail.
//
// Ce qu'il n'y a PAS au bas de l'arbre : une entrée « Corbeille ». Le plan en
// prévoyait une ; c'était un doublon. La corbeille de l'application (/trash)
// recueille déjà les pages supprimées, avec leur projet et leur délai de purge,
// à côté des tickets et des objectifs — un second chemin vers la même liste
// oblige surtout à se demander lequel des deux dit vrai.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Button,
  Skeleton,
  cn,
  toast,
} from "mangue-ui";
import { Plus } from "lucide-react";

import { SecondarySidebar } from "@/components/secondary-sidebar";
import { PageTree } from "@/components/pages/page-tree";
import { PagePresenceProvider } from "@/components/pages/page-presence";
import { usePagesQuery } from "@/lib/use-pages-query";
import { computePageMove, type PageDropMode } from "@/lib/pages-move";
import { isPageCycleError, type PageSummary } from "@/lib/pages-api";
import { rememberLastPage } from "@/lib/pages-last-open";
import { markDraftPage } from "@/lib/pages-draft";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

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

  const { pages, tree, loading, createPage, updatePage, trashPage } =
    usePagesQuery(projectId);
  const [query, setQuery] = useState("");

  // La page ouverte est retenue ICI plutôt que dans `PageView` : la coquille
  // traverse les navigations, donc elle voit le DERNIER état de l'onglet, y
  // compris le retour à la liste après une mise à la corbeille. C'est
  // `app/(app)/projects/[id]/pages/page.tsx` qui la relit à l'ouverture.
  useEffect(() => {
    if (activePageId) rememberLastPage(projectId, activePageId);
  }, [projectId, activePageId]);

  const create = useCallback(
    async (parentId: string | null) => {
      try {
        // La position est calculée par le SERVEUR (fin de la fratrie) : il est
        // le seul à voir les pages que ce client n'a pas encore.
        const page = await createPage({ parent_id: parentId });
        // Elle est en base, mais elle n'est pas encore acquise : quitter sans y
        // écrire une lettre la détruit (lib/pages-draft.ts). Créer une page
        // n'est pas la sauvegarder.
        markDraftPage(page.id);
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

  /**
   * Épingler / désépingler, depuis le menu ⋯ d'une ligne de l'arbre.
   *
   * L'écriture est optimiste comme le déplacement (`usePagesQuery`) : la ligne
   * saute en tête de la barre à la seconde du clic. Un favori qui attendrait le
   * serveur donnerait un menu qui se referme sur rien — le geste est trop petit
   * pour qu'on lui accorde une attente.
   */
  const toggleFavorite = useCallback(
    (page: PageSummary) => {
      void updatePage(page.id, { favorite: !page.favorite }).catch(
        (err: unknown) => {
          toast.error(
            err instanceof Error ? err.message : t("favoriteFailed")
          );
        }
      );
    },
    [updatePage, t]
  );

  const trash = useCallback(
    (page: PageSummary) => {
      void (async () => {
        try {
          const trashed = await trashPage(page.id);
          // Ouvert sur une page qui vient de partir à la corbeille : on remonte
          // à la liste plutôt que de laisser un document fantôme à l'écran.
          if (activePageId === page.id) router.push(base);
          // Un toast NU, comme partout ailleurs dans l'app. Il portait un
          // bouton « Annuler » — le seul du dépôt, et sonner l'habille de son
          // bouton par défaut : au milieu des autres notifications, il ne
          // ressemblait à rien de connu. Le retour en arrière n'est pas perdu
          // pour autant : la Corbeille apparaît au bas de l'arbre à la seconde
          // où la page en part, et restaurer y tient en un clic.
          toast.success(
            trashed > 1
              ? t("trashedWithChildren", { count: trashed })
              : t("trashed", { title: page.title || t("untitled") })
          );
        } catch (err) {
          toast.error(err instanceof Error ? err.message : t("deleteFailed"));
        }
      })();
    },
    [trashPage, activePageId, router, base, t]
  );

  // Un projet SANS AUCUNE page n'a pas d'arbre à montrer, et une barre
  // secondaire vide n'est pas un état neutre : c'est un meuble qui prend un
  // quart de l'écran pour dire qu'il ne contient rien, à côté d'un panneau qui
  // le dit déjà. La barre n'apparaît donc qu'à la première page — et l'écran
  // d'accueil de l'onglet (app/(app)/projects/[id]/pages/page.tsx) occupe alors
  // toute la largeur, avec son unique bouton.
  //
  // Pendant le CHARGEMENT, on garde la barre (et ses squelettes) : la retirer
  // pour la remettre une fraction de seconde plus tard ferait sauter la mise en
  // page à chaque arrivée dans l'onglet, sur la quasi-totalité des projets.
  const bare = !loading && pages.length === 0;

  return (
    // La PRÉSENCE est ouverte ici, et pas dans la page : la coquille traverse
    // les navigations, la page ouverte non (MIN-271).
    <PagePresenceProvider projectId={projectId} pageId={activePageId}>
    <div className="flex h-full min-h-0">
      {bare ? null : (
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
          // Atteignable seulement le temps d'un chargement qui vient de finir à
          // vide, avant que `bare` ne retire la barre : le filtre, lui, peut
          // aussi vider l'ARBRE sans vider le projet, et c'est `PageTree` qui le
          // dit.
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
            onToggleFavorite={toggleFavorite}
          />
        )}
      </SecondarySidebar>
      )}

      <div
        className={cn(
          "min-h-0 min-w-0 flex-1 flex-col md:flex",
          // Sans barre secondaire, il n'y a plus de « liste à gauche » à
          // laisser seule sur mobile : ce panneau EST l'onglet.
          bare || pathname !== base ? "flex" : "hidden"
        )}
      >
        {children}
      </div>
    </div>
    </PagePresenceProvider>
  );
}
