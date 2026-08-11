"use client";

// Le FIL d'une page (MIN-282) — la quatrième surface de commentaires de minddy,
// et la seule qui s'ancre.
//
// Trois décisions de dessin, et elles répondent aux trois autres fils :
//
//  • EN PIED DU DOCUMENT, comme « Cité par » (MIN-279) : on descend, on finit
//    de lire, on répond. Pas un panneau latéral — il volerait de la largeur au
//    document en permanence pour une discussion qui n'existe pas toujours.
//  • LES DÉTACHÉS EN TÊTE. Un fil dont le bloc a disparu ne se rappelle plus à
//    personne par le document : c'est la liste, et elle seule, qui peut encore
//    le montrer. Il garde son extrait figé — supprimer le fil avec le bloc
//    perdrait la seule trace de pourquoi le bloc a été retiré.
//  • LES RÉSOLUS CACHÉS, derrière un bouton qui les COMPTE. Sans le compte,
//    « il n'y a rien » et « tout a été tranché » se ressemblent.
//
// Les messages eux-mêmes sont rendus par les composants du fil de ticket
// (components/issue-timeline.tsx) : `CommentBlock`, `ReplyComposer`,
// `CommentComposer`. C'est la généralisation demandée par le ticket plutôt
// qu'une quatrième copie — le prix en a été une interface `ThreadMessage` et
// deux drapeaux (`allowAttachments`, les libellés).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type { Editor } from "@tiptap/core";
import { Button, Spinner, cn, toast } from "mangue-ui";
import { Check, Eye, EyeOff, Link2Off, MessageSquare, Undo2 } from "lucide-react";

import {
  CommentBlock,
  CommentComposer,
  ReplyComposer,
} from "@/components/issue-timeline";
import {
  documentBlockIds,
  setCommentedBlocks,
} from "@/components/pages/block-comments";
import { posOfBlockId, revealBlock } from "@/components/pages/block-actions";
import { usePageComments } from "@/lib/use-page-comments";
import type { PageThread } from "@/lib/page-comments";
import type { PageCommentAnchor } from "@/components/pages/page-comment-bubble";
import type { Member } from "@/lib/types";

/** Marge au-dessus du bloc révélé — la même que l'ancre d'URL (page-view.tsx). */
const ANCHOR_MARGIN = 96;

