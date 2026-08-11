"use client";

// Le fil d'un BLOC, posé sur le bloc (MIN-282).
//
// C'est la moitié qui donne son sens à l'ancre : une discussion sur « cette
// phrase-là » se lit à côté de la phrase, pas dans un pied de page où il
// faudrait se souvenir de quoi elle parlait. Le fil de la PAGE, lui, n'a pas de
// texte à côtoyer — il vit dans l'activité de l'historique
// (components/pages/page-activity.tsx).
//
// ─── Positionnement ──────────────────────────────────────────────────────────
//
// En coordonnées d'ÉCRAN, mesurées sur le nœud du bloc, comme la bulle de
// sélection : la colonne du document porte déjà la réserve de gouttière et le
// positionnement du chrome de bloc, et rien de tout ça ne doit descendre dans
// l'éditeur. Le panneau se pose à DROITE quand la fenêtre est assez large — la
// place naturelle, celle que Notion et Google Docs ont apprise à tout le monde —
// et repasse SOUS le bloc quand elle ne l'est pas, plutôt que de sortir de
// l'écran.
//
// Il se remesure au défilement : le document défile sous lui, et un panneau
// ancré à un bloc qui n'y est plus est pire qu'un panneau fermé.

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type { Editor } from "@tiptap/core";
import { Button, cn } from "mangue-ui";
import { X } from "lucide-react";

import {
  CommentBlock,
  CommentComposer,
  ReplyComposer,
} from "@/components/issue-timeline";
import { posOfBlockId } from "@/components/pages/block-actions";
import type { PageThread } from "@/lib/page-comments";
import type { Member } from "@/lib/types";

/** Largeur du panneau, et marge qu'il garde avec le bord de la fenêtre. */
const WIDTH = 340;
const GAP = 16;
const MARGIN = 12;

export interface BlockCommentTarget {
  blockId: string;
  /** L'extrait, quand le fil s'ouvre sur une sélection qu'on vient de faire. */
  quote?: string;
}

