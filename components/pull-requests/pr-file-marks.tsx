"use client";

import { useTranslations } from "next-intl";
import { cn } from "mangue-ui";
import { FileMinus, FilePen, FilePlus, FileSymlink } from "lucide-react";
import { FILE_STATUS_LABELS, type FileStatus } from "@/lib/pr-file-tree";

/**
 * Les quatre marques d'un fichier dans un diff : ce qui lui est arrivé, son
 * chemin, ce qu'il pèse, et la proportion. Extraites de `pr-diff` et
 * `pr-file-tree` parce qu'une troisième surface les demandait — le bloc
 * « fichiers changés » d'un tour d'agent, qui les écrivait jusque-là dans son
 * propre vocabulaire (une phrase en texte plat, « modifié app/… ») et ne
 * ressemblait à rien d'autre.
 *
 * Une liste de fichiers touchés se lit pareil partout dans minddy : l'icône dit
 * la nature du changement, le mono dit le chemin (dossier éteint, nom en avant),
 * les compteurs disent le volume. Des composants, pas des recopies de classes —
 * la couleur du vert « ajouté » ne se décide qu'ici.
 */

const STATUS_ICONS = {
  added: FilePlus,
  removed: FileMinus,
  renamed: FileSymlink,
  modified: FilePen,
} as const satisfies Record<FileStatus, unknown>;

/** Mêmes couleurs que le badge de la carte de fichier, en trait plutôt qu'en aplat. */
const STATUS_COLORS: Record<FileStatus, string> = {
  added: "text-green-600 dark:text-green-400",
  removed: "text-destructive",
  renamed: "text-violet-600 dark:text-violet-400",
  modified: "text-blue-600 dark:text-blue-400",
};

/**
 * Ce qui est arrivé au fichier, dit en icône et en couleur. Le mot reste
 * accessible (infobulle + lecteur d'écran) : la couleur seule ne dit rien à qui
 * ne la voit pas, et deux icônes de fichier se ressemblent de loin.
 */
export function FileStatusIcon({
  status,
  className,
}: {
  status: FileStatus;
  className?: string;
}) {
  const t = useTranslations("PullRequests");
  const Icon = STATUS_ICONS[status];
  const label = t(FILE_STATUS_LABELS[status]);
  return (
    <span className={cn("shrink-0", STATUS_COLORS[status], className)} title={label}>
      <Icon className="size-3.5" aria-hidden />
      <span className="sr-only">{label}</span>
    </span>
  );
}

/**
 * Le chemin complet, dossier éteint et nom de fichier en avant : dans une liste
 * de chemins qui partagent leurs six premiers segments, c'est le dernier qu'on
 * cherche des yeux. Un renommage se dit en préfixe, du même gris que le dossier.
 */
export function FilePathLabel({
  path,
  previousPath,
  className,
}: {
  path: string;
  /** Chemin AVANT, pour un renommage seulement. */
  previousPath?: string | null;
  className?: string;
}) {
  const slash = path.lastIndexOf("/");
  const dir = slash === -1 ? "" : path.slice(0, slash + 1);
  const name = slash === -1 ? path : path.slice(slash + 1);
  return (
    <span
      className={cn("min-w-0 flex-1 truncate font-mono text-xs", className)}
      title={previousPath ? `${previousPath} → ${path}` : path}
    >
      {previousPath ? <span className="text-muted-foreground">{previousPath} → </span> : null}
      <span className="text-muted-foreground">{dir}</span>
      <span className="font-medium">{name}</span>
    </span>
  );
}

/**
 * Le volume, en lignes. `tabular-nums` pour que les colonnes d'une liste
 * s'alignent, et que le chiffre ne danse pas quand un direct le fait changer.
 */
export function DiffCounters({
  additions,
  deletions,
  hideEmpty = false,
  className,
}: {
  additions: number;
  deletions: number;
  /**
   * Taire un compteur à zéro. Pour la vue LIVE d'un tour d'agent, où git n'a
   * encore rien compté : « +0 −0 » sur chaque ligne se lirait comme une mesure,
   * alors que c'est une absence de mesure.
   */
  hideEmpty?: boolean;
  className?: string;
}) {
  const t = useTranslations("PullRequests");
  return (
    <span className={cn("flex shrink-0 items-center gap-1 text-[11px] tabular-nums", className)}>
      {hideEmpty && additions === 0 ? null : (
        <span
          className="text-emerald-600 dark:text-emerald-400"
          title={t("linesAdded", { count: additions })}
        >
          +{additions}
        </span>
      )}
      {hideEmpty && deletions === 0 ? null : (
        <span
          className="text-red-600 dark:text-red-400"
          title={t("linesRemoved", { count: deletions })}
        >
          −{deletions}
        </span>
      )}
    </span>
  );
}

/**
 * Le carré de cinq blocs de GitHub : la proportion d'ajouts et de retraits, lue
 * d'un coup d'oeil. Les compteurs chiffrés disent le volume, cette barre dit la
 * NATURE du changement — un fichier réécrit et un fichier étoffé ne se
 * ressemblent pas, même à +40/−40.
 */
export function DiffStatBar({ additions, deletions }: { additions: number; deletions: number }) {
  const total = additions + deletions;
  // Un côté non nul vaut toujours au moins un bloc, et jamais les cinq quand
  // l'autre existe : sur +2/−300, l'arrondi effacerait sinon l'ajout, et un
  // fichier purement ajouté ne se distinguerait plus d'un fichier retouché.
  const green =
    total === 0
      ? 0
      : deletions === 0
        ? 5
        : additions === 0
          ? 0
          : Math.min(4, Math.max(1, Math.round((additions / total) * 5)));
  const red = total === 0 ? 0 : 5 - green;

  return (
    <span className="flex shrink-0 gap-px" aria-hidden>
      {Array.from({ length: 5 }, (_, i) => (
        <span
          key={i}
          className={cn(
            "size-2 rounded-[1px]",
            i < green
              ? "bg-emerald-500 dark:bg-emerald-400"
              : i < green + red
                ? "bg-red-500 dark:bg-red-400"
                : "bg-border",
          )}
        />
      ))}
    </span>
  );
}