export function PageComments({
  projectId,
  pageId,
  editor,
  scrollRef,
  members,
  currentUserId,
  draftAnchor,
  onDraftAnchorDone,
  className,
}: {
  projectId: string;
  pageId: string;
  /** L'éditeur vivant : il dit quels blocs EXISTENT (donc ce qui est détaché),
      il reçoit le liseré, et c'est lui qu'on fait défiler jusqu'au bloc. */
  editor: Editor | null;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  members: Member[];
  currentUserId: string | null;
  /** Une sélection vient d'être commentée depuis la bulle : le composeur ancré
      s'ouvre avec son extrait. */
  draftAnchor: PageCommentAnchor | null;
  onDraftAnchorDone: () => void;
  className?: string;
}) {
  const t = useTranslations("Pages");
  const tTimeline = useTranslations("Timeline");
  const [showResolved, setShowResolved] = useState(false);

  /* ── Ce que le document porte, en ce moment ────────────────────────────── */
  //
  // Pas la dernière sauvegarde : le document À L'ÉCRAN. Un bloc supprimé il y a
  // une seconde n'est plus là, même si la base l'a encore — et c'est bien ce
  // qu'il faut, sinon le fil ne se marquerait détaché qu'après l'enregistrement.
  const [blockIds, setBlockIds] = useState<ReadonlySet<string>>(
    () => new Set<string>()
  );
  useEffect(() => {
    if (!editor) return;
    const sync = () => setBlockIds(documentBlockIds(editor));
    sync();
    editor.on("update", sync);
    return () => {
      editor.off("update", sync);
    };
  }, [editor]);

  const { threads, commentedBlocks, hiddenResolved, loading, add, edit, remove, resolve } =
    usePageComments({ projectId, pageId, blockIds, showResolved });

  // Le liseré, redescendu sur l'éditeur. Il suit le TEMPS RÉEL sans rien de
  // plus : la liste change, l'effet rejoue, la décoration se remplace.
  //
  // Le garde-fou n'est pas une micro-optimisation : `blockIds` se refabrique à
  // chaque frappe, donc sans lui chaque lettre tapée enverrait une transaction
  // de décoration — que les décorations suivent déjà toutes seules (`set.map`).
  const painted = useRef("");
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    const signature = [...commentedBlocks].sort().join(",");
    if (signature === painted.current) return;
    painted.current = signature;
    setCommentedBlocks(editor, commentedBlocks);
  }, [editor, commentedBlocks]);

  const reveal = useCallback(
    (blockId: string) => {
      const container = scrollRef.current;
      if (!editor || editor.isDestroyed || !container) return;
      const pos = posOfBlockId(editor, blockId);
      if (pos === null) return;
      revealBlock(editor, container, pos, ANCHOR_MARGIN);
    },
    [editor, scrollRef]
  );

  const ctx = useMemo(() => ({ members }), [members]);

  const onReply = useCallback(
    async (parentId: string, body: string, mentionedUserIds: string[]) => {
      await add({ body, parentId, mentionedUserIds });
    },
    [add]
  );

  const postAnchored = useCallback(
    async (body: string, mentionedUserIds: string[]) => {
      if (!draftAnchor) return;
      await add({
        body,
        blockId: draftAnchor.blockId,
        quote: draftAnchor.quote,
        mentionedUserIds,
      });
      onDraftAnchorDone();
    },
    [add, draftAnchor, onDraftAnchorDone]
  );

  const count = threads.length;

  return (
    <section className={cn("mt-10 border-t border-border/60 pt-6", className)}>
      <div className="mb-3 flex items-center gap-2">
        <MessageSquare className="size-4 text-muted-foreground" />
        <h2 className="text-sm font-medium">
          {count > 0 ? t("commentsWithCount", { count }) : t("comments")}
        </h2>
        <span className="min-w-0 flex-1" />
        {loading && <Spinner className="size-3.5 text-muted-foreground" />}
        {(hiddenResolved > 0 || showResolved) && (
          <Button
            variant="ghost"
            size="sm"
            className="rounded-full text-muted-foreground"
            onClick={() => setShowResolved((v) => !v)}
          >
            {showResolved ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
            {showResolved
              ? t("hideResolvedComments")
              : t("showResolvedComments", { count: hiddenResolved })}
          </Button>
        )}
      </div>

      {/* Le composeur ANCRÉ : ouvert par la bulle de sélection, il montre ce
          dont il parle. Sans cet extrait à l'écran, on écrirait « oui mais
          là… » sans plus voir de quel « là » il s'agit. */}
      {draftAnchor && (
        <div className="mb-3 rounded-lg border border-brand/40 bg-brand/[0.03] p-3">
          <QuoteLine quote={draftAnchor.quote} />
          <div className="mt-2">
            <CommentComposer
              members={members}
              projectId={projectId}
              allowAttachments={false}
              autoFocus
              placeholder={t("commentOnSelectionPlaceholder")}
              submitLabel={tTimeline("comment")}
              onSubmit={(body, mentionedUserIds) =>
                postAnchored(body, mentionedUserIds)
              }
            />
          </div>
          <div className="mt-2 flex justify-end">
            <Button
              variant="ghost"
              size="sm"
              className="rounded-full"
              onClick={onDraftAnchorDone}
            >
              {t("cancelAnchoredComment")}
            </Button>
          </div>
        </div>
      )}

      {count > 0 && (
        <ol className="mb-4 flex flex-col gap-3">
          {threads.map((thread) => (
            <ThreadCard
              key={thread.root.id}
              thread={thread}
              ctx={ctx}
              members={members}
              currentUserId={currentUserId}
              projectId={projectId}
              onReveal={reveal}
              onReply={onReply}
              onEdit={edit}
              onDelete={remove}
              onResolve={resolve}
            />
          ))}
        </ol>
      )}

      {/* Le fil de la PAGE, à sa suite : ce qu'on dit du document entier. */}
      <CommentComposer
        members={members}
        projectId={projectId}
        allowAttachments={false}
        placeholder={t("commentPagePlaceholder")}
        submitLabel={tTimeline("comment")}
        onSubmit={(body, mentionedUserIds) => add({ body, mentionedUserIds })}
      />
    </section>
  );
}

