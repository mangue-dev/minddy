"use client";

import { useCallback, useMemo, useState } from "react";
import { useFormatter, useNow, useTranslations } from "next-intl";
import {
  Button,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Spinner,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  cn,
  toast,
} from "mangue-ui";
import {
  ChevronDown,
  ChevronRight,
  CircleCheck,
  CornerDownRight,
  SmilePlus,
} from "lucide-react";
import { AutoTextarea } from "@/components/auto-textarea";
import { GitLogin } from "@/components/git/git-login";
import { Markdown } from "@/components/markdown";
import { UserAvatar } from "@/components/user-avatar";
import {
  replyPrReviewCommentApi,
  setPrCommentReactionApi,
  setPrReviewCommentReactionApi,
  setPrReviewThreadResolvedApi,
  type PrEndpoint,
  type PullRequestReviewComment,
} from "@/lib/agent-api";
import { displayLineOf } from "@/lib/pr-review-threads";
import {
  groupReactionsByComment,
  REVIEW_REACTIONS,
  REVIEW_REACTION_EMOJI,
  type ReviewCommentReaction,
  type ReviewReactionContent,
} from "@/lib/pr-review-reactions";
import type { MessageKey } from "@/lib/i18n-keys";
import type { PrReviewThread } from "@/lib/pr-review-diff";

/**
 * Briques d'affichage des commentaires de review d'une PR : le fil ancré sous une
 * ligne (widget de `react-diff-view`), le composer d'un nouveau commentaire, et le
 * repli des fils périmés. Le placement, lui, vit dans `pr-diff`.
 */

/**
 * État des réponses à un fil de review. Partagé par la vue par fichier et le repli
 * des fils orphelins — mêmes règles des deux côtés : un seul composer ouvert à la
 * fois, mais un brouillon PAR fil (changer de fil, ou rater un envoi, ne coûte
 * jamais le texte).
 */
export function useReviewReplies(endpoint: PrEndpoint, onPosted: () => unknown) {
  const [replyingId, setReplyingId] = useState<number | null>(null);
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [postingId, setPostingId] = useState<number | null>(null);

  const submit = useCallback(
    async (threadId: number) => {
      const body = (drafts[threadId] ?? "").trim();
      if (!body || postingId != null) return;
      setPostingId(threadId);
      try {
        // N'importe quel id du fil convient : GitHub rattache à la racine.
        await replyPrReviewCommentApi(endpoint, { body, inReplyTo: threadId });
        setReplyingId(null);
        setDrafts(({ [threadId]: _cleared, ...rest }) => rest);
        await onPosted();
      } catch (err) {
        toast.error((err as Error).message);
      } finally {
        setPostingId(null);
      }
    },
    [drafts, postingId, endpoint, onPosted],
  );

  return {
    replyingId,
    postingId,
    valueFor: (threadId: number) => drafts[threadId] ?? "",
    change: (threadId: number, next: string) =>
      setDrafts((prev) => ({ ...prev, [threadId]: next })),
    start: (threadId: number) => setReplyingId(threadId),
    cancel: () => setReplyingId(null),
    submit,
  };
}

export type ReviewReplies = ReturnType<typeof useReviewReplies>;

/**
 * Bascule « résolu / rouvert » d'un fil (MIN-139). Un seul fil en vol à la fois,
 * comme les réponses : la liste se recharge après coup, deux bascules simultanées
 * se marcheraient dessus.
 */
export function useThreadResolution(endpoint: PrEndpoint, onChanged: () => unknown) {
  const [pendingId, setPendingId] = useState<number | null>(null);

  const toggle = useCallback(
    async (thread: PrReviewThread) => {
      const state = thread.resolution;
      // Sans état connu il n'y a pas d'id de fil à donner à la forge — l'appelant
      // ne rend d'ailleurs pas le bouton dans ce cas.
      if (!state || pendingId != null) return;
      setPendingId(thread.id);
      try {
        await setPrReviewThreadResolvedApi(endpoint, {
          threadId: state.threadId,
          resolved: !state.resolved,
        });
        await onChanged();
      } catch (err) {
        toast.error((err as Error).message);
      } finally {
        setPendingId(null);
      }
    },
    [endpoint, onChanged, pendingId],
  );

  return { pendingId, toggle };
}

export type ThreadResolution = ReturnType<typeof useThreadResolution>;