export function PageCommentPopover({
  editor,
  target,
  threads,
  members,
  currentUserId,
  projectId,
  onClose,
  onAdd,
  onEdit,
  onDelete,
}: {
  editor: Editor | null;
  /** Le bloc dont on ouvre le fil, et l'extrait si c'est un fil qui NAÎT. */
  target: BlockCommentTarget;
  /** Les fils de ce bloc — vide quand on vient d'en ouvrir un. */
  threads: PageThread[];
  members: Member[];
  currentUserId: string | null;
  projectId: string;
  onClose: () => void;
  onAdd: (input: {
    body: string;
    mentionedUserIds: string[];
    blockId?: string | null;
    quote?: string | null;
    parentId?: string | null;
  }) => Promise<void>;
  onEdit: (commentId: string, body: string) => Promise<void>;
  onDelete: (commentId: string) => Promise<void>;
}) {
  const t = useTranslations("Pages");
  const tTimeline = useTranslations("Timeline");
  const panel = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<{ top: number; left: number } | null>(null);

  const measure = useCallback(() => {
    if (!editor || editor.isDestroyed) return;
    const pos = posOfBlockId(editor, target.blockId);
    if (pos === null) {
      // Le bloc vient de disparaître sous nos yeux (⌘Z, un coéquipier). Le fil
      // n'est pas perdu : il repart dans l'activité, marqué détaché.
      onClose();
      return;
    }
    const dom = editor.view.nodeDOM(pos);
    if (!(dom instanceof HTMLElement)) return;
    const rect = dom.getBoundingClientRect();
    const room = window.innerWidth - rect.right - GAP - MARGIN;
    const left =
      room >= WIDTH
        ? rect.right + GAP
        : Math.max(MARGIN, Math.min(rect.left, window.innerWidth - WIDTH - MARGIN));
    const top = room >= WIDTH ? rect.top : rect.bottom + 8;
    setBox({
      top: Math.max(MARGIN, Math.min(top, window.innerHeight - 160)),
      left,
    });
  }, [editor, target.blockId, onClose]);

  useEffect(() => {
    measure();
    window.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", measure);
    };
  }, [measure]);

  // Le document bouge (frappe, écriture distante) : le bloc peut descendre.
  useEffect(() => {
    if (!editor) return;
    editor.on("transaction", measure);
    return () => {
      editor.off("transaction", measure);
    };
  }, [editor, measure]);

  // Échap ferme, et un clic AILLEURS aussi — sauf dans le panneau, et sauf sur
  // une pastille : cliquer celle d'un autre bloc doit ouvrir SON fil, pas
  // refermer celui-ci et laisser l'utilisateur cliquer deux fois.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    };
    const onDown = (event: MouseEvent) => {
      const node = event.target as HTMLElement | null;
      if (panel.current?.contains(node ?? null)) return;
      if (node?.closest(".page-block-comment-badge")) return;
      onClose();
    };
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("mousedown", onDown, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("mousedown", onDown, true);
    };
  }, [onClose]);

  if (!box) return null;

  // Le panneau S'OUVRE sur un composeur dans deux cas : la bulle vient de créer
  // un fil sur une sélection (`quote`), ou le bloc n'a encore rien. Sinon il
  // s'ouvre sur la discussion, et on répond dedans.
  const fresh = !!target.quote || threads.length === 0;

  return (
    <div
      ref={panel}
      style={{ top: box.top, left: box.left, width: WIDTH }}
      className={cn(
        "fixed z-40 max-h-[min(70vh,32rem)] overflow-y-auto scrollbar-quiet",
        "rounded-lg border border-border bg-popover shadow-lg"
      )}
    >
      <div className="flex items-center gap-2 border-b border-border/60 px-3 py-2">
        <span className="min-w-0 flex-1 truncate text-xs font-medium text-muted-foreground">
          {threads.length === 0 ? t("commentOnSelection") : t("comments")}
        </span>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t("closeThread")}
          className="-my-1 size-6 rounded-full text-muted-foreground"
          onClick={onClose}
        >
          <X className="size-3.5" />
        </Button>
      </div>

      {/* L'extrait du fil qui NAÎT : ce qu'on a sélectionné, sous les yeux
          pendant qu'on écrit. Sans lui, on tape « oui mais là… » sans plus voir
          de quel « là » il s'agit. */}
      {fresh && target.quote ? (
        <p className="mx-3 mt-3 border-l-2 border-brand/50 pl-2 text-xs italic text-muted-foreground line-clamp-3">
          {target.quote}
        </p>
      ) : null}

      {threads.map((thread) => (
        <ThreadPanel
          key={thread.root.id}
          thread={thread}
          members={members}
          currentUserId={currentUserId}
          projectId={projectId}
          onAdd={onAdd}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      ))}

      {fresh && (
        <div className="p-3">
          <CommentComposer
            members={members}
            projectId={projectId}
            allowAttachments={false}
            autoFocus
            placeholder={t("commentOnSelectionPlaceholder")}
            submitLabel={tTimeline("comment")}
            onSubmit={async (body, mentionedUserIds) => {
              await onAdd({
                body,
                mentionedUserIds,
                blockId: target.blockId,
                quote: target.quote ?? null,
              });
              onClose();
            }}
          />
        </div>
      )}
    </div>
  );
}

function ThreadPanel({
  thread,
  members,
  currentUserId,
  projectId,
  onAdd,
  onEdit,
  onDelete,
}: {
  thread: PageThread;
  members: Member[];
  currentUserId: string | null;
  projectId: string;
  onAdd: (input: {
    body: string;
    mentionedUserIds: string[];
    parentId?: string | null;
  }) => Promise<void>;
  onEdit: (commentId: string, body: string) => Promise<void>;
  onDelete: (commentId: string) => Promise<void>;
}) {
  const t = useTranslations("Pages");
  const { root, replies } = thread;
  const ctx = { members };

  return (
    <div className="border-b border-border/60 last:border-b-0">
      {/* L'extrait du fil, tel qu'il se lisait quand on l'a écrit : le bloc a pu
          être réécrit depuis, et c'est justement ce qu'on veut voir. */}
      <p className="mx-3 mt-3 border-l-2 border-brand/50 pl-2 text-xs italic text-muted-foreground line-clamp-2">
        {root.quote ?? t("commentOnBlock")}
      </p>

      <div className="px-3 py-3">
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
        <div key={reply.id} className="border-t border-border/60 px-3 py-3">
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
      <div className="border-t border-border/60">
        <ReplyComposer
          members={members}
          currentUserId={currentUserId}
          projectId={projectId}
          rootId={root.id}
          allowAttachments={false}
          onReply={(parentId, body, mentionedUserIds) =>
            onAdd({ body, mentionedUserIds, parentId })
          }
        />
      </div>
    </div>
  );
}

/** Un fil de page n'a pas de pièce jointe (cf. `allowAttachments`) : le crochet
    existe pour la signature partagée, et n'est jamais appelé. */
const noAttachments = async () => {};