/** L'extrait cité, sur une ligne — la phrase dont le fil parle. */
function QuoteLine({
  quote,
  className,
}: {
  quote: string | null;
  className?: string;
}) {
  if (!quote) return null;
  return (
    <p
      className={cn(
        "border-l-2 border-brand/50 pl-2 text-xs italic text-muted-foreground line-clamp-2",
        className
      )}
    >
      {quote}
    </p>
  );
}

function ThreadCard({
  thread,
  ctx,
  members,
  currentUserId,
  projectId,
  onReveal,
  onReply,
  onEdit,
  onDelete,
  onResolve,
}: {
  thread: PageThread;
  ctx: { members: Member[] };
  members: Member[];
  currentUserId: string | null;
  projectId: string;
  onReveal: (blockId: string) => void;
  onReply: (
    parentId: string,
    body: string,
    mentionedUserIds: string[]
  ) => Promise<void>;
  onEdit: (commentId: string, body: string) => Promise<void>;
  onDelete: (commentId: string) => Promise<void>;
  onResolve: (commentId: string, resolved: boolean) => Promise<void>;
}) {
  const t = useTranslations("Pages");
  const [busy, setBusy] = useState(false);
  const { root, replies, anchored, detached, resolved } = thread;

  const toggleResolved = async () => {
    setBusy(true);
    try {
      await onResolve(root.id, !resolved);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <li
      className={cn(
        "flex flex-col rounded-lg border bg-card",
        detached ? "border-amber-500/40" : "border-border",
        // Un fil résolu est là pour mémoire : il ne réclame plus le regard.
        resolved && "opacity-60"
      )}
    >
      <div className="flex items-start gap-2 border-b border-border/60 px-3.5 py-2">
        <div className="min-w-0 flex-1">
          {detached ? (
            <>
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-600 dark:text-amber-500">
                <Link2Off className="size-3.5" />
                {t("commentDetached")}
              </span>
              <QuoteLine quote={root.quote} className="mt-1" />
            </>
          ) : anchored ? (
            // Cliquer le fil AMÈNE à son bloc et le fait clignoter : c'est le
            // même geste que la table des matières et que l'ancre d'URL, et il
            // passe par le même chemin (`revealBlock`).
            <button
              type="button"
              onClick={() => onReveal(root.block_id as string)}
              className="w-full text-left outline-none"
            >
              <QuoteLine
                quote={root.quote ?? t("commentOnBlock")}
                className="transition-colors hover:border-brand hover:text-foreground"
              />
            </button>
          ) : (
            <span className="text-xs text-muted-foreground">{t("commentOnPage")}</span>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          disabled={busy}
          onClick={() => void toggleResolved()}
          className="-my-1 shrink-0 rounded-full text-xs text-muted-foreground"
        >
          {busy ? (
            <Spinner className="size-3.5" />
          ) : resolved ? (
            <Undo2 className="size-3.5" />
          ) : (
            <Check className="size-3.5" />
          )}
          {resolved ? t("reopenThread") : t("resolveThread")}
        </Button>
      </div>

      <div className="px-3.5 py-3">
        <CommentBlock
          comment={root}
          ctx={ctx}
          currentUserId={currentUserId}
          onEdit={onEdit}
          onDelete={onDelete}
          onDeleteAttachment={noAttachments}
          deletesReplies={replies.length > 0}
        />
      </div>
      {replies.map((reply) => (
        <div key={reply.id} className="border-t border-border/60 px-3.5 py-3">
          <CommentBlock
            comment={reply}
            ctx={ctx}
            currentUserId={currentUserId}
            onEdit={onEdit}
            onDelete={onDelete}
            onDeleteAttachment={noAttachments}
            deletesReplies={false}
            isReply
          />
        </div>
      ))}
      {/* Un fil RÉSOLU ne se répond plus : le rouvrir est le geste qui précède,
          et il est à un clic. Sans ça, « résolu » ne voudrait rien dire. */}
      {!resolved && (
        <div className="border-t border-border/60">
          <ReplyComposer
            members={members}
            currentUserId={currentUserId}
            projectId={projectId}
            rootId={root.id}
            allowAttachments={false}
            onReply={(parentId, body, mentionedUserIds) =>
              onReply(parentId, body, mentionedUserIds)
            }
          />
        </div>
      )}
    </li>
  );
}

/** Un fil de page n'a pas de pièce jointe (cf. `allowAttachments`) : le crochet
    de suppression existe pour la signature partagée, et n'est jamais appelé. */
const noAttachments = async () => {};
