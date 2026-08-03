import { Skeleton } from "mangue-ui";

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
 * Réglages (MIN-167) : titre, composeur, puis le rail d'onglets À GAUCHE et la
 * colonne de cartes à droite. `DocPageSkeleton` dessinait quatre blocs pleine
 * largeur sans rail — la bascule vers le vrai écran déplaçait tout.
 * Reprend `mx-auto max-w-[1040px] p-4 md:p-8` et la grille du `SettingsShell`.
 */
export function SettingsPageSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="mx-auto w-full max-w-[1040px] space-y-8 p-4 md:p-8">
      <Skeleton className="h-8 w-56" />
      <Skeleton className="h-14 w-full rounded-xl" />
      <div className="grid grid-cols-1 gap-6 md:grid-cols-[220px_1fr] md:items-start md:gap-8">
        <div className="flex flex-col gap-1.5">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-full rounded-md" />
          ))}
        </div>
        <div className="flex min-w-0 flex-col gap-4">
          {Array.from({ length: rows }).map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-xl" />
          ))}
        </div>
      </div>
    </div>
  );
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
