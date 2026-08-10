import { Skeleton } from "mangue-ui";
import { SecondarySidebar } from "@/components/secondary-sidebar";

/**
 * Squelettes de segment (MIN-89).
 *
 * L'app est entièrement rendue côté client : sans `loading.tsx`, une transition
 * de route ne peint RIEN tant que le composant client n'est pas monté et que ses
 * propres skeletons n'apparaissent pas. Ces composants comblent exactement cet
 * intervalle, et sont volontairement calqués sur la mise en page réelle — un
 * squelette qui ne tombe pas au bon endroit produit un saut à l'hydratation,
 * ce qui est pire que l'écran vide qu'il remplace.
 *
 * Server Components : pas de "use client" ici, `Skeleton` est un simple <div>.
 */

/** Deux familles de gabarits dans l'app : page-document centrée, et board plein écran. */
type DocWidth = "3xl" | "5xl";

const MAX_W: Record<DocWidth, string> = {
  "3xl": "max-w-3xl",
  "5xl": "max-w-5xl",
};

/**
 * Page-document : titre puis blocs empilés. Reprend
 * `mx-auto w-full max-w-Nxl px-6 py-10` des pages concernées.
 */
export function DocPageSkeleton({
  width = "5xl",
  rows = 3,
  rowClassName = "h-24",
}: {
  width?: DocWidth;
  rows?: number;
  rowClassName?: string;
}) {
  return (
    <div className={`mx-auto w-full ${MAX_W[width]} px-6 py-10`}>
      <Skeleton className="mb-6 h-8 w-56" />
      <div className="flex flex-col gap-4">
        {Array.from({ length: rows }).map((_, i) => (
          <Skeleton key={i} className={`${rowClassName} rounded-xl`} />
        ))}
      </div>
    </div>
  );
}

/**
 * Les écrans à SIDEBAR SECONDAIRE : triage, retours, pull requests, sessions
 * d'agent, réglages. Une colonne de navigation pleine hauteur à gauche, une
 * colonne de cartes centrée à droite.
 *
 * Le squelette monte une VRAIE `SecondarySidebar`, et pas une colonne qui lui
 * ressemble : c'est le montage qui met la barre primaire au rail. Sans lui, une
 * navigation vers ces écrans déplierait la primaire et refermerait la gouttière
 * le temps du chargement, pour tout rouvrir à l'arrivée de l'écran — un
 * aller-retour de 376 px sur toute la moitié droite.
 */
export function ListDetailSkeleton({
  rows = 6,
  rowClassName = "h-14",
  cards = 3,
}: {
  rows?: number;
  rowClassName?: string;
  cards?: number;
}) {
  return (
    <div className="flex h-full min-h-0">
      <SecondarySidebar>
        <div className="flex flex-col gap-2 px-2 pt-2 pb-4">
          {Array.from({ length: rows }).map((_, i) => (
            <Skeleton key={i} className={`${rowClassName} rounded-lg`} />
          ))}
        </div>
      </SecondarySidebar>
      <div className="hidden min-h-0 min-w-0 flex-1 flex-col md:flex">
        <div className="shrink-0 px-4 py-3 md:px-6">
          <Skeleton className="h-8 w-48" />
        </div>
        <div className="min-h-0 flex-1 px-4 pt-1 pb-8 md:px-6">
          <div className="mx-auto flex max-w-3xl flex-col gap-4">
            {Array.from({ length: cards }).map((_, i) => (
              <Skeleton key={i} className="h-32 rounded-xl" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * L'onglet Pages (MIN-270) : un ARBRE à gauche, un document à droite.
 *
 * Il ne réutilise pas `ListDetailSkeleton` parce que les deux moitiés diffèrent
 * des deux côtés — une ligne d'arbre fait 28 px là où une carte de triage en
 * fait 56, et le panneau de droite est un document (titre puis paragraphes),
 * pas une pile de cartes. Un squelette qui ne tombe pas au bon endroit produit
 * un saut à l'arrivée de l'écran, ce qui est pire que rien.
 *
 * Les largeurs décroissantes des lignes imitent des titres de longueurs
 * différentes : six barres identiques se lisent comme un tableau, pas comme un
 * arbre.
 */
export function PageTreeSkeleton({ rows = 7 }: { rows?: number }) {
  const indents = [0, 16, 16, 0, 16, 32, 0];
  return (
    <div className="flex h-full min-h-0">
      <SecondarySidebar>
        <div className="flex flex-col gap-1.5 px-2 pt-2 pb-4">
          {Array.from({ length: rows }).map((_, i) => (
            <div key={i} className="flex items-center">
              <div style={{ width: indents[i % indents.length] }} />
              <Skeleton className="h-6 flex-1 rounded-md" />
            </div>
          ))}
        </div>
      </SecondarySidebar>
      <div className="hidden min-h-0 min-w-0 flex-1 flex-col md:flex">
        <div className="mx-auto w-full max-w-3xl px-6 py-10 md:px-10">
          <Skeleton className="size-12 rounded-lg" />
          <Skeleton className="mt-2 h-10 w-2/3" />
          <div className="mt-8 flex flex-col gap-3">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-11/12" />
            <Skeleton className="h-4 w-4/5" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        </div>
      </div>
    </div>
  );
}

/** Réglages (MIN-167) : le gabarit ci-dessus, avec des lignes d'onglets. */
export function SettingsPageSkeleton({ rows = 3 }: { rows?: number }) {
  return <ListDetailSkeleton rows={6} rowClassName="h-10" cards={rows} />;
}

/**
 * Board kanban : barre d'outils puis colonnes. Reprend la structure pleine
 * hauteur de `app/(app)/projects/[id]/page.tsx` (`flex h-full flex-col`, puis
 * `min-h-0 flex-1 px-6 pt-4`) pour que la bascule vers le vrai board ne déplace
 * ni la toolbar ni le haut des colonnes.
 */
export function BoardSkeleton({ columns = 4 }: { columns?: number }) {
  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 px-6 pt-4">
        <div className="flex items-center justify-between gap-3">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-8 w-32" />
        </div>
      </div>
      <div className="min-h-0 flex-1 px-6 pt-4">
        <div className="flex h-full gap-4 overflow-hidden">
          {Array.from({ length: columns }).map((_, col) => (
            <div key={col} className="flex min-w-[260px] flex-1 flex-col gap-3">
              <Skeleton className="h-5 w-28" />
              {/* Colonnes dégressives : un mur de cartes identiques lit comme un
                  bug d'affichage, pas comme un chargement. */}
              {Array.from({ length: Math.max(1, 4 - col) }).map((_, card) => (
                <Skeleton key={card} className="h-24 rounded-xl" />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Page pleine hauteur à contenu centré (objectifs, triage) :
 * `min-h-0 flex-1 overflow-y-auto px-6 py-8` + `mx-auto max-w-5xl`.
 */
export function ScrollPageSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-8">
        <div className="mx-auto max-w-5xl">
          <Skeleton className="mb-6 h-8 w-56" />
          <div className="flex flex-col gap-4">
            {Array.from({ length: rows }).map((_, i) => (
              <Skeleton key={i} className="h-20 rounded-xl" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