/**
 * Réactions emoji des commentaires d'une PR (MIN-139, élargi par MIN-147) : la
 * table indexée par commentaire, l'état voulu à poser, et le fil en vol.
 *
 * `canReact` sépare LIRE de POSER — une vue en lecture seule affiche les
 * réactions des autres sans en offrir : les masquer ferait croire qu'il n'y en a
 * pas.
 *
 * La bascule envoie l'ÉTAT VOULU (`!mine`), pas un « inverse ce que tu as » :
 * c'est le serveur qui tranche, et un renvoi après un échec réseau ne défait
 * alors pas ce qui avait abouti.
 *
 * `surface` dit sur QUELLE famille de commentaires on réagit — les deux ont la
 * même forme et les mêmes gestes, mais pas la même route : chez GitHub, les
 * commentaires ancrés au code et ceux du fil ne vivent pas au même endroit. Le
 * reste (groupement, chips, palette) est rigoureusement commun, et c'est ce qui
 * fait que réagir se comporte pareil partout.
 */
export function useCommentReactions(
  endpoint: PrEndpoint,
  onChanged: () => unknown,
  reactions: ReviewCommentReaction[],
  canReact: boolean,
  surface: "review" | "conversation" = "review",
) {
  const [pending, setPending] = useState<string | null>(null);
  const byComment = useMemo(() => groupReactionsByComment(reactions), [reactions]);

  const toggle = useCallback(
    async (commentId: number, content: ReviewReactionContent, on: boolean) => {
      if (pending) return;
      setPending(`${commentId}:${content}`);
      try {
        const post =
          surface === "review" ? setPrReviewCommentReactionApi : setPrCommentReactionApi;
        await post(endpoint, { commentId, content, on });
        await onChanged();
      } catch (err) {
        toast.error((err as Error).message);
      } finally {
        setPending(null);
      }
    },
    [endpoint, onChanged, pending, surface],
  );

  return { byComment, pending, canReact, toggle };
}

export type CommentReactions = ReturnType<typeof useCommentReactions>;

/** Clé de libellé de chaque réaction — typée, sinon `t()` ne vérifie plus rien. */
const REACTION_LABELS: Record<ReviewReactionContent, MessageKey<"PullRequests">> = {
  "+1": "reactionThumbsUp",
  "-1": "reactionThumbsDown",
  laugh: "reactionLaugh",
  hooray: "reactionHooray",
  confused: "reactionConfused",
  heart: "reactionHeart",
  rocket: "reactionRocket",
  eyes: "reactionEyes",
};

/**
 * Le geste « bascule cette réaction », partagé par les deux endroits d'où la
 * palette s'ouvre : l'état VOULU se déduit de ce qui est déjà posé, jamais d'un
 * « inverse ce que tu as » — cf. `useCommentReactions`.
 */
export function reactionToggler(
  reactions: CommentReactions,
  commentId: number,
  list: ReviewCommentReaction[],
) {
  return (content: ReviewReactionContent) =>
    void reactions.toggle(
      commentId,
      content,
      !list.find((r) => r.content === content)?.mine,
    );
}

/**
 * La bande de réactions d'un commentaire : les emoji déjà posés avec leur compte,
 * puis le bouton qui en ajoute — TOUT ce qui touche aux réactions au même endroit,
 * dans la même ligne.
 *
 * Cette ligne n'existe QUE si le commentaire porte déjà une réaction : sinon, la
 * palette reste dans l'en-tête, révélée au survol (l'appelant fait ce partage).
 * Une bande vide sous chaque message coûterait sa hauteur à tous les commentaires
 * de toutes les PR pour n'y montrer qu'un bouton — c'est aussi, exactement, ce que
 * fait GitHub.
 *
 * Un chip allumé = « MOI j'ai réagi » (MIN-145) : la réaction part du compte git
 * de la personne sur les deux forges, et le serveur ne l'allume que pour elle.
 * Sans compte git connecté, aucun chip n'est allumé — les compteurs, eux,
 * restent justes : ils disent ce que les autres ont posé.
 */
