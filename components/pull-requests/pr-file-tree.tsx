"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { cn, Popover, PopoverContent, PopoverTrigger } from "mangue-ui";
import {
  ChevronDown,
  ChevronRight,
  FileMinus,
  FilePen,
  FilePlus,
  FileSymlink,
} from "lucide-react";
import type { PullRequestFile } from "@/lib/agent-api";
import {
  buildFileTree,
  FILE_STATUS_LABELS,
  type FileStatus,
  type FileTreeNode,
} from "@/lib/pr-file-tree";

/**
 * « Qu'est-ce que cette PR touche, et emmène-moi à ce fichier » (MIN-182) —
 * l'arbre des fichiers modifiés, dans un panneau qui s'ouvre depuis le compteur
 * de la barre du diff.
 *
 * **Un panneau, pas une colonne.** Mesuré : sur un portable de 1512 px, une fois
 * la barre principale et la liste des PR déduites, le diff a ~890 px. Une
 * colonne latérale façon GitHub (240–280 px) en prendrait presque un tiers — et
 * pour rien, parce qu'un arbre ne se réduit pas : l'information EST le chemin, et
 * `pr-di…` ne distingue plus `pr-diff.tsx` de `pr-detail.tsx`. Posé PAR-DESSUS le
 * diff, le panneau peut faire 380 px et montrer les chemins en entier, le temps
 * qu'on choisisse.
 *
 * **Un `Popover`, et pas une feuille.** Deux des trois surfaces qui rendent
 * `PrDiff` SONT déjà des `Sheet` (le diff d'un commit, celui d'un run d'agent) :
 * en imbriquer une seconde ferait deux surcouches, deux pièges de focus et deux
 * Échap qui se disputent. Un seul geste partout, donc, et pas de bifurcation
 * mobile à écrire ni à vérifier.
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
 * Les rails d'indentation : un trait vertical par niveau au-dessus de la ligne.
 *
 * C'est eux qui disent « qui est dans quoi ». Un simple retrait laisse l'œil
 * mesurer des distances ; le trait, lui, RELIE — on remonte du fichier à son
 * dossier en suivant une ligne, sans compter les pixels. Sur un diff de dix-sept
 * fichiers c'est la différence entre une liste et un arbre.
 *
 * Chaque rail fait 16 px et pose son trait à 7 px de son bord : le trait tombe
 * donc pile au CENTRE du chevron du niveau au-dessus, et la colonne est continue
 * d'une ligne à l'autre. `self-stretch` le fait courir sur toute la hauteur de la
 * ligne, y compris quand un chemin long passe sur deux lignes.
 */
function Rails({ depth }: { depth: number }) {
  return Array.from({ length: depth }, (_, i) => (
    <span
      key={i}
      aria-hidden
      className="ml-[7px] w-[9px] shrink-0 self-stretch border-l border-border"
    />
  ));
}

/**
 * Éteint la ponctuation d'un libellé — les `/` d'un dossier replié, la flèche
 * d'un renommage. C'est le NOM qu'on cherche des yeux, pas ce qui l'articule :
 * dans `components/pull-requests`, deux séparateurs pleine encre feraient trois
 * mots de force égale.
 */
function Segmented({ label }: { label: string }) {
  return label.split(/( → |\/)/).map((part, i) =>
    part === "/" || part === " → " ? (
      <span key={i} className="text-muted-foreground/70">
        {part}
      </span>
    ) : (
      <span key={i}>{part}</span>
    ),
  );
}

function Counters({ additions, deletions }: { additions: number; deletions: number }) {
  const t = useTranslations("PullRequests");
  return (
    <span className="ml-2 flex shrink-0 items-center gap-1 pt-px text-[11px] tabular-nums">
      <span
        className="text-emerald-600 dark:text-emerald-400"
        title={t("linesAdded", { count: additions })}
      >
        +{additions}
      </span>
      <span className="text-red-600 dark:text-red-400" title={t("linesRemoved", { count: deletions })}>
        −{deletions}
      </span>
    </span>
  );
}

/**
 * Le squelette commun aux deux lignes. Sans `gap` : les rails se touchent pour
 * former une colonne, et les écarts sont posés un par un après eux.
 */
const ROW_CLASS =
  "flex w-full items-start rounded-md py-1 pr-2 pl-1.5 text-left transition-colors hover:bg-muted";

