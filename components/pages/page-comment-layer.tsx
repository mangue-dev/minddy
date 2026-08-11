"use client";

// Le CALQUE des commentaires d'une page (MIN-282) — ce qui vit SUR le document,
// et rien d'autre.
//
// Il ne rend aucune surface dans le flux : ni section, ni pied de page. Une
// discussion sur un passage se lit à côté du passage (le fil ouvert par la
// pastille du bloc, components/pages/page-comment-popover.tsx) ; une discussion
// sur la page ENTIÈRE se lit dans son activité, avec les autres gestes
// (components/pages/page-activity.tsx, onglet « Activité » de l'historique).
//
// Ce que ce composant tient, et qu'aucun des deux ne peut tenir seul :
//
//  • l'ensemble des blocs qui EXISTENT dans le document à l'écran — c'est lui,
//    et pas la dernière sauvegarde, qui décide de ce qui est détaché ;
//  • les liserés et les pastilles redescendus sur l'éditeur ;
//  • le fil ouvert, d'où qu'on l'ouvre : la pastille d'un bloc, ou la bulle
//    « Commenter » qui vient de naître d'une sélection.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type { Editor } from "@tiptap/core";

import {
  documentBlockIds,
  setCommentedBlocks,
  type BlockCommentsStorage,
  type CommentedBlocks,
} from "@/components/pages/block-comments";
import {
  PageCommentPopover,
  type BlockCommentTarget,
} from "@/components/pages/page-comment-popover";
import { usePageComments } from "@/lib/use-page-comments";
import { commentedBlockCounts } from "@/lib/page-comments";
import type { Member } from "@/lib/types";

export function PageCommentLayer({
  projectId,
  pageId,
  editor,
  members,
  currentUserId,
  /** Une sélection vient d'être commentée depuis la bulle : le fil s'ouvre sur
      son bloc, en mode « nouveau ». */
  draftAnchor,
  onDraftAnchorDone,
}: {
  projectId: string;
  pageId: string;
  editor: Editor | null;
  members: Member[];
  currentUserId: string | null;
  draftAnchor: BlockCommentTarget | null;
  onDraftAnchorDone: () => void;
}) {
  const t = useTranslations("Pages");
  const [openBlockId, setOpenBlockId] = useState<string | null>(null);

  /* ── Ce que le document porte, en ce moment ────────────────────────────── */
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

  const { threads, add, edit, remove } = usePageComments({
    projectId,
    pageId,
    blockIds,
  });

  /** Le compte des messages par bloc — ce que porte la pastille. La règle de ce
      qui s'allume vit dans le module pur, avec le détachement : c'est la même
      question, et elle se teste sans monter un éditeur. */
  const commentedBlocks = useMemo<CommentedBlocks>(
    () => commentedBlockCounts(threads),
    [threads]
  );

  // Le crochet que la pastille appelle, et son libellé : le widget est du DOM
  // nu, il ne peut lire ni le catalogue i18n ni un état React (cf.
  // block-comments.ts).
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    // `editor.storage` n'est pas typé par extension : le nom est celui de
    // `BlockComments.name`, et c'est le seul point de contact.
    const storage = (editor.storage as unknown as Record<string, unknown>)
      .blockComments as BlockCommentsStorage | undefined;
    if (!storage) return;
    storage.open = (blockId) => {
      onDraftAnchorDone();
      setOpenBlockId(blockId);
    };
    storage.label = t("openThread");
    return () => {
      storage.open = null;
    };
  }, [editor, t, onDraftAnchorDone]);

  // Les décorations, redescendues sur l'éditeur. Elles suivent le TEMPS RÉEL
  // sans rien de plus : la liste change, l'effet rejoue.
  //
  // Le garde-fou n'est pas une micro-optimisation : `blockIds` se refabrique à
  // chaque frappe, donc sans lui chaque lettre tapée enverrait une transaction
  // de décoration — que les décorations suivent déjà toutes seules (`set.map`).
  const painted = useRef("");
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    const signature = [...commentedBlocks]
      .map(([id, count]) => `${id}:${count}`)
      .sort()
      .join(",");
    if (signature === painted.current) return;
    painted.current = signature;
    setCommentedBlocks(editor, commentedBlocks);
  }, [editor, commentedBlocks]);

  // Le bloc dont le fil est ouvert : celui qu'on vient de sélectionner, sinon
  // celui dont on a cliqué la pastille.
  const target = useMemo<BlockCommentTarget | null>(() => {
    if (draftAnchor) return draftAnchor;
    return openBlockId ? { blockId: openBlockId } : null;
  }, [draftAnchor, openBlockId]);

  const close = useCallback(() => {
    setOpenBlockId(null);
    onDraftAnchorDone();
  }, [onDraftAnchorDone]);

  // Les fils DE CE BLOC — y compris quand on vient d'en commencer un neuf sur
  // un bloc déjà commenté : la discussion en cours doit être sous les yeux
  // pendant qu'on écrit, sinon on répète ce qui vient d'être dit.
  const openThreads = useMemo(
    () =>
      target
        ? threads.filter(
            (thread) => !thread.detached && thread.root.block_id === target.blockId
          )
        : [],
    [threads, target]
  );

  if (!target) return null;

  return (
    <PageCommentPopover
      editor={editor}
      target={target}
      threads={openThreads}
      members={members}
      currentUserId={currentUserId}
      projectId={projectId}
      onClose={close}
      onAdd={add}
      onEdit={edit}
      onDelete={remove}
    />
  );
}