export function CommentReactionChips({
  commentId,
  reactions,
  list,
}: {
  commentId: number;
  reactions: CommentReactions;
  list: ReviewCommentReaction[];
}) {
  const t = useTranslations("PullRequests");

  return (
    <div className="flex flex-wrap items-center gap-1">
      {list.map((reaction) => {
        const busy = reactions.pending === `${commentId}:${reaction.content}`;
        // `aria-disabled` et non `disabled` : un bouton désactivé ne reçoit aucun
        // événement de pointeur, donc n'affiche jamais son infobulle — or c'est
        // en lecture seule qu'on a le PLUS besoin de lire ce que l'emoji veut
        // dire. Le clic est refusé ici, et `toggle` refuse déjà le doublon.
        const locked = !reactions.canReact || busy;
        return (
          <Tooltip key={reaction.content}>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-pressed={reaction.mine}
                aria-disabled={locked}
                aria-label={t(REACTION_LABELS[reaction.content])}
                onClick={() => {
                  if (locked) return;
                  void reactions.toggle(commentId, reaction.content, !reaction.mine);
                }}
                className={cn(
                  "flex h-7 items-center gap-1 rounded-full border px-2.5 text-xs tabular-nums transition-colors",
                  reaction.mine
                    ? "border-primary/60 bg-primary/10 text-foreground"
                    : "border-border text-muted-foreground hover:bg-muted",
                  locked && "cursor-default opacity-70",
                )}
              >
                <span className="text-[13px] leading-none">
                  {REVIEW_REACTION_EMOJI[reaction.content]}
                </span>
                {reaction.count}
              </button>
            </TooltipTrigger>
            {/* Le nom de l'emoji, et — quand c'est la mienne — le geste qu'un
                deuxième clic ferait. Les forges ne nomment pas leurs réacteurs de
                la même façon : on ne peut pas promettre le « X et Y ont réagi »
                de GitHub sans qu'il manque d'un côté. */}
            <TooltipContent side="top">
              {reaction.mine ? t("reactionMine") : t(REACTION_LABELS[reaction.content])}
            </TooltipContent>
          </Tooltip>
        );
      })}
      {/* Le bouton d'ajout ferme la bande : la ligne dit « voilà les réactions, et
          voilà comment en mettre une ». Visible en permanence, contrairement à
          celui de l'en-tête — la ligne est déjà là, rien à révéler. */}
      {reactions.canReact ? (
        <ReactionPicker onPick={reactionToggler(reactions, commentId, list)} />
      ) : null}
    </div>
  );
}

