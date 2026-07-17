"use client";

import { useCallback, useState } from "react";
import { useFormatter, useNow, useTranslations } from "next-intl";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  Button,
  Spinner,
  cn,
  toast,
} from "mangue-ui";
import { ChevronDown, ChevronRight, CornerDownRight } from "lucide-react";
import { AutoTextarea } from "@/components/auto-textarea";
import { Markdown } from "@/components/markdown";
import { replyPrReviewCommentApi, type PullRequestReviewComment } from "@/lib/agent-api";
import { displayLineOf } from "@/lib/pr-review-threads";
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
export function useReviewReplies(runId: string, onPosted: () => unknown) {
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
        await replyPrReviewCommentApi(runId, { body, inReplyTo: threadId });
        setReplyingId(null);
        setDrafts(({ [threadId]: _cleared, ...rest }) => rest);
        await onPosted();
      } catch (err) {
        toast.error((err as Error).message);
      } finally {
        setPostingId(null);
      }
    },
    [drafts, postingId, runId, onPosted],
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

/** Corps d'un commentaire : avatar, auteur, heure, markdown. */
function CommentBody({ comment }: { comment: PullRequestReviewComment }) {
  const format = useFormatter();
  const now = useNow();
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <Avatar className="size-5 shrink-0 text-[9px]">
          {comment.user?.avatar_url ? (
            <AvatarImage src={comment.user.avatar_url} alt={comment.user.login} />
          ) : null}
          <AvatarFallback>{(comment.user?.login ?? "?").slice(0, 1).toUpperCase()}</AvatarFallback>
        </Avatar>
        <span className="min-w-0 truncate text-sm font-medium text-foreground">
          {comment.user?.login ?? "—"}
        </span>
        <span className="shrink-0 text-xs text-muted-foreground/80">
          {format.relativeTime(new Date(comment.created_at), now)}
        </span>
      </div>
      <Markdown className="text-sm text-foreground">{comment.body}</Markdown>
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

/** Un fil : les commentaires empilés, puis « Répondre ». */
export function ReviewThreadCard({
  thread,
  replies,
}: {
  thread: PrReviewThread;
  replies: ReviewReplies;
}) {
  const t = useTranslations("PullRequests");
  return (
    <div className="flex flex-col gap-3 rounded-md border border-border bg-card px-3 py-2.5">
      {thread.comments.map((c) => (
        <CommentBody key={c.id} comment={c} />
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
        <div>
          <Button variant="outline" size="sm" onClick={() => replies.start(thread.id)}>
            {t("reply")}
          </Button>
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
  label,
}: {
  threads: PrReviewThread[];
  replies: ReviewReplies;
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
                <ReviewThreadCard thread={thread} replies={replies} />
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
