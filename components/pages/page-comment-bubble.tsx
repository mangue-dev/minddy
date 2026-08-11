"use client";

// La bulle « Commenter » (MIN-282) — le geste qui ancre une discussion à un bloc.
//
// On sélectionne du texte, une bulle paraît au-dessus, on clique : le fil
// s'ouvre À CÔTÉ du bloc (page-comment-popover.tsx), ancré sur lui, avec
// l'extrait sélectionné figé dedans. C'est ce qui rend la relecture utile — « cette phrase-là » — et c'est
// la seule chose qu'un fil de page sans ancre ne saurait pas dire.
//
// ─── Trois choix de mécanique ───────────────────────────────────────────────
//
//  • `position: fixed` et des coordonnées d'ÉCRAN (`coordsAtPos`), plutôt qu'un
//    parent positionné. La colonne du document porte déjà la réserve de
//    gouttière et le positionnement du chrome de bloc (cf. page-view.tsx) ; y
//    ajouter une ancre pour cette bulle-ci demanderait de la faire descendre
//    dans l'éditeur, qui n'a délibérément ni `relative` ni retrait.
//  • `onMouseDown` avec `preventDefault`, et pas `onClick` : cliquer un bouton
//    hors de la zone éditable efface la sélection AVANT le clic, donc le geste
//    perdrait exactement ce qu'il vient chercher.
//  • L'ancre est le bloc de PREMIER NIVEAU qui contient le début de la
//    sélection — la même granularité que la poignée, que le lien de bloc et que
//    la fusion de MIN-271. Une sélection à cheval sur deux blocs s'ancre donc au
//    premier : c'est de lui que part la phrase qu'on commente.

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import type { Editor } from "@tiptap/core";
import { MessageSquarePlus } from "lucide-react";
import { cn } from "mangue-ui";

import { PAGE_BLOCK_ID_ATTRIBUTE } from "@/lib/pages-mentions";
import { MAX_QUOTE_LENGTH } from "@/lib/page-comments";

/** Ce qu'un clic sur la bulle rend : où ancrer, et ce dont on parle. */
export interface PageCommentAnchor {
  blockId: string;
  quote: string;
}

/** Le bloc de premier niveau qui contient cette position, et son id. */
function anchorBlockId(editor: Editor, pos: number): string | null {
  const resolved = editor.state.doc.resolve(pos);
  // `depth >= 1` : le nœud de profondeur 1 est le bloc de premier niveau. Une
  // sélection dans une puce remonte donc à la liste, comme partout ailleurs.
  const node = resolved.depth >= 1 ? resolved.node(1) : null;
  const id = node?.attrs?.[PAGE_BLOCK_ID_ATTRIBUTE];
  return typeof id === "string" && id ? id : null;
}

interface BubbleState {
  top: number;
  left: number;
  anchor: PageCommentAnchor;
}

/** Hauteur réservée au-dessus de la sélection — la bulle ne doit pas couvrir
    la ligne dont on parle. */
const OFFSET = 8;

export function PageCommentBubble({
  editor,
  onComment,
}: {
  editor: Editor | null;
  onComment: (anchor: PageCommentAnchor) => void;
}) {
  const t = useTranslations("Pages");
  const [state, setState] = useState<BubbleState | null>(null);

  const measure = useCallback(() => {
    if (!editor || editor.isDestroyed || !editor.isEditable) {
      setState(null);
      return;
    }
    const { from, to, empty } = editor.state.selection;
    if (empty) {
      setState(null);
      return;
    }
    const quote = editor.state.doc.textBetween(from, to, " ").trim();
    const blockId = anchorBlockId(editor, from);
    // Une sélection de blocs entiers (glissé dans la gouttière) n'a pas de
    // texte : il n'y aurait rien à citer, et le geste appartient au menu ⋯.
    if (!blockId || !quote) {
      setState(null);
      return;
    }
    const start = editor.view.coordsAtPos(from);
    const end = editor.view.coordsAtPos(to);
    setState({
      top: Math.min(start.top, end.top) - OFFSET,
      left: (start.left + end.left) / 2,
      anchor: { blockId, quote: quote.slice(0, MAX_QUOTE_LENGTH) },
    });
  }, [editor]);

  useEffect(() => {
    if (!editor) return;
    editor.on("selectionUpdate", measure);
    editor.on("transaction", measure);
    // Le document défile sous la bulle : elle est en coordonnées d'écran, donc
    // elle doit se remesurer. `capture` — le conteneur qui défile est un div,
    // et l'événement de défilement d'un élément ne remonte pas.
    window.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);
    return () => {
      editor.off("selectionUpdate", measure);
      editor.off("transaction", measure);
      window.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", measure);
    };
  }, [editor, measure]);

  if (!state) return null;

  return (
    <button
      type="button"
      // Cf. l'en-tête : la sélection meurt avant le clic sans ce
      // `preventDefault`, et c'est elle qu'on vient chercher.
      onMouseDown={(event) => {
        event.preventDefault();
        onComment(state.anchor);
        setState(null);
      }}
      style={{ top: state.top, left: state.left }}
      className={cn(
        "fixed z-50 -translate-x-1/2 -translate-y-full",
        "flex items-center gap-1.5 rounded-full border border-border bg-popover",
        "px-2.5 py-1 text-xs font-medium text-foreground shadow-md",
        "transition-colors hover:bg-control"
      )}
    >
      <MessageSquarePlus className="size-3.5 text-muted-foreground" />
      {t("commentSelection")}
    </button>
  );
}