function TreeRows({
  nodes,
  depth,
  closed,
  onToggleDir,
  onSelect,
}: {
  nodes: FileTreeNode[];
  depth: number;
  /** Les dossiers REFERMÉS : tout est ouvert au départ, on ne note que l'écart. */
  closed: ReadonlySet<string>;
  onToggleDir: (path: string) => void;
  onSelect: (path: string) => void;
}) {
  const t = useTranslations("PullRequests");

  return (
    <ul className="flex flex-col">
      {nodes.map((node) => {
        if (node.kind === "dir") {
          const open = !closed.has(node.path);
          return (
            <li key={node.path}>
              <button
                type="button"
                onClick={() => onToggleDir(node.path)}
                aria-expanded={open}
                className={ROW_CLASS}
              >
                <Rails depth={depth} />
                {open ? (
                  <ChevronDown className="mt-px size-3.5 shrink-0 text-muted-foreground" />
                ) : (
                  <ChevronRight className="mt-px size-3.5 shrink-0 text-muted-foreground" />
                )}
                {/* Le dossier en demi-gras, le fichier en normal : c'est la
                    structure qui porte, et le nom de fichier qu'on lit ensuite.
                    `break-words` et pas `truncate` — un chemin tronqué ne désigne
                    plus rien, deux lignes valent mieux qu'un préfixe. */}
                <span className="ml-1.5 min-w-0 flex-1 font-mono text-xs font-medium break-words">
                  <Segmented label={node.label} />
                </span>
                <Counters additions={node.additions} deletions={node.deletions} />
              </button>
              {open ? (
                <TreeRows
                  nodes={node.children}
                  depth={depth + 1}
                  closed={closed}
                  onToggleDir={onToggleDir}
                  onSelect={onSelect}
                />
              ) : null}
            </li>
          );
        }

        const Icon = STATUS_ICONS[node.status];
        const status = t(FILE_STATUS_LABELS[node.status]);
        return (
          <li key={node.path}>
            <button
              type="button"
              onClick={() => onSelect(node.path)}
              // Le chemin ENTIER, renommage compris : la ligne dit le nom, ce
              // survol dit d'où il vient.
              title={
                node.file.previous_filename
                  ? `${node.file.previous_filename} → ${node.path}`
                  : node.path
              }
              className={ROW_CLASS}
            >
              <Rails depth={depth} />
              <span className={cn("mt-px shrink-0", STATUS_COLORS[node.status])} title={status}>
                <Icon className="size-3.5" aria-hidden />
                <span className="sr-only">{status}</span>
              </span>
              <span className="ml-1.5 min-w-0 flex-1 font-mono text-xs break-words">
                <Segmented label={node.label} />
              </span>
              <Counters additions={node.additions} deletions={node.deletions} />
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export function PrFileTreeButton({
  files,
  totalAdditions,
  totalDeletions,
  onSelect,
}: {
  files: PullRequestFile[];
  totalAdditions: number;
  totalDeletions: number;
  /** Emmène au fichier : le parent déplie la carte, puis y défile. */
  onSelect: (path: string) => void;
}) {
  const t = useTranslations("PullRequests");
  const [open, setOpen] = useState(false);
  const [closed, setClosed] = useState<ReadonlySet<string>>(() => new Set());

  /**
   * Le panneau de Numo l'avait déjà appris : dans un `Sheet` modal,
   * react-remove-scroll bloque la molette sur tout ce qui est porté à `<body>`.
   * Deux de nos trois surfaces EN SONT — sans ça, l'arbre d'une PR de quarante
   * fichiers ne défilerait pas. On le porte donc dans la feuille quand il y en a
   * une, et à `<body>` sinon.
   */
  const [container, setContainer] = useState<HTMLElement | null>(null);
  const triggerRef = useCallback((node: HTMLButtonElement | null) => {
    setContainer(
      node ? (node.closest('[data-slot="sheet-content"]') as HTMLElement | null) : null,
    );
  }, []);

  const tree = useMemo(() => buildFileTree(files), [files]);

  const toggleDir = useCallback((path: string) => {
    setClosed((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  /**
   * Un saut vient d'avoir lieu — donc le focus est DÉJÀ posé, sur l'en-tête du
   * fichier visé. Radix, lui, rend le focus au déclencheur à la fermeture, et le
   * navigateur ramène le défilement avec : le saut serait défait sous nos yeux.
   * Le drapeau ne vaut que pour ce cas-là ; sur Échap ou un clic à côté, la
   * restitution normale reste la bonne.
   */
  const jumped = useRef(false);

  const select = useCallback(
    (path: string) => {
      jumped.current = true;
      // Fermé AVANT le saut : le panneau couvre le diff, et on veut voir arriver
      // le fichier, pas le retrouver derrière un panneau resté ouvert.
      setOpen(false);
      onSelect(path);
    },
    [onSelect],
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          ref={triggerRef}
          type="button"
          title={t("fileTreeHint")}
          className="group -mx-1.5 flex min-w-0 items-center rounded-md px-1.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground data-[state=open]:bg-muted data-[state=open]:text-foreground"
        >
          <span className="truncate">{t("fileCount", { count: files.length })}</span>
          <span className="ml-2 shrink-0 tabular-nums text-emerald-600 dark:text-emerald-400">
            +{totalAdditions}
          </span>
          <span className="ml-1 shrink-0 tabular-nums text-red-600 dark:text-red-400">
            −{totalDeletions}
          </span>
          <ChevronDown className="ml-1 size-3.5 shrink-0 transition-transform group-data-[state=open]:rotate-180" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        container={container}
        onCloseAutoFocus={(event) => {
          if (!jumped.current) return;
          jumped.current = false;
          event.preventDefault();
        }}
        // 384 px au large, et la largeur de l'écran moins ses marges en dessous
        // — les chemins entiers plutôt qu'une colonne qui les tronquerait.
        className="w-[min(24rem,calc(100vw_-_2rem))] gap-0 p-0"
      >
        <p className="border-b border-border px-3 py-2 text-xs font-medium text-foreground">
          {t("fileTreeTitle")}
        </p>
        <div className="max-h-[min(26rem,60vh)] overflow-y-auto p-1.5">
          <TreeRows
            nodes={tree}
            depth={0}
            closed={closed}
            onToggleDir={toggleDir}
            onSelect={select}
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}
