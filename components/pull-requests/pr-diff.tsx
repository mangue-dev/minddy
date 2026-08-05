"use client";

import { useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { useLocale, useTranslations } from "next-intl";
import { Badge, cn, SegmentedControl, toast, useIsMobile, useTheme } from "mangue-ui";
import { ChevronDown, ChevronRight, WrapText } from "lucide-react";
import { applyPatch } from "diff";
import { getLineAnnotationName, parsePatchFiles } from "@pierre/diffs";
import { FileDiff } from "@pierre/diffs/react";
import { PrDiffWorkers } from "@/components/pull-requests/pr-diff-workers";
import type {
  DiffLineAnnotation,
  FileDiff as FileDiffInstance,
  FileDiffContentsLoader,
  FileDiffMetadata,
  DiffLineEventBaseProps,
  PostRenderPhase,
  SelectedLineRange,
} from "@pierre/diffs";
import {
  fetchPrFileSourceApi,
  postPrReviewCommentApi,
  type ApiError,
  type PrEndpoint,
  type PullRequestFile,
  type PullRequestReviewComment,
} from "@/lib/agent-api";
import { noPatchKind } from "@/lib/diff-binary";
import {
  DIFF_LINE_DIFF_TYPE,
  DIFF_RANGE_ATTRIBUTE,
  DIFF_THEMES,
  DIFF_UNSAFE_CSS,
} from "@/lib/diff-theme";
import { PrImageDiff } from "@/components/pull-requests/pr-image-diff";
import { PrFileTreeButton } from "@/components/pull-requests/pr-file-tree";
import {
  fileAnchorId,
  fileStatusOf,
  FILE_STATUS_LABELS,
  type FileStatus,
} from "@/lib/pr-file-tree";
import { groupReviewThreads, type ReviewThreadState } from "@/lib/pr-review-threads";
import type { ReviewCommentReaction } from "@/lib/pr-review-reactions";
import type { RepoProviderId } from "@/lib/repo-providers";
import {
  anchorKey,
  commentAnchor,
  lineKind,
  sharedStartLine,
  threadAnchor,
  toGithubSide,
  type CommentAnchor,
  type DiffSide,
  type PrReviewThread,
} from "@/lib/pr-diff-anchors";
import {
  LineComposer,
  LineWidget,
  ReviewThreadCard,
  StaleThreads,
  useCommentReactions,
  useReviewReplies,
  useThreadResolution,
} from "@/components/pull-requests/pr-review-comments";

/**
 * Vue diff d'une PR (MIN-66, passée à `@pierre/diffs` en MIN-181) : liste de
 * fichiers repliables avec compteurs +/−, bascule unifié ↔ côte-à-côte, et
 * dépliage du contexte masqué entre les hunks façon GitHub. Consommée par le
 * panneau de détail d'une PR (pr-detail), les feuilles de diff d'un commit et
 * d'un run d'agent.
 *
 * GitHub renvoie un `patch` par fichier (fragment de hunks) : on reconstruit un
 * diff unifié complet autour, puis on le fait analyser par la lib. Les fichiers
 * binaires/trop gros arrivent sans `patch` → repli « voir sur GitHub ».
 *
 * Ce que la lib prend en charge, et qui vivait ici avant : la coloration
 * (Shiki, hors du rendu, donc plus de plafond de lignes), le marquage mot-à-mot
 * des lignes retouchées, les barres de dépliage, la virtualisation, la
 * sélection multi-lignes. Ce qui reste à nous : la carte du fichier, l'ancrage
 * des fils de review, et les deux règles de la forge qui décident où un
 * commentaire a le droit d'aller.
 */

/** Nombre de lignes qu'une flèche déplie d'un coup (comme GitHub). */
const EXPANSION_LINE_COUNT = 20;

type ViewType = "unified" | "split";

/**
 * Ce qu'une annotation transporte jusqu'à `renderAnnotation` : la clé d'ancre
 * (qui indexe brouillons et composers) et les fils à empiler sous la ligne.
 */
interface AnnotationMeta {
  key: string;
  line: number;
  threads: PrReviewThread[];
}

type ThreadAnnotation = DiffLineAnnotation<AnnotationMeta>;

/** Chemin qui adresse la version de base : l'ancien nom si le fichier a été renommé. */
function basePathOf(f: PullRequestFile): string {
  return f.previous_filename ?? f.filename;
}

/** Reconstruit un diff unifié complet à partir du patch par-fichier de GitHub. */
export function toUnifiedDiff(f: PullRequestFile): string {
  if (!f.patch) return "";
  const base = basePathOf(f);
  const oldPath = f.status === "added" ? "/dev/null" : `a/${base}`;
  const newPath = f.status === "removed" ? "/dev/null" : `b/${f.filename}`;
  return `diff --git a/${base} b/${f.filename}\n--- ${oldPath}\n+++ ${newPath}\n${f.patch}\n`;
}

/**
 * Ce qu'est arrivé au fichier, dit en couleur — même forme que les badges
 * d'état de PR (`pr-state-badge`) : teinte à 10 %, bord à 20 %, jamais un aplat.
 * Et mêmes couleurs que là-bas, pour que le vert veuille dire la même chose d'un
 * bout à l'autre de la page : vert ajouté, rouge supprimé, violet renommé, bleu
 * modifié.
 */
const FILE_STATUS_STYLES: Record<FileStatus, string> = {
  added:
    "border-green-600/20 bg-green-600/10 text-green-700 dark:border-green-500/25 dark:bg-green-500/15 dark:text-green-400",
  removed: "border-destructive/20 bg-destructive/10 text-destructive dark:bg-destructive/15",
  renamed:
    "border-violet-600/20 bg-violet-600/10 text-violet-700 dark:border-violet-500/25 dark:bg-violet-500/15 dark:text-violet-400",
  modified:
    "border-blue-600/20 bg-blue-600/10 text-blue-700 dark:border-blue-500/25 dark:bg-blue-500/15 dark:text-blue-400",
};

function FileStatusBadge({ status }: { status: FileStatus }) {
  const t = useTranslations("PullRequests");
  return (
    <Badge
      variant="secondary"
      className={cn("h-5 shrink-0 px-2 text-[10px]", FILE_STATUS_STYLES[status])}
    >
      {t(FILE_STATUS_LABELS[status])}
    </Badge>
  );
}

/**
 * Le carré de cinq blocs de GitHub : la proportion d'ajouts et de retraits, lue
 * d'un coup d'oeil. Les compteurs chiffrés disent le volume, cette barre dit la
 * NATURE du changement — un fichier réécrit et un fichier étoffé ne se
 * ressemblent pas, même à +40/−40.
 */
function DiffStatBar({ additions, deletions }: { additions: number; deletions: number }) {
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

/** Pose un attribut seulement s'il change — la passe tourne à chaque rendu. */
function setLabel(node: Element, label: string) {
  if (node.getAttribute("aria-label") !== label) node.setAttribute("aria-label", label);
}

/** Plage couverte par une remarque, dans le vocabulaire de la lib. */
interface CommentRange {
  side: DiffSide;
  start: number;
  end: number;
}

/**
 * Peint les lignes que couvre chaque remarque multi-lignes.
 *
 * Pourquoi en DOM, et pas par `selectedLines` : cette prop-là ne tient qu'UNE
 * plage par fichier et sert le geste en cours (la sélection à la souris), alors
 * qu'un fichier peut porter plusieurs remarques de plage à la fois. La lib
 * n'offre rien d'autre — ses « décorations » ne sont pas pilotables de
 * l'extérieur. On pose donc notre propre attribut, et son style vit avec lui
 * dans `lib/diff-theme`.
 *
 * La lecture des lignes suit exactement la règle de la lib : `data-line` porte
 * le numéro DU CÔTÉ de la ligne (celui que dirait un clic dessus), et
 * `data-alt-line` celui d'en face. En côte-à-côte, chaque colonne ne parle que
 * de son côté. En unifié, une ligne de CONTEXTE est la seule à représenter les
 * deux : c'est le seul endroit où l'on va lire l'autre numéro.
 */
function markCommentRanges(root: ShadowRoot, ranges: CommentRange[]) {
  for (const marked of root.querySelectorAll(`[${DIFF_RANGE_ATTRIBUTE}]`)) {
    marked.removeAttribute(DIFF_RANGE_ATTRIBUTE);
  }
  if (ranges.length === 0) return;

  for (const column of root.querySelectorAll("[data-code]")) {
    const unified = column.hasAttribute("data-unified");
    const columnSide: DiffSide = column.hasAttribute("data-deletions") ? "deletions" : "additions";
    for (const row of column.querySelectorAll("[data-line]")) {
      const type = row.getAttribute("data-line-type");
      const changed = type === "change-addition" || type === "change-deletion";
      const rowSide: DiffSide = changed
        ? type === "change-deletion"
          ? "deletions"
          : "additions"
        : columnSide;

      const covered = ranges.some((range) => {
        const raw =
          rowSide === range.side
            ? row.getAttribute("data-line")
            : unified && !changed
              ? row.getAttribute("data-alt-line")
              : null;
        if (raw == null) return false;
        const line = Number(raw);
        return line >= range.start && line <= range.end;
      });
      if (!covered) continue;

      row.setAttribute(DIFF_RANGE_ATTRIBUTE, "");
      // Le numéro de ligne partage l'index de sa ligne, et lui seul porte le
      // trait vertical qui donne à la plage ses deux bouts.
      const index = row.getAttribute("data-line-index");
      if (index) {
        column
          .querySelector(`[data-column-number][data-line-index="${index}"]`)
          ?.setAttribute(DIFF_RANGE_ATTRIBUTE, "");
      }
    }
  }
}

/**
 * Met en français (ou en anglais) les barres de dépliage, dont la lib écrit les
 * libellés en dur (« 12 unmodified lines », « Expand all ») et dont les flèches
 * n'ont aucun intitulé.
 *
 * Fait en DOM plutôt qu'en props parce que la lib n'offre pas de crochet : tout
 * ça est rendu dans l'ombre, et la seule voie déclarative
 * (`hunkSeparators: "custom"`) est déjà marquée `@deprecated`. La passe est
 * idempotente et sans regret : elle ne réécrit que ce qu'elle reconnaît, donc le
 * jour où la lib changera sa formulation, on retombera sur l'anglais plutôt que
 * sur un contresens.
 */
function localizeDiffChrome(
  root: ShadowRoot,
  t: ReturnType<typeof useTranslations<"PullRequests">>,
) {
  for (const node of root.querySelectorAll("[data-unmodified-lines]")) {
    const count = /^\s*(\d+)\b/.exec(node.textContent ?? "")?.[1];
    const label = count ? t("expandGap", { count: Number(count) }) : t("expandRest");
    if (node.textContent !== label) node.textContent = label;
  }
  for (const node of root.querySelectorAll("[data-expand-all-button]")) {
    if (node.textContent !== t("expandAll")) node.textContent = t("expandAll");
  }
  for (const node of root.querySelectorAll("[data-expand-button]")) {
    if (node.hasAttribute("data-expand-up")) setLabel(node, t("expandUp"));
    else if (node.hasAttribute("data-expand-down")) setLabel(node, t("expandDown"));
    else if (node.hasAttribute("data-expand-both")) setLabel(node, t("expandBoth"));
  }
}

/**
 * Retire le saut de ligne final. Un fichier qui en porte un (le cas normal)
 * donnerait sinon une dernière ligne fantôme au dépliage de fin.
 */
function trimTrailingNewline(content: string): string {
  return content.endsWith("\n") ? content.slice(0, -1) : content;
}

/**
 * Un fichier de la PR : en-tête repliable + diff. Composant à part car tout
 * l'état (composers ouverts, brouillons, ancres effectivement rendues) est PAR
 * fichier — impossible à tenir dans le `files.map` du parent.
 */
function PrDiffFile({
  file,
  fileDiff,
  viewType,
  wrap,
  themeType,
  locale,
  endpoint,
  prUrl,
  provider,
  readOnly,
  canResolve,
  collapsed,
  onToggle,
  registerCard,
  reviewComments,
  reviewThreads,
  reviewReactions,
  onCommentPosted,
}: {
  file: PullRequestFile;
  /** Diff analysé du fichier, absent quand il n'y a pas de patch (binaire, image…). */
  fileDiff?: FileDiffMetadata;
  viewType: ViewType;
  /** Replier les lignes trop longues plutôt que défiler horizontalement. */
  wrap: boolean;
  /** Thème résolu de minddy — il force la branche des `light-dark()` de la lib. */
  themeType: "light" | "dark";
  /** Locale active — le poids des images se formate avec (Ko/Mo, séparateurs). */
  locale: string;
  endpoint: PrEndpoint;
  prUrl?: string | null;
  provider?: RepoProviderId;
  /** Lecture seule : ni « + » de gouttière, ni « Répondre ». */
  readOnly?: boolean;
  /** Résoudre un fil, séparément : c'est une écriture sur le dépôt (MIN-144). */
  canResolve?: boolean;
  collapsed: boolean;
  onToggle: () => void;
  /** Confie la carte au parent, qui est celui qui sait défiler jusqu'à elle. */
  registerCard: (path: string, node: HTMLElement | null) => void;
  /** Commentaires de review de CE fichier (déjà filtrés par le parent). */
  reviewComments: PullRequestReviewComment[];
  /** État des fils de la PR, TOUS fichiers confondus : l'appariement se fait par
      id de racine, pas par chemin — inutile de le filtrer en amont. */
  reviewThreads: ReviewThreadState[];
  /** Réactions de la PR, tous fichiers confondus : appariées par id de
      commentaire, comme les fils le sont par id de racine. */
  reviewReactions: ReviewCommentReaction[];
  onCommentPosted: () => unknown;
}) {
  const t = useTranslations("PullRequests");

  const setCardRef = useCallback(
    (node: HTMLDivElement | null) => registerCard(file.filename, node),
    [registerCard, file.filename],
  );

  // Brouillons indexés par clé d'ancre : un envoi qui échoue GARDE son texte, et
  // ouvrir un second composer ne détruit pas le premier. Ils ne sont vidés qu'au
  // succès ou à l'annulation explicite.
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [openAnchors, setOpenAnchors] = useState<Record<string, CommentAnchor>>({});
  const [postingKey, setPostingKey] = useState<string | null>(null);

  /**
   * Ancres dont la lib a effectivement rendu la ligne. Relevé APRÈS chaque rendu
   * (`onPostRender`), et pas déduit des hunks : c'est la seule mesure qui suit
   * le dépliage, dont l'état vit dans la lib. Un fil qui n'y figure pas se replie
   * dans les « périmés », et remonte à sa place dès que le contexte autour est
   * déplié — la propriété qu'on garantissait avant à la main.
   */
  const [placedKeys, setPlacedKeys] = useState<ReadonlySet<string>>(EMPTY_KEYS);
  const instanceRef = useRef<FileDiffInstance<AnnotationMeta> | null>(null);

  const replies = useReviewReplies(endpoint, onCommentPosted);
  const resolution = useThreadResolution(endpoint, onCommentPosted);
  const reactions = useCommentReactions(endpoint, onCommentPosted, reviewReactions, !readOnly);

  const threads = useMemo(
    () => groupReviewThreads(reviewComments, reviewThreads),
    [reviewComments, reviewThreads],
  );

  /**
   * Une annotation par ligne visée : les fils de cette ligne, plus une entrée
   * vide pour un composer ouvert là où il n'y a encore aucun fil. La lib place
   * chacune sous sa ligne, ou pas du tout si la ligne n'est pas rendue.
   */
  const lineAnnotations = useMemo(() => {
    const byKey = new Map<string, ThreadAnnotation>();
    const ensure = (side: ThreadAnnotation["side"], line: number): ThreadAnnotation => {
      const key = anchorKey({ side, line });
      const existing = byKey.get(key);
      if (existing) return existing;
      const created: ThreadAnnotation = {
        side,
        lineNumber: line,
        metadata: { key, line, threads: [] },
      };
      byKey.set(key, created);
      return created;
    };
    for (const thread of threads) {
      const anchor = threadAnchor(thread);
      if (!anchor) continue;
      ensure(anchor.side, anchor.line).metadata.threads.push(thread);
    }
    for (const anchor of Object.values(openAnchors)) ensure(anchor.side, anchor.line);
    return [...byKey.values()];
  }, [threads, openAnchors]);

  /**
   * Les plages à peindre : une par remarque multi-lignes. Sans elles, un
   * commentaire posé sur dix lignes se lit comme un commentaire sur la dernière
   * — l'intitulé le dit, mais il faut le lire pour s'en apercevoir.
   */
  const commentRanges = useMemo(() => {
    const ranges: CommentRange[] = [];
    for (const thread of threads) {
      const anchor = threadAnchor(thread);
      const start = thread.root.start_line;
      // `line` est la DERNIÈRE ligne de la plage : une « plage » qui ne
      // remonterait pas au-dessus n'en est pas une.
      if (!anchor || start == null || start >= anchor.line) continue;
      ranges.push({ side: anchor.side, start, end: anchor.line });
    }
    return ranges;
  }, [threads]);

  /** Fils qui ne s'ancrent nulle part dans le diff rendu — repliés en bas. */
  const staleThreads = useMemo(() => {
    return threads.filter((thread) => {
      const anchor = threadAnchor(thread);
      return !anchor || !placedKeys.has(anchorKey(anchor));
    });
  }, [threads, placedKeys]);

  const closeComposer = useCallback((key: string) => {
    setOpenAnchors(({ [key]: _closed, ...rest }) => rest);
    setDrafts(({ [key]: _cleared, ...rest }) => rest);
    // La plage reste surlignée tant que le composer est ouvert ; elle s'éteint
    // avec lui, comme sur GitHub.
    instanceRef.current?.setSelectedLines(null);
  }, []);

  const submitComment = useCallback(
    async (key: string) => {
      const anchor = openAnchors[key];
      const body = (drafts[key] ?? "").trim();
      if (!anchor || !body || postingKey) return;
      setPostingKey(key);
      try {
        await postPrReviewCommentApi(endpoint, {
          body,
          // Un commentaire de review s'adresse au chemin ACTUEL du fichier, même
          // renommé (contrairement au dépliage, qui lit la version de base).
          path: file.filename,
          line: anchor.line,
          side: toGithubSide(anchor.side),
          ...(anchor.startLine != null
            ? {
                startLine: anchor.startLine,
                startSide: toGithubSide(anchor.startSide ?? anchor.side),
              }
            : {}),
        });
        // Fermé (et brouillon vidé) au SUCCÈS seulement : sur échec le composer
        // reste ouvert avec le texte.
        closeComposer(key);
        await onCommentPosted();
      } catch (err) {
        const apiErr = err as ApiError;
        toast.error(apiErr.code === "lineNotInDiff" ? t("lineNotInDiffError") : apiErr.message);
      } finally {
        setPostingKey(null);
      }
    },
    [openAnchors, drafts, postingKey, endpoint, file.filename, closeComposer, onCommentPosted, t],
  );

  /**
   * Charge les deux versions du fichier pour que la lib puisse déplier le
   * contexte masqué. Appelée au PREMIER dépliage de ce fichier : ouvrir une PR
   * de trente fichiers sans rien déplier ne déclenche aucun appel.
   *
   * Le serveur ne sert que la version BASE — c'est tout ce dont le dépliage a
   * besoin côté gauche, et la version tête s'en déduit exactement en lui
   * appliquant le patch. Une seconde route (et un second aller-retour) pour un
   * texte qu'on peut reconstruire ne se justifiait pas.
   */
  const loadDiffFiles = useCallback<FileDiffContentsLoader>(
    async (meta) => {
      try {
        const { content } = await fetchPrFileSourceApi(endpoint, basePathOf(file));
        const oldContents = trimTrailingNewline(content);
        const patched = applyPatch(oldContents, toUnifiedDiff(file));
        if (patched === false) {
          // La base a bougé sous nous (tête repoussée entre l'ouverture de la vue
          // et le clic) : sans les deux versions, la lib ne peut rien déplier.
          throw new Error("Patch does not apply to the base revision");
        }
        return {
          oldFile: { name: basePathOf(file), contents: oldContents },
          newFile: { name: meta.name, contents: trimTrailingNewline(patched) },
        };
      } catch (err) {
        // La lib avale l'échec (elle le journalise et laisse le diff en place) :
        // sans ce mot, un clic sur la barre de dépliage ne ferait simplement
        // rien, et rien ne dirait pourquoi. La barre reste recliquable.
        toast.error(t("expandFailed"));
        throw err;
      }
    },
    [endpoint, file, t],
  );

  /**
   * Un fichier ajouté n'a pas de version de base, un fichier supprimé pas de
   * version de tête — et dans les deux cas le patch EST déjà le fichier entier :
   * il n'y a rien à déplier. Sans chargeur, la lib n'offre pas l'affordance,
   * plutôt que de proposer un dépliage qui finirait en 404.
   */
  const expandable = file.status !== "added" && file.status !== "removed";

  /**
   * Ouvre le composer sur la sélection de gouttière. `range` porte la plage
   * complète du glissement : c'est elle qui offre le commentaire multi-lignes,
   * que le serveur savait déjà envoyer.
   */
  const onGutterUtilityClick = useCallback(
    (range: SelectedLineRange) => {
      const hunks = fileDiff?.hunks ?? [];
      const anchor = commentAnchor(hunks, range, {
        // GitLab ancre une note sur UNE ligne (`old_line`/`new_line`) : lui
        // envoyer une plage la réduirait en silence à son dernier point.
        multiLine: provider !== "gitlab",
      });
      if (!anchor) {
        instanceRef.current?.setSelectedLines(null);
        return;
      }
      const key = anchorKey(anchor);
      setOpenAnchors((prev) => (prev[key] ? prev : { ...prev, [key]: anchor }));
    },
    [fileDiff, provider],
  );

  /**
   * Nomme le « + » de la gouttière au survol de la ligne.
   *
   * Pas dans la passe de traduction ci-dessus : ce bouton-là n'existe pas encore
   * au moment des rendus. La lib le fabrique DÉTACHÉ et ne l'accroche à une
   * ligne qu'au survol — c'est-à-dire juste avant cet appel. Sans intitulé, il
   * n'a qu'une icône, donc aucun nom accessible.
   */
  const onLineEnter = useCallback(
    ({ numberElement }: DiffLineEventBaseProps) => {
      const button = numberElement.querySelector("[data-utility-button]");
      if (button) setLabel(button, t("addLineComment"));
    },
    [t],
  );

  const renderAnnotation = useCallback(
    (annotation: ThreadAnnotation): ReactNode => {
      const { key, line, threads: list } = annotation.metadata;
      // Pas encore placée : ces fils-là sont rendus dans le repli des périmés, et
      // les monter ici en plus les dédoublerait (deux cartes, deux états de
      // dépli, pour un même fil). Le premier rendu passe forcément par là — le
      // relevé n'a pas encore eu lieu — puis `onPostRender` remet tout en place,
      // avant peinture.
      if (!placedKeys.has(key)) return null;
      const anchor = openAnchors[key];
      return (
        <LineWidget
          anchor={{
            line,
            // La plage d'une remarque multi-lignes : celle qu'on est en train
            // d'écrire, sinon celle des fils déjà là. Les fils ne la donnent que
            // s'ils s'accordent tous dessus — deux plages différentes sous le
            // même numéro ne se résument pas en un seul intitulé, et on retombe
            // alors sur la ligne d'ancrage, qui elle est toujours vraie.
            startLine: anchor ? anchor.startLine : (sharedStartLine(list) ?? undefined),
            kind: lineKind(fileDiff?.hunks ?? [], annotation.side, line) ?? "context",
          }}
        >
          {list.map((thread) => (
            <ReviewThreadCard
              key={thread.id}
              thread={thread}
              replies={replies}
              resolution={canResolve ? resolution : undefined}
              reactions={reactions}
              readOnly={readOnly}
            />
          ))}
          {anchor ? (
            <LineComposer
              value={drafts[key] ?? ""}
              onChange={(transform) =>
                setDrafts((prev) => ({
                  ...prev,
                  [key]: transform(prev[key] ?? ""),
                }))
              }
              onSubmit={() => void submitComment(key)}
              onCancel={() => closeComposer(key)}
              submitting={postingKey === key}
            />
          ) : null}
        </LineWidget>
      );
    },
    [
      fileDiff,
      placedKeys,
      openAnchors,
      drafts,
      postingKey,
      replies,
      resolution,
      reactions,
      readOnly,
      canResolve,
      submitComment,
      closeComposer,
    ],
  );

  /**
   * Après chaque rendu de la lib (montage, changement d'option, dépliage) :
   * garder la main sur l'instance, traduire les barres de dépliage, et relever
   * quelles annotations ont trouvé leur ligne. Le relevé se lit dans l'ombre —
   * un `<slot>` par annotation placée, nommé comme la lib le nomme — parce que
   * c'est la seule chose qui dise la vérité sur l'état de dépliage.
   */
  const onPostRender = useCallback(
    (node: HTMLElement, instance: FileDiffInstance<AnnotationMeta>, phase: PostRenderPhase) => {
      if (phase === "unmount") {
        instanceRef.current = null;
        // Rendre l'ombre au propre — sinon le montage SUIVANT sur le même
        // élément croit avoir affaire à du HTML prérendu.
        //
        // Le démontage de la lib vide le `<pre>` mais le LAISSE dans le Shadow
        // DOM. Son `hydrate` lit ça comme « le diff est déjà peint, je n'ai
        // qu'à me rebrancher dessus » : il saute le rendu, et on reste sur le
        // squelette vide. En production ça ne se voit pas — React jette
        // l'élément avec le composant. En développement, `reactStrictMode`
        // monte, démonte et remonte SUR LE MÊME NOEUD : le diff naissait vide,
        // et il fallait replier puis déplier le fichier (donc deux clics) pour
        // obtenir un élément neuf qui, lui, se peignait.
        //
        // Les feuilles de style adoptées vivent sur le `shadowRoot`, pas parmi
        // ses enfants : elles survivent, et le prochain rendu reconstruit le
        // reste (sprite, thème, code).
        node.shadowRoot?.replaceChildren();
        return;
      }
      instanceRef.current = instance;
      const root = node.shadowRoot;
      if (!root) return;
      localizeDiffChrome(root, t);
      markCommentRanges(root, commentRanges);
      const placed = new Set<string>();
      for (const annotation of lineAnnotations) {
        const slot = getLineAnnotationName(annotation);
        if (root.querySelector(`slot[name="${slot}"]`)) placed.add(annotation.metadata.key);
      }
      setPlacedKeys((prev) => (sameKeys(prev, placed) ? prev : placed));
    },
    [lineAnnotations, commentRanges, t],
  );

  const options = useMemo(
    () => ({
      theme: DIFF_THEMES,
      themeType,
      diffStyle: viewType,
      // Le régime décidé plus haut, en côte-à-côte comme en unifié : la lib
      // synchronise le défilement de ses deux volets.
      overflow: wrap ? ("wrap" as const) : ("scroll" as const),
      disableFileHeader: true,
      // La carte porte déjà le nom du fichier et ses compteurs : le séparateur
      // n'a qu'à dire ce qu'il masque, et à offrir de le déplier.
      hunkSeparators: "line-info" as const,
      expansionLineCount: EXPANSION_LINE_COUNT,
      // Doublon assumé avec le pool de workers, qui l'emporte quand il colore :
      // c'est le repli du fil principal, et il doit rendre la même chose.
      lineDiffType: DIFF_LINE_DIFF_TYPE,
      unsafeCSS: DIFF_UNSAFE_CSS,
      loadDiffFiles: expandable ? loadDiffFiles : undefined,
      enableGutterUtility: !readOnly,
      onGutterUtilityClick: readOnly ? undefined : onGutterUtilityClick,
      onLineEnter: readOnly ? undefined : onLineEnter,
      onPostRender,
    }),
    [
      themeType,
      viewType,
      wrap,
      expandable,
      loadDiffFiles,
      readOnly,
      onGutterUtilityClick,
      onLineEnter,
      onPostRender,
    ],
  );

  // Le dossier s'efface, le nom du fichier porte : dans une liste de trente
  // chemins qui partagent leurs six premiers segments, c'est le dernier qu'on
  // cherche des yeux.
  const slash = file.filename.lastIndexOf("/");
  const dir = slash === -1 ? "" : file.filename.slice(0, slash + 1);
  const name = slash === -1 ? file.filename : file.filename.slice(slash + 1);

  // Un fichier sans patch : image qu'on sait montrer, binaire qu'on ne sait pas,
  // fichier sans changement de contenu (renommage pur), ou fichier texte que la
  // forge a jugé trop volumineux — quatre situations que le message unique
  // d'avant confondait.
  const missing = fileDiff ? null : noPatchKind(file);

  return (
    // `overflow-clip` et non `overflow-hidden` : les deux découpent les coins
    // arrondis, mais `hidden` fait de la carte un CONTENEUR DE DÉFILEMENT, ce
    // qui neutralise le `sticky` de l'en-tête (il collerait au bord de la carte,
    // c'est-à-dire nulle part). `clip` ne défile pas, donc l'en-tête colle au
    // vrai conteneur, celui de l'hôte.
    <div
      ref={setCardRef}
      id={fileAnchorId(file.filename)}
      className="overflow-clip rounded-md border border-border"
    >
      <button
        type="button"
        onClick={onToggle}
        className={cn(
          // Collé au bord haut, partout : `top-0` et rien d'autre. Les trois
          // hôtes ont un conteneur qui commence sous un en-tête (le bandeau de
          // la PR, celui des deux feuilles), donc l'en-tête de fichier vient s'y
          // poser contre — et un décalage, si petit soit-il, se lirait comme un
          // élément qui flotte.
          //
          // Collant DANS SA CARTE : le `sticky` est borné par son bloc
          // conteneur, donc l'en-tête du fichier suivant chasse le précédent en
          // arrivant. C'est le comportement voulu, et il est gratuit — surtout
          // ne pas fabriquer un en-tête flottant unique par-dessus la liste.
          "sticky top-0 z-10 flex w-full items-center gap-2 bg-card px-3 py-2.5 text-left outline-none transition-colors hover:bg-muted/60",
          // Le diff a le MÊME fond que la carte (`--diffs-light-bg: var(--card)`) :
          // sans ce trait, l'en-tête collé flotterait au milieu du code sans
          // qu'on voie où il commence.
          collapsed ? null : "border-b border-border",
        )}
      >
        {collapsed ? (
          <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
        )}
        <span className="min-w-0 flex-1 truncate font-mono text-xs" title={file.filename}>
          {file.previous_filename ? (
            <span className="text-muted-foreground">{file.previous_filename} → </span>
          ) : null}
          <span className="text-muted-foreground">{dir}</span>
          <span className="font-medium">{name}</span>
        </span>
        <FileStatusBadge status={fileStatusOf(file)} />
        <span className="shrink-0 text-[11px] tabular-nums text-emerald-600 dark:text-emerald-400">
          +{file.additions}
        </span>
        <span className="shrink-0 text-[11px] tabular-nums text-red-600 dark:text-red-400">
          −{file.deletions}
        </span>
        <DiffStatBar additions={file.additions} deletions={file.deletions} />
      </button>
      {collapsed ? null : (
        <>
          {fileDiff ? (
            <FileDiff<AnnotationMeta>
              fileDiff={fileDiff}
              options={options}
              lineAnnotations={lineAnnotations}
              renderAnnotation={renderAnnotation}
            />
          ) : missing === "image" ? (
            <PrImageDiff file={file} endpoint={endpoint} locale={locale} />
          ) : (
            <div className="px-3 py-2 text-[11px] text-muted-foreground">
              {missing === "binary"
                ? t("binaryFile")
                : missing === "unchanged"
                  ? t("noContentChange")
                  : t("tooLargeFile")}{" "}
              {/* Rien à aller voir ailleurs quand il n'y a rien à voir. */}
              {prUrl && missing !== "unchanged" ? (
                <a
                  href={prUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-brand hover:underline"
                >
                  {t(provider === "gitlab" ? "viewOnGitlab" : "viewOnGithub")}
                </a>
              ) : null}
            </div>
          )}
          {/* Hors du `fileDiff ?` : un fichier binaire ou trop gros n'a pas de
              diff, donc AUCUN de ses fils ne s'ancre — ils vivent tous ici
              plutôt que de disparaître avec le diff qu'on ne sait pas rendre. */}
          <StaleThreads
            threads={staleThreads}
            replies={replies}
            resolution={canResolve ? resolution : undefined}
            reactions={reactions}
            readOnly={readOnly}
          />
        </>
      )}
    </div>
  );
}

/** Références stables : `?? []` / `?? () => {}` en ligne casseraient les mémos. */
const NO_COMMENTS: PullRequestReviewComment[] = [];
const NO_THREADS: ReviewThreadState[] = [];
const NO_REACTIONS: ReviewCommentReaction[] = [];
const EMPTY_KEYS: ReadonlySet<string> = new Set<string>();
const noop = () => {};

function sameKeys(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  if (a.size !== b.size) return false;
  for (const key of a) if (!b.has(key)) return false;
  return true;
}

export function PrDiff({
  files,
  endpoint,
  prUrl,
  provider,
  readOnly = false,
  canResolve = !readOnly,
  reviewComments = NO_COMMENTS,
  reviewThreads = NO_THREADS,
  reviewReactions = NO_REACTIONS,
  onCommentPosted = noop,
  className,
}: {
  files: PullRequestFile[];
  /** Run porteur du diff — sert à charger la version base d'un fichier au dépliage. */
  endpoint: PrEndpoint;
  prUrl?: string | null;
  /** Provider du dépôt (vocabulaire des liens « Voir sur … ») — défaut GitHub. */
  provider?: RepoProviderId;
  /** Lecture seule : pas de commentaires de review (vue diff sans PR — la
      conversation de l'agent ; la review vit sur la page Pull requests). */
  readOnly?: boolean;
  /** Résoudre un fil, gouverné À PART (MIN-144) : commenter demande `read` sur
      le dépôt, résoudre demande `write`. Défaut `!readOnly` — les appelants qui
      ne connaissent pas la distinction (agent-diff-sheet) ne changent pas. */
  canResolve?: boolean;
  /** Commentaires de review de la PR, tous fichiers confondus. */
  reviewComments?: PullRequestReviewComment[];
  /** État de résolution des fils (MIN-139). Vide = état INCONNU : les fils se
      lisent et se répondent, mais aucun ne s'annonce résolu ni ne se résout. */
  reviewThreads?: ReviewThreadState[];
  /** Réactions emoji des commentaires (MIN-139). Vide = aucune à afficher. */
  reviewReactions?: ReviewCommentReaction[];
  /** Rafraîchit les commentaires après un envoi réussi. */
  onCommentPosted?: () => unknown;
  className?: string;
}) {
  const t = useTranslations("PullRequests");
  const locale = useLocale();
  const { resolvedTheme } = useTheme();
  const isMobile = useIsMobile();
  const [viewType, setViewType] = useState<ViewType>("unified");
  /**
   * Repli des lignes longues : `null` tant que personne n'a tranché, et c'est
   * alors la LARGEUR qui décide.
   *
   * Au large, défilement, comme les forges : replier une ligne longue casse
   * l'alignement des numéros et déforme le code indenté. Sur un téléphone, ce
   * raisonnement s'inverse — la boîte fait quelques dizaines de caractères, donc
   * défiler horizontalement ne montre plus jamais une ligne entière, et il faut
   * balayer ligne par ligne pour lire un hunk. Mieux vaut du code replié que du
   * code hors champ.
   *
   * Un DÉFAUT, pas une contrainte : dès qu'on touche la bascule, le choix tient,
   * et il survit à une rotation d'écran.
   */
  const [wrapChoice, setWrapChoice] = useState<boolean | null>(null);
  const wrap = wrapChoice ?? isMobile;
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  /** Les cartes montées, par chemin — ce que l'arbre vise quand on clique une ligne. */
  const cards = useRef(new Map<string, HTMLElement>());
  const registerCard = useCallback((path: string, node: HTMLElement | null) => {
    if (node) cards.current.set(path, node);
    else cards.current.delete(path);
  }, []);

  /**
   * Emmène au fichier : on le déplie s'il était replié, PUIS on défile. L'ordre
   * n'est pas cosmétique — défiler vers une carte encore repliée viserait une
   * boîte de 40 px, et le dépliage qui suit ferait pousser le diff ailleurs.
   *
   * `flushSync` plutôt qu'un `requestAnimationFrame` : il garantit que le
   * dépliage est DANS LE DOM avant qu'on mesure, là où l'image suivante n'est
   * qu'un pari sur l'ordonnancement de React.
   */
  const jumpToFile = useCallback((path: string) => {
    flushSync(() => {
      setCollapsed((prev) => {
        if (!prev.has(path)) return prev;
        const next = new Set(prev);
        next.delete(path);
        return next;
      });
    });
    const card = cards.current.get(path);
    card?.scrollIntoView({ block: "start" });
    // Le focus SUIT le saut, sur l'en-tête du fichier visé (le premier bouton de
    // la carte). Sans ça il resterait sur le compteur, en haut de la vue, alors
    // que l'oeil est vingt fichiers plus bas — et Radix, en le rendant au
    // déclencheur à la fermeture du panneau, y ramènerait le défilement avec.
    // `preventScroll` : le cadrage vient d'être fait, le focus n'a pas à le refaire.
    card?.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true });
  }, []);

  const commentsByPath = useMemo(() => {
    const map = new Map<string, PullRequestReviewComment[]>();
    for (const c of reviewComments) {
      const list = map.get(c.path);
      if (list) list.push(c);
      else map.set(c.path, [c]);
    }
    return map;
  }, [reviewComments]);

  // Commentaires dont le fichier n'est pas dans la PR (dépassement des 100
  // fichiers de l'API, fichier retiré depuis) : sans ce repli ils disparaîtraient
  // sans laisser de trace.
  const orphanThreads = useMemo(() => {
    const known = new Set(files.map((f) => f.filename));
    return groupReviewThreads(
      reviewComments.filter((c) => !known.has(c.path)),
      reviewThreads,
    );
  }, [reviewComments, reviewThreads, files]);

  /**
   * Le diff unifié complet de la PR, en une chaîne. Mémoïsé À PART, et c'est
   * lui — pas le tableau `files` — qui commande l'analyse : un rafraîchissement
   * qui rend exactement les mêmes patchs rend la même chaîne, donc les mêmes
   * objets de diff. Or la lib HYDRATE ces objets-là (le contexte déplié y est
   * fusionné) : les recréer à chaque `refetch` effacerait sous les doigts ce que
   * l'utilisateur vient de déplier.
   */
  const diffText = useMemo(() => files.map(toUnifiedDiff).filter(Boolean).join("\n"), [files]);

  /**
   * Analyse une fois, puis indexe par chemin. La lib nomme chaque fichier
   * d'après le côté `b/` du `diff --git` qu'on écrit — donc `file.filename`,
   * pour un fichier ajouté, supprimé ou renommé comme pour les autres.
   *
   * Pas de préfixe de cache : il indexerait la coloration sur une clé stable
   * alors que le contenu d'une PR change sous nous (un commit poussé, une
   * review relancée).
   */
  const parsedByPath = useMemo(() => {
    const map = new Map<string, FileDiffMetadata>();
    if (!diffText) return map;
    for (const patch of parsePatchFiles(diffText)) {
      for (const parsed of patch.files) map.set(parsed.name, parsed);
    }
    return map;
  }, [diffText]);

  const orphanReplies = useReviewReplies(endpoint, onCommentPosted);
  const orphanResolution = useThreadResolution(endpoint, onCommentPosted);
  const orphanReactions = useCommentReactions(
    endpoint,
    onCommentPosted,
    reviewReactions,
    !readOnly,
  );

  if (files.length === 0) {
    // `className` porte l'espacement que l'hôte attend autour du diff : le
    // perdre ici collerait le message au bord.
    return <p className={cn("text-sm text-muted-foreground", className)}>{t("noDiff")}</p>;
  }

  const totalAdd = files.reduce((s, f) => s + f.additions, 0);
  const totalDel = files.reduce((s, f) => s + f.deletions, 0);

  const toggle = (path: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });

  return (
    <PrDiffWorkers>
      <div className={cn("pr-diff-view flex flex-col gap-2", className)}>
        <div className="flex items-center justify-between gap-3">
          {/* Le compteur EST le déclencheur de l'arbre : il occupait déjà cette
              place et dit déjà de quoi l'arbre parle. Un bouton de plus dans la
              barre serait un chrome que personne n'a demandé. */}
          <PrFileTreeButton
            files={files}
            totalAdditions={totalAdd}
            totalDeletions={totalDel}
            onSelect={jumpToFile}
          />
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => setWrapChoice(!wrap)}
              aria-pressed={wrap}
              aria-label={t("wrapLines")}
              title={t("wrapLines")}
              className={cn(
                "flex size-7 items-center justify-center rounded-md border transition-colors",
                wrap
                  ? "border-brand/40 bg-brand/10 text-brand"
                  : "border-border text-muted-foreground hover:bg-muted",
              )}
            >
              <WrapText className="size-3.5" />
            </button>
            <SegmentedControl
              className="w-40"
              value={viewType}
              onChange={setViewType}
              options={[
                { value: "unified", label: t("unified") },
                { value: "split", label: t("split") },
              ]}
            />
          </div>
        </div>

        <div className="flex flex-col gap-3">
          {files.map((f) => (
            <PrDiffFile
              key={f.filename}
              file={f}
              fileDiff={f.patch ? parsedByPath.get(f.filename) : undefined}
              viewType={viewType}
              wrap={wrap}
              themeType={resolvedTheme}
              locale={locale}
              endpoint={endpoint}
              prUrl={prUrl}
              provider={provider}
              readOnly={readOnly}
              canResolve={canResolve}
              collapsed={collapsed.has(f.filename)}
              onToggle={() => toggle(f.filename)}
              registerCard={registerCard}
              reviewComments={commentsByPath.get(f.filename) ?? NO_COMMENTS}
              reviewThreads={reviewThreads}
              reviewReactions={reviewReactions}
              onCommentPosted={onCommentPosted}
            />
          ))}
          {orphanThreads.length > 0 ? (
            <div className="overflow-hidden rounded-md border border-border">
              <StaleThreads
                threads={orphanThreads}
                replies={orphanReplies}
                resolution={canResolve ? orphanResolution : undefined}
                reactions={orphanReactions}
                readOnly={readOnly}
                label={(count) => t("orphanComments", { count })}
              />
            </div>
          ) : null}
        </div>
      </div>
    </PrDiffWorkers>
  );
}
