"use client";

import "react-diff-view/style/index.css";

import { useCallback, useMemo, useState, type ReactElement, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { cn, SegmentedControl, Spinner, toast } from "mangue-ui";
import { ChevronDown, ChevronRight, ChevronUp, UnfoldVertical } from "lucide-react";
import {
  parseDiff,
  Diff,
  Hunk,
  Decoration,
  expandFromRawCode,
  getChangeKey,
  getCollapsedLinesCountBetween,
  type ChangeData,
  type DiffType,
  type FileData,
  type GutterOptions,
  type HunkData,
} from "react-diff-view";
import {
  fetchPrFileSourceApi,
  postPrReviewCommentApi,
  type ApiError,
  type PrEndpoint,
  type PullRequestFile,
  type PullRequestReviewComment,
} from "@/lib/agent-api";
import { groupReviewThreads, type ReviewThreadState } from "@/lib/pr-review-threads";
import type { RepoProviderId } from "@/lib/repo-providers";
import {
  commentableChangeKeys,
  gutterAnchor,
  resolveThreadChangeKey,
  type PrReviewThread,
} from "@/lib/pr-review-diff";
import {
  GutterCommentButton,
  LineComposer,
  LineWidget,
  ReviewThreadCard,
  StaleThreads,
  useReviewReplies,
  useThreadResolution,
} from "@/components/pull-requests/pr-review-comments";

/**
 * Vue diff moderne d'une PR (MIN-66) : liste de fichiers repliables avec compteurs
 * +/−, bascule unifié ↔ côte-à-côte (`viewType` de react-diff-view), et dépliage
 * du contexte masqué entre les hunks façon GitHub. Consommée par le panneau de
 * détail d'une PR (pr-detail).
 *
 * GitHub renvoie un `patch` par fichier (fragment de hunks) : on reconstruit un
 * diff unifié complet autour, puis `parseDiff`. Les fichiers binaires/trop gros
 * arrivent sans `patch` → repli « voir sur GitHub ».
 */

/** Nombre de lignes qu'une flèche déplie d'un coup (comme GitHub). */
const EXPAND_STEP = 20;

/**
 * Plage de lignes à déplier, en numéros de ligne ANCIENS (ceux de la version
 * base). `end` est EXCLU : c'est la sémantique de `expandFromRawCode`, qui
 * `slice`-e la source.
 */
type Range = [start: number, end: number];

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
 * Découpe la source en lignes. Un fichier terminé par un saut de ligne donne une
 * dernière entrée vide avec `split` : on la retire, sinon le dépliage de fin
 * afficherait une ligne fantôme.
 */
function splitLines(content: string): string[] {
  const lines = content.split("\n");
  if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  return lines;
}

type ViewType = "unified" | "split";

/**
 * Ce que l'en-tête d'un widget annonce : la ligne visée et sa nature. Une ligne
 * de contexte porte deux numéros (ancien / nouveau) : on affiche le NOUVEAU,
 * cohérent avec l'ancre que produit `gutterAnchor` pour ce cas (side RIGHT).
 */
function anchorOf(change: ChangeData): { line: number; kind: "added" | "removed" | "context" } {
  if (change.type === "insert") return { line: change.lineNumber, kind: "added" };
  if (change.type === "delete") return { line: change.lineNumber, kind: "removed" };
  return { line: change.newLineNumber, kind: "context" };
}

/**
 * Barre entre deux zones de diff : annonce les lignes masquées et les déplie.
 * `Decoration` la rend au bon format en unifié comme en côte-à-côte. Un seul
 * enfant → la cellule occupe toute la largeur (gouttières comprises).
 */
function ExpandBar({
  count,
  loading,
  failed,
  onExpandAll,
  onExpandUp,
  onExpandDown,
}: {
  /** Lignes masquées, ou null quand la source n'est pas encore chargée. */
  count: number | null;
  loading: boolean;
  failed: boolean;
  /** Petit écart : un seul clic déplie tout. */
  onExpandAll?: () => void;
  /** Les lignes juste au-dessus du hunk qui suit. */
  onExpandUp?: () => void;
  /** Les lignes juste en dessous du hunk qui précède. */
  onExpandDown?: () => void;
}) {
  const t = useTranslations("PullRequests");
  const label = count === null ? t("expandRest") : t("expandGap", { count });

  const gutter = "flex w-[7ch] shrink-0 items-center justify-center gap-0.5 self-stretch";
  const arrow =
    "flex size-5 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-brand/15 hover:text-brand";
  const text = "text-[11px] text-muted-foreground";
  // Un échec de chargement ne casse pas le diff : la barre reste (recliquable),
  // l'erreur s'affiche discrètement à côté du décompte.
  const error = failed ? (
    <span className="text-[11px] text-muted-foreground/70">{t("expandFailed")}</span>
  ) : null;

  // Exactement UN enfant : `Decoration` étale alors la cellule sur toute la
  // largeur (gouttières comprises) — avec deux, il les lit comme [gouttière, contenu].
  return (
    <Decoration className="pr-diff-expand">
      {onExpandAll ? (
        <button
          type="button"
          onClick={onExpandAll}
          disabled={loading}
          className="flex w-full items-center gap-2 py-1 text-left transition-colors hover:bg-brand/10"
        >
          <span className={gutter}>
            {loading ? (
              <Spinner className="size-3.5 text-muted-foreground" />
            ) : (
              <UnfoldVertical className="size-3.5 text-muted-foreground" />
            )}
          </span>
          <span className={text}>{label}</span>
          {error}
        </button>
      ) : (
        <div className="flex w-full items-center gap-2 py-1">
          <span className={gutter}>
            {loading ? (
              <Spinner className="size-3.5 text-muted-foreground" />
            ) : (
              <>
                {onExpandUp ? (
                  <button
                    type="button"
                    onClick={onExpandUp}
                    aria-label={t("expandUp")}
                    className={arrow}
                  >
                    <ChevronUp className="size-3.5" />
                  </button>
                ) : null}
                {onExpandDown ? (
                  <button
                    type="button"
                    onClick={onExpandDown}
                    aria-label={t("expandDown")}
                    className={arrow}
                  >
                    <ChevronDown className="size-3.5" />
                  </button>
                ) : null}
              </>
            )}
          </span>
          <span className={text}>{label}</span>
          {error}
        </div>
      )}
    </Decoration>
  );
}

/**
 * Un fichier de la PR : en-tête repliable + diff. Composant à part car l'état de
 * dépliage (source base, plages dépliées) est PAR fichier — impossible à tenir
 * dans le `files.map` du parent.
 *
 * On garde nous-mêmes les plages dépliées plutôt que d'utiliser
 * `useSourceExpansion` : ce hook remet les expansions à zéro dès que `hunks` ou
 * `oldSource` change (son `useEffect(clear, …)`). Or la source arrive APRÈS le
 * premier clic, et un refetch de la PR (après un merge, un commentaire…) recrée
 * les hunks — les deux effaceraient ce que l'utilisateur vient de déplier.
 * L'algorithme d'expansion, lui, reste celui de la lib (`expandFromRawCode`).
 */
function PrDiffFile({
  file,
  parsed,
  viewType,
  endpoint,
  prUrl,
  provider,
  readOnly,
  collapsed,
  onToggle,
  reviewComments,
  reviewThreads,
  onCommentPosted,
}: {
  file: PullRequestFile;
  parsed?: FileData;
  viewType: ViewType;
  endpoint: PrEndpoint;
  prUrl?: string | null;
  provider?: RepoProviderId;
  /** Lecture seule : pas de bouton « + » de commentaire dans la gouttière. */
  readOnly?: boolean;
  collapsed: boolean;
  onToggle: () => void;
  /** Commentaires de review de CE fichier (déjà filtrés par le parent). */
  reviewComments: PullRequestReviewComment[];
  /** État des fils de la PR, TOUS fichiers confondus : l'appariement se fait par
      id de racine, pas par chemin — inutile de le filtrer en amont. */
  reviewThreads: ReviewThreadState[];
  onCommentPosted: () => unknown;
}) {
  const t = useTranslations("PullRequests");
  const [ranges, setRanges] = useState<Range[]>([]);
  const [source, setSource] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  // Brouillons indexés par clé de changement (ou par fil, pour les réponses) : un
  // envoi qui échoue GARDE son texte, et ouvrir un second composer ne détruit pas
  // le premier. Ils ne sont vidés qu'au succès ou à l'annulation explicite.
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [openAnchors, setOpenAnchors] = useState<
    Record<string, { line: number; side: "LEFT" | "RIGHT" }>
  >({});
  const [postingKey, setPostingKey] = useState<string | null>(null);
  const replies = useReviewReplies(endpoint, onCommentPosted);
  const resolution = useThreadResolution(endpoint, onCommentPosted);

  // Un fichier ajouté n'a pas de version de base : son patch EST déjà le fichier
  // entier, il n'y a rien à déplier.
  const canExpand = !!parsed && file.status !== "added";

  /**
   * Déplie une plage. La version base n'est chargée qu'ici, au premier clic sur
   * une barre de CE fichier : ouvrir une PR de 30 fichiers sans rien déplier ne
   * déclenche aucun appel. Ensuite elle est en cache dans `source`.
   */
  const expand = useCallback(
    (range: Range) => {
      if (source) {
        setRanges((prev) => [...prev, range]);
        return;
      }
      if (loading) return;
      setLoading(true);
      setFailed(false);
      fetchPrFileSourceApi(endpoint, basePathOf(file))
        .then(({ content }) => {
          setSource(splitLines(content));
          setRanges((prev) => [...prev, range]);
        })
        .catch(() => setFailed(true))
        .finally(() => setLoading(false));
    },
    [source, loading, endpoint, file],
  );

  const hunks = useMemo(() => {
    const base = parsed?.hunks ?? [];
    if (!source || ranges.length === 0) return base;
    return ranges.reduce((hs, [start, end]) => expandFromRawCode(hs, source, start, end), base);
  }, [parsed, source, ranges]);

  /**
   * Lignes où le « + » a le droit d'apparaître : celles des hunks D'ORIGINE.
   * GitHub renvoie 422 sur une ligne hors diff, et le dépliage en affiche
   * justement — proposer le bouton là offrirait un envoi voué à l'échec.
   */
  const commentableKeys = useMemo(() => commentableChangeKeys(parsed?.hunks ?? []), [parsed]);

  /** Clé de changement → la ligne qu'elle désigne, pour l'en-tête des widgets. */
  const changesByKey = useMemo(() => {
    const map = new Map<string, ChangeData>();
    for (const hunk of hunks) {
      for (const change of hunk.changes) map.set(getChangeKey(change), change);
    }
    return map;
  }, [hunks]);

  const threads = useMemo(
    () => groupReviewThreads(reviewComments, reviewThreads),
    [reviewComments, reviewThreads],
  );

  // Répartit les fils : ancrés sous leur ligne, ou périmés (repliés en bas). Le
  // départage se fait sur les hunks RENDUS — déplier du contexte peut ramener un
  // fil à sa place.
  const { threadsByKey, staleThreads } = useMemo(() => {
    const byKey = new Map<string, PrReviewThread[]>();
    const stale: PrReviewThread[] = [];
    for (const thread of threads) {
      const key = resolveThreadChangeKey(hunks, thread);
      if (!key) {
        stale.push(thread);
        continue;
      }
      const list = byKey.get(key);
      if (list) list.push(thread);
      else byKey.set(key, [thread]);
    }
    return { threadsByKey: byKey, staleThreads: stale };
  }, [threads, hunks]);

  const closeComposer = useCallback((key: string) => {
    setOpenAnchors(({ [key]: _closed, ...rest }) => rest);
    setDrafts(({ [key]: _cleared, ...rest }) => rest);
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
          side: anchor.side,
        });
        // Fermé (et brouillon vidé) au SUCCÈS seulement : sur échec le composer
        // reste ouvert avec le texte.
        closeComposer(key);
        await onCommentPosted();
      } catch (err) {
        const apiErr = err as ApiError;
        toast.error(
          apiErr.code === "lineNotInDiff" ? t("lineNotInDiffError") : apiErr.message,
        );
      } finally {
        setPostingKey(null);
      }
    },
    [openAnchors, drafts, postingKey, endpoint, file.filename, closeComposer, onCommentPosted, t],
  );

  /**
   * Un widget par ligne commentée : `react-diff-view` le rend SOUS la ligne. Les
   * fils d'une même ligne s'empilent dans un seul widget, suivis du composer.
   */
  const widgets = useMemo(() => {
    const map: Record<string, ReactNode> = {};
    const keys = new Set([...threadsByKey.keys(), ...Object.keys(openAnchors)]);
    for (const key of keys) {
      const change = changesByKey.get(key);
      // Un widget n'existe que sous une ligne rendue : sans son changement il n'y
      // a pas d'en-tête à écrire — et `Diff` ne le rendra de toute façon pas.
      if (!change) continue;
      const list = threadsByKey.get(key) ?? [];
      map[key] = (
        <LineWidget anchor={anchorOf(change)}>
          {list.map((thread) => (
            <ReviewThreadCard
              key={thread.id}
              thread={thread}
              replies={replies}
              resolution={readOnly ? undefined : resolution}
            />
          ))}
          {openAnchors[key] ? (
            <LineComposer
              value={drafts[key] ?? ""}
              onChange={(next) => setDrafts((prev) => ({ ...prev, [key]: next }))}
              onSubmit={() => void submitComment(key)}
              onCancel={() => closeComposer(key)}
              submitting={postingKey === key}
            />
          ) : null}
        </LineWidget>
      );
    }
    return map;
  }, [
    threadsByKey,
    changesByKey,
    openAnchors,
    drafts,
    postingKey,
    replies,
    resolution,
    readOnly,
    submitComment,
    closeComposer,
  ]);

  const renderGutter = useCallback(
    ({ change, side, inHoverState, renderDefault }: GutterOptions) => {
      // Lecture seule (vue diff sans PR) : rien où poster → gouttière nue.
      if (readOnly) return renderDefault();
      const anchor = gutterAnchor(change, side);
      const key = getChangeKey(change);
      // Pas d'ancre de ce côté, ou ligne hors des hunks d'origine → gouttière nue.
      if (!anchor || !commentableKeys.has(key)) return renderDefault();
      return (
        <>
          {renderDefault()}
          {inHoverState ? (
            <GutterCommentButton
              className="absolute top-1/2 left-0.5 -translate-y-1/2"
              onClick={() => setOpenAnchors((prev) => (prev[key] ? prev : { ...prev, [key]: anchor }))}
            />
          ) : null}
        </>
      );
    },
    [commentableKeys, readOnly],
  );

  const renderHunks = (rendered: HunkData[]): ReactElement[] => {
    const nodes: ReactElement[] = [];

    rendered.forEach((hunk, i) => {
      const previous = i > 0 ? rendered[i - 1] : null;
      const gap = getCollapsedLinesCountBetween(previous, hunk);
      if (canExpand && gap > 0) {
        // Écart en lignes anciennes : [start, end[. Sans hunk précédent, il part
        // du début du fichier.
        const start = previous ? previous.oldStart + previous.oldLines : 1;
        const end = hunk.oldStart;
        nodes.push(
          <ExpandBar
            key={`gap-${hunk.oldStart}`}
            count={gap}
            loading={loading}
            failed={failed}
            onExpandAll={gap <= EXPAND_STEP ? () => expand([start, end]) : undefined}
            onExpandUp={gap > EXPAND_STEP ? () => expand([end - EXPAND_STEP, end]) : undefined}
            // Rien au-dessus de la première zone : pas de « déplier vers le bas ».
            onExpandDown={
              gap > EXPAND_STEP && previous ? () => expand([start, start + EXPAND_STEP]) : undefined
            }
          />,
        );
      }
      nodes.push(<Hunk key={`hunk-${hunk.oldStart}`} hunk={hunk} />);
    });

    // Queue du fichier : `getCollapsedLinesCountBetween` ne couvre que les écarts
    // ENTRE hunks, elle se compte contre la longueur de la source. Tant que la
    // source n'est pas chargée on ignore s'il reste des lignes — on propose quand
    // même la barre (le clic charge, puis tranche), sinon une modif en haut d'un
    // gros fichier n'offrirait aucun moyen de déplier vers le bas. Si le dernier
    // hunk touchait déjà la fin, la barre disparaît une fois la source connue.
    const last = rendered[rendered.length - 1];
    if (canExpand && last) {
      const start = last.oldStart + last.oldLines;
      const count = source ? source.length - start + 1 : null;
      if (count === null || count > 0) {
        const end = count === null ? start + EXPAND_STEP : start + count;
        nodes.push(
          <ExpandBar
            key="tail"
            count={count}
            loading={loading}
            failed={failed}
            onExpandAll={count !== null && count <= EXPAND_STEP ? () => expand([start, end]) : undefined}
            onExpandDown={
              count === null || count > EXPAND_STEP
                ? () => expand([start, start + EXPAND_STEP])
                : undefined
            }
          />,
        );
      }
    }

    return nodes;
  };

  return (
    <div className="overflow-hidden rounded-md border border-border">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-2 bg-card px-3 py-2.5 text-left outline-none transition-colors hover:bg-muted/60"
      >
        {collapsed ? (
          <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
        )}
        <span className="min-w-0 flex-1 truncate font-mono text-xs">{file.filename}</span>
        <span className="shrink-0 text-[11px] tabular-nums text-emerald-600 dark:text-emerald-400">
          +{file.additions}
        </span>
        <span className="shrink-0 text-[11px] tabular-nums text-red-600 dark:text-red-400">
          −{file.deletions}
        </span>
      </button>
      {collapsed ? null : (
        <>
          {parsed ? (
            <div className="overflow-x-auto text-[13px]">
              <Diff
                viewType={viewType}
                diffType={parsed.type as DiffType}
                hunks={hunks}
                widgets={widgets}
                renderGutter={renderGutter}
              >
                {renderHunks}
              </Diff>
            </div>
          ) : (
            <div className="px-3 py-2 text-[11px] text-muted-foreground">
              {t("binaryOrLarge")}{" "}
              {prUrl ? (
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
          {/* Hors du `parsed ?` : un fichier binaire ou trop gros n'a pas de diff,
              donc AUCUN de ses fils ne s'ancre — ils vivent tous ici plutôt que de
              disparaître avec le diff qu'on ne sait pas rendre. */}
          <StaleThreads
            threads={staleThreads}
            replies={replies}
            resolution={readOnly ? undefined : resolution}
          />
        </>
      )}
    </div>
  );
}

/** Références stables : `?? []` / `?? () => {}` en ligne casseraient les mémos. */
const NO_COMMENTS: PullRequestReviewComment[] = [];
const NO_THREADS: ReviewThreadState[] = [];
const noop = () => {};

export function PrDiff({
  files,
  endpoint,
  prUrl,
  provider,
  readOnly = false,
  reviewComments = NO_COMMENTS,
  reviewThreads = NO_THREADS,
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
  /** Commentaires de review de la PR, tous fichiers confondus. */
  reviewComments?: PullRequestReviewComment[];
  /** État de résolution des fils (MIN-139). Vide = état INCONNU : les fils se
      lisent et se répondent, mais aucun ne s'annonce résolu ni ne se résout. */
  reviewThreads?: ReviewThreadState[];
  /** Rafraîchit les commentaires après un envoi réussi. */
  onCommentPosted?: () => unknown;
  className?: string;
}) {
  const t = useTranslations("PullRequests");
  const [viewType, setViewType] = useState<ViewType>("unified");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

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

  // Parse une fois puis indexe par chemin (nouveau chemin, ou ancien pour une suppression).
  const parsedByPath = useMemo(() => {
    const diffText = files.map(toUnifiedDiff).filter(Boolean).join("\n");
    const parsed = diffText ? parseDiff(diffText) : [];
    const map = new Map<string, (typeof parsed)[number]>();
    for (const p of parsed) {
      const key = p.newPath && p.newPath !== "/dev/null" ? p.newPath : p.oldPath;
      map.set(key, p);
    }
    return map;
  }, [files]);

  const orphanReplies = useReviewReplies(endpoint, onCommentPosted);
  const orphanResolution = useThreadResolution(endpoint, onCommentPosted);

  if (files.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("noDiff")}</p>;
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
    <div className={cn("pr-diff-view flex flex-col gap-2", className)}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          {t("fileCount", { count: files.length })}
          <span className="ml-2 tabular-nums text-emerald-600 dark:text-emerald-400">
            +{totalAdd}
          </span>
          <span className="ml-1 tabular-nums text-red-600 dark:text-red-400">−{totalDel}</span>
        </p>
        <SegmentedControl
          className="w-40 shrink-0"
          value={viewType}
          onChange={setViewType}
          options={[
            { value: "unified", label: t("unified") },
            { value: "split", label: t("split") },
          ]}
        />
      </div>

      <div className="flex flex-col gap-3">
        {files.map((f) => (
          <PrDiffFile
            key={f.filename}
            file={f}
            parsed={f.patch ? parsedByPath.get(f.filename) : undefined}
            viewType={viewType}
            endpoint={endpoint}
            prUrl={prUrl}
            provider={provider}
            readOnly={readOnly}
            collapsed={collapsed.has(f.filename)}
            onToggle={() => toggle(f.filename)}
            reviewComments={commentsByPath.get(f.filename) ?? NO_COMMENTS}
            reviewThreads={reviewThreads}
            onCommentPosted={onCommentPosted}
          />
        ))}
        {orphanThreads.length > 0 ? (
          <div className="overflow-hidden rounded-md border border-border">
            <StaleThreads
              threads={orphanThreads}
              replies={orphanReplies}
              resolution={readOnly ? undefined : orphanResolution}
              label={(count) => t("orphanComments", { count })}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