/** La palette : les huit réactions que GitHub accepte, pas une de plus. */
export function ReactionPicker({
  onPick,
  className,
}: {
  onPick: (content: ReviewReactionContent) => void;
  className?: string;
}) {
  const t = useTranslations("PullRequests");
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      {/* Le bouton porte une icône et rien d'autre : ce qu'il fait doit se lire
          sans cliquer. Infobulle plutôt que `title` natif — c'est celle du reste
          de l'app (le « Citer » du fil est juste à côté), elle se montre tout de
          suite là où le `title` du navigateur se fait attendre une seconde. Les
          deux déclencheurs sont imbriqués en `asChild` : la recette Radix pour
          qu'une infobulle et un popover partagent le MÊME bouton — le clic qui
          ouvre la palette referme l'infobulle au passage.

          Un rond de 28 px, en `Button` ghost : EXACTEMENT la forme du « Citer »
          qui le suit dans l'en-tête d'un message, et la hauteur des chips de la
          bande de réactions. Ces voisins-là se rendent toujours côte à côte — la
          moindre différence de taille ou de traitement s'y lit comme un défaut.
          Le rattrapage vertical, lui, appartient à l'EN-TÊTE (`-my-1` chez
          l'appelant) : dans la bande de réactions il n'y a rien à rattraper. */}
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t("addReaction")}
              className={cn("size-7 rounded-full text-muted-foreground", className)}
            >
              <SmilePlus className="size-4" />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="top">{t("addReaction")}</TooltipContent>
      </Tooltip>
      <PopoverContent align="start" sideOffset={6} className="flex w-auto gap-0.5 p-1">
        {REVIEW_REACTIONS.map((content) => (
          <button
            key={content}
            type="button"
            aria-label={t(REACTION_LABELS[content])}
            title={t(REACTION_LABELS[content])}
            onClick={() => {
              setOpen(false);
              onPick(content);
            }}
            className="rounded-md px-1.5 py-1 text-base leading-none transition-colors hover:bg-muted"
          >
            {REVIEW_REACTION_EMOJI[content]}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

/** Corps d'un commentaire : avatar, auteur, heure, markdown, réactions. */
function CommentBody({
  comment,
  reactions,
}: {
  comment: PullRequestReviewComment;
  /** Absentes quand la forge n'a pas su les lire : on n'affiche alors rien. */
  reactions?: CommentReactions;
}) {
  const format = useFormatter();
  const now = useNow();
  const list = reactions?.byComment.get(comment.id) ?? [];
  return (
    <div className="group flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <UserAvatar
          url={comment.user?.avatar_url}
          seed={comment.user?.login ?? "?"}
          className="size-5"
        />
        <GitLogin
          login={comment.user?.login}
          className="text-sm font-medium text-foreground"
        />
        <span className="shrink-0 text-xs text-muted-foreground/80">
          {format.relativeTime(new Date(comment.created_at), now)}
        </span>
        {/* Le repli de l'en-tête, pour un commentaire SANS réaction : dès qu'il
            en porte une, la palette descend dans la bande, avec les emoji qu'elle
            ajoute. Ici elle est révélée au survol, comme le « + » de la gouttière
            juste à côté — une palette permanente sous chaque message ferait un
            damier de boutons. Rendue quand même (et non montée au survol) pour
            rester atteignable au clavier — `focus-visible` la rallume. */}
        {reactions?.canReact && list.length === 0 ? (
          <ReactionPicker
            className="-my-1 ml-auto opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
            onPick={reactionToggler(reactions, comment.id, list)}
          />
        ) : null}
      </div>
      <Markdown className="text-sm text-foreground">{comment.body}</Markdown>
      {reactions && list.length > 0 ? (
        <CommentReactionChips commentId={comment.id} reactions={reactions} list={list} />
      ) : null}
    </div>
  );
}

/**
 * Zone de saisie partagée par le composer d'un nouveau commentaire et celui d'une
 * réponse. ⌘/Ctrl+Entrée envoie ; le texte n'est JAMAIS effacé par l'appelant tant
 * que l'envoi n'a pas réussi (un échec GitHub ne doit pas coûter le message).
 */
function Composer({
  value,
  onChange,
  onSubmit,
  onCancel,
  submitting,
  placeholder,
  submitLabel,
  autoFocus,
}: {
  value: string;
  onChange: (next: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
  submitting: boolean;
  placeholder: string;
  submitLabel: string;
  autoFocus?: boolean;
}) {
  const t = useTranslations("PullRequests");

  return (
    <div className="flex flex-col gap-2">
      <div className="w-full rounded-lg border border-border bg-background transition-colors focus-within:border-ring">
        <AutoTextarea
          autoFocus={autoFocus}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              onSubmit();
            }
            if (e.key === "Escape") onCancel();
          }}
          placeholder={placeholder}
          className="max-h-40 w-full overflow-y-auto bg-transparent px-3 py-2 text-sm outline-none placeholder:text-muted-foreground"
        />
      </div>
      <div className="flex items-center justify-end gap-1.5">
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={submitting}>
          {t("cancel")}
        </Button>
        <Button size="sm" onClick={onSubmit} disabled={submitting || !value.trim()}>
          {submitting ? <Spinner /> : null}
          {submitLabel}
        </Button>
      </div>
    </div>
  );
}

/** Nouveau commentaire sur une ligne — rendu sous la ligne visée. */
export function LineComposer({
  value,
  onChange,
  onSubmit,
  onCancel,
  submitting,
}: {
  value: string;
  onChange: (next: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
  submitting: boolean;
}) {
  const t = useTranslations("PullRequests");
  return (
    <div className="border-l-2 border-brand/40 bg-muted/30 px-3 py-2.5">
      <Composer
        autoFocus
        value={value}
        onChange={onChange}
        onSubmit={onSubmit}
        onCancel={onCancel}
        submitting={submitting}
        placeholder={t("lineCommentPlaceholder")}
        submitLabel={t("postLineComment")}
      />
    </div>
  );
}

/**
 * Un fil : les commentaires empilés, puis « Répondre » et « Résoudre ».
 *
 * Un fil RÉSOLU se rend REPLIÉ — une seule ligne « ✓ Résolu par X », dépliable.
 * C'est tout l'objet de MIN-139 : tant qu'un fil traité s'affichait exactement
 * comme un fil ouvert, le résoudre n'aurait rien changé à l'écran. Le repli est
 * local et non persistant : rouvrir la page replie de nouveau, ce qui est bien la
 * lecture voulue (« ce point est réglé, passe au suivant »).
 *
 * `resolution` peut manquer sur le fil (`thread.resolution === undefined`) quand
 * la forge n'a pas su dire l'état : on n'affiche alors AUCUNE affordance, plutôt
 * qu'un bouton qui prétendrait savoir.
 */
export function ReviewThreadCard({
  thread,
  replies,
  resolution,
  reactions,
  readOnly,
}: {
  thread: PrReviewThread;
  replies: ReviewReplies;
  /** Absent quand le fil ne se résout pas : soit la forge n'en dit rien, soit le
      compte git n'a pas le droit d'écrire sur le dépôt (MIN-144). */
  resolution?: ThreadResolution;
  /** Réactions de la PR (MIN-139) — chaque commentaire y prend les siennes. */
  reactions?: CommentReactions;
  /** Le fil se lit mais ne se répond pas — pas de compte git, ou aucun accès au
      dépôt : la réponse partirait sous l'identité du bot (MIN-144). */
  readOnly?: boolean;
}) {
  const t = useTranslations("PullRequests");
  const [expanded, setExpanded] = useState(false);
  const state = thread.resolution;
  const resolved = !!state?.resolved;
  const pending = resolution?.pendingId === thread.id;

  const resolvedLabel = state?.resolvedBy
    ? t("threadResolvedBy", { name: state.resolvedBy })
    : t("threadResolved");

  if (resolved && !expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="flex w-full items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-left text-xs text-muted-foreground transition-colors hover:bg-muted/70"
      >
        {/* Le chevron dit que la ligne se DÉPLIE — le même signal que le repli des
            fils périmés juste en dessous. Sans lui, la carte résolue se lit comme
            une étiquette morte et le fil semble perdu. */}
        <ChevronRight className="size-3.5 shrink-0" />
        <CircleCheck className="size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
        <span className="min-w-0 flex-1 truncate">{resolvedLabel}</span>
        <span className="shrink-0 text-[11px] text-muted-foreground/80">
          {t("showResolvedThread", { count: thread.comments.length })}
        </span>
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-md border border-border bg-card px-3 py-2.5">
      {/* Déplié, l'en-tête REPLIE : le geste doit être réversible là où il a été
          fait, sinon le seul retour en arrière est de recharger la page. */}
      {resolved ? (
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="flex items-center gap-1.5 text-left text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronDown className="size-3.5 shrink-0" />
          <CircleCheck className="size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
          <span className="min-w-0 truncate">{resolvedLabel}</span>
        </button>
      ) : null}
      {thread.comments.map((c) => (
        <CommentBody key={c.id} comment={c} reactions={reactions} />
      ))}
      {replies.replyingId === thread.id ? (
        <Composer
          autoFocus
          value={replies.valueFor(thread.id)}
          onChange={(next) => replies.change(thread.id, next)}
          onSubmit={() => void replies.submit(thread.id)}
          onCancel={replies.cancel}
          submitting={replies.postingId === thread.id}
          placeholder={t("replyPlaceholder")}
          submitLabel={t("postReply")}
        />
      ) : (
        <div className="flex items-center gap-1.5">
          {readOnly ? null : (
            <Button variant="outline" size="sm" onClick={() => replies.start(thread.id)}>
              {t("reply")}
            </Button>
          )}
          {resolution && state ? (
            <Button
              variant="ghost"
              size="sm"
              disabled={pending}
              // Le dépli est LOCAL, donc il survit à la bascule : sans ce reset,
              // un fil déplié puis rouvert puis re-résolu resterait déplié — or
              // c'est le repli qui fait qu'un fil traité cesse de ressembler à un
              // fil ouvert. Rouvrir n'en souffre pas : `resolved` repasse à false,
              // la carte est pleine de toute façon.
              onClick={() => {
                setExpanded(false);
                void resolution.toggle(thread);
              }}
            >
              {pending ? <Spinner /> : null}
              {resolved ? t("unresolveThread") : t("resolveThread")}
            </Button>
          ) : null}
        </div>
      )}
    </div>
  );
}

/**
 * Widget d'une ligne : tous ses fils, puis le composer s'il est ouvert.
 *
 * L'en-tête nomme la ligne visée. Sans lui, le fil flotte SOUS la ligne sans rien
 * dire de ce à quoi il se rattache — et en vue unifiée c'est franchement ambigu :
 * une ligne modifiée produit DEUX lignes portant le même numéro (la supprimée puis
 * l'ajoutée), donc deux widgets voisins. « ajoutée » / « supprimée » les départage.
 */
export function LineWidget({
  anchor,
  children,
}: {
  /** Ligne visée + nature du changement, pour l'en-tête. */
  anchor: { line: number; kind: "added" | "removed" | "context" };
  children: React.ReactNode;
}) {
  const t = useTranslations("PullRequests");
  const label =
    anchor.kind === "added"
      ? t("lineAnchorAdded", { line: anchor.line })
      : anchor.kind === "removed"
        ? t("lineAnchorRemoved", { line: anchor.line })
        : t("lineAnchor", { line: anchor.line });

  return (
    <div className="flex flex-col gap-2 bg-muted/20 px-3 py-2.5">
      {/* La flèche ↳ dit « ceci se rapporte à ce qui précède ». */}
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <CornerDownRight className="size-3 shrink-0" />
        <span className="font-mono">{label}</span>
      </div>
      {children}
    </div>
  );
}

/**
 * Fils qui ne s'ancrent plus dans le diff rendu (décision : repliés en bas du
 * fichier). Chacun garde son `diff_hunk` d'origine : sans lui, « et le cas nul ? »
 * se lit sans savoir de quel code il parlait.
 */
export function StaleThreads({
  threads,
  replies,
  resolution,
  reactions,
  readOnly,
  label,
}: {
  threads: PrReviewThread[];
  replies: ReviewReplies;
  resolution?: ThreadResolution;
  reactions?: CommentReactions;
  /** Propagé aux cartes : sans compte git, ces fils se lisent seulement. */
  readOnly?: boolean;
  /** Intitulé du repli — le cas orphelin ne se raconte pas comme un périmé. */
  label?: (count: number) => string;
}) {
  const t = useTranslations("PullRequests");
  const [open, setOpen] = useState(false);

  if (threads.length === 0) return null;

  return (
    <div className="border-t border-border">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-[11px] text-muted-foreground transition-colors hover:bg-muted/60"
      >
        {open ? (
          <ChevronDown className="size-3.5 shrink-0" />
        ) : (
          <ChevronRight className="size-3.5 shrink-0" />
        )}
        {label ? label(threads.length) : t("staleComments", { count: threads.length })}
      </button>
      {open ? (
        <div className="flex flex-col gap-3 px-3 pb-3">
          {threads.map((thread) => {
            const line = displayLineOf(thread.root);
            return (
              <div key={thread.id} className="flex flex-col gap-1.5">
                <span className="font-mono text-[11px] text-muted-foreground">
                  {line != null
                    ? t("staleAnchor", { path: thread.root.path, line })
                    : thread.root.path}
                </span>
                {/* Le hunk tel qu'il était au moment du commentaire — le contexte
                    que le diff courant ne montre plus. Sans lui, « et le cas nul ? »
                    se lit sans savoir de quel code il parlait. */}
                {thread.root.diff_hunk ? (
                  <pre className="overflow-x-auto rounded-md border border-border bg-muted/40 px-2.5 py-2 font-mono text-[11px] leading-relaxed text-muted-foreground">
                    {thread.root.diff_hunk}
                  </pre>
                ) : null}
                <ReviewThreadCard
                  thread={thread}
                  replies={replies}
                  resolution={resolution}
                  reactions={reactions}
                  readOnly={readOnly}
                />
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Bouton « + » de la gouttière — l'affordance de commentaire, façon GitHub. Rendu
 * uniquement au survol de la ligne (l'appelant décide), et posé en absolu : la
 * gouttière ne fait que 7ch, l'insérer dans le flux pousserait le numéro de ligne.
 */
export function GutterCommentButton({
  onClick,
  className,
}: {
  onClick: () => void;
  className?: string;
}) {
  const t = useTranslations("PullRequests");
  return (
    <button
      type="button"
      aria-label={t("addLineComment")}
      onClick={(e) => {
        // La gouttière porte ses propres handlers (survol, sélection) : le clic
        // sur le « + » ne doit pas les déclencher en plus.
        e.stopPropagation();
        onClick();
      }}
      className={cn(
        "flex size-4 items-center justify-center rounded-sm bg-brand text-[13px] leading-none font-semibold text-white",
        className,
      )}
    >
      +
    </button>
  );
}
