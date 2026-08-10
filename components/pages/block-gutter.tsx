"use client";

// La MARGE d'un bloc de page : le `+` et la poignée, au survol.
//
// C'est le geste que tout le monde a appris ailleurs, et dont l'absence se
// remarque avant toute autre qualité de l'éditeur. Il tient sur trois pièces :
//
//  - `DragHandle` (@tiptap/extension-drag-handle-react) porte le survol, le
//    positionnement et le glisser-déposer, enfants compris. `nested` la fait
//    aussi apparaître sur les blocs IMBRIQUÉS — un item de liste, une tâche —
//    et pas seulement sur les blocs de premier niveau ;
//  - `+` insère un paragraphe vide EN DESSOUS et ouvre le menu « / » dedans
//    (`alt`-clic : au-dessus). Le `+` n'est pas un bouton « paragraphe », c'est
//    l'entrée du catalogue ;
//  - la poignée, cliquée, sélectionne le bloc et ouvre le menu ⋯. ⇧-clic étend
//    la sélection depuis le bloc déjà sélectionné, et le menu opère alors sur
//    tous.
//
// Le clavier passe par la MÊME ancre. La poignée vit dans un portail que
// l'extension masque par `visibility` hors survol : rien de ce qui est dedans
// n'est atteignable au clavier, quoi qu'on y mette comme `tabIndex`. On ne
// bricole donc pas la poignée — on donne au menu une seconde ancre, un point
// posé sur le bloc courant, et la touche standard d'ouverture de menu
// contextuel (⇧F10, et la touche « menu » des claviers qui en ont une) l'y
// amène. Même menu, mêmes actions, sans souris.

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslations } from "next-intl";
import type { Editor } from "@tiptap/core";
import type { Node } from "@tiptap/pm/model";
import { DragHandle } from "@tiptap/extension-drag-handle-react";
import { TextSelection } from "@tiptap/pm/state";
import { GripVertical, Plus } from "lucide-react";
import { cn } from "mangue-ui";
import { BlockMenu } from "@/components/pages/block-menu";
import {
  blockRange,
  insertBlockAround,
  selectBlockAt,
} from "@/components/pages/block-actions";

/** Figé au niveau du module : le composant `DragHandle` remonte son plugin dès
    que cet objet change d'identité. */
const POSITION = { placement: "left-start", strategy: "absolute" } as const;

const BUTTON = cn(
  "flex size-6 items-center justify-center rounded text-muted-foreground/60",
  "transition-colors hover:bg-muted hover:text-foreground",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
);

export function BlockGutter({ editor }: { editor: Editor }) {
  const t = useTranslations("Pages");

  // Le bloc survolé, en ref : il change à chaque mouvement de souris, et un
  // état le ferait re-rendre l'éditeur entier pour rien.
  const hovered = useRef<{ node: Node | null; pos: number }>({
    node: null,
    pos: -1,
  });

  const [menuOpen, setMenuOpen] = useState(false);
  // L'ancre du menu, en coordonnées d'écran : la poignée quand on clique
  // dessus, le bloc courant quand on arrive au clavier.
  const [anchor, setAnchor] = useState({ top: 0, left: 0 });

  const onNodeChange = useCallback(
    ({ node, pos }: { node: Node | null; pos: number }) => {
      hovered.current = { node, pos };
    },
    []
  );

  // Tant que le menu est ouvert, la poignée ne doit pas disparaître sous la
  // souris qui part vers le menu. L'extension lit ce drapeau dans une méta de
  // transaction — pas besoin de monter son extension pour le lui donner.
  useEffect(() => {
    if (editor.isDestroyed) return;
    editor.commands.setMeta("lockDragHandle", menuOpen);
  }, [editor, menuOpen]);

  const openMenuAt = useCallback((rect: DOMRect) => {
    setAnchor({ top: rect.top, left: rect.left });
    setMenuOpen(true);
  }, []);

  /** ⇧-clic : étendre la sélection courante jusqu'à ce bloc, plutôt que de la
      remplacer. C'est ce qui donne la sélection multi-blocs à la souris. */
  const selectFromHandle = useCallback(
    (pos: number, extend: boolean) => {
      if (!extend) return selectBlockAt(editor, pos);
      const node = editor.state.doc.nodeAt(pos);
      if (!node) return false;
      const { doc, selection } = editor.state;
      const from = Math.min(selection.from, pos);
      const to = Math.max(selection.to, pos + node.nodeSize);
      editor.view.dispatch(
        editor.state.tr.setSelection(
          TextSelection.create(
            doc,
            Math.max(from, 0),
            Math.min(to, doc.content.size)
          )
        )
      );
      return true;
    },
    [editor]
  );

  /** Le clavier : ⇧F10 (ou la touche « menu ») ouvre le menu sur le bloc où est
      le curseur, ancré sur ce bloc. */
  useEffect(() => {
    if (editor.isDestroyed) return;
    const dom = editor.view.dom;
    const onKeyDown = (event: KeyboardEvent) => {
      const wanted =
        event.key === "ContextMenu" || (event.shiftKey && event.key === "F10");
      if (!wanted) return;
      const range = blockRange(editor);
      if (!range) return;
      event.preventDefault();
      const node = editor.view.nodeDOM(range.from);
      const element =
        node instanceof HTMLElement ? node : (node?.parentElement ?? dom);
      openMenuAt(element.getBoundingClientRect());
    };
    dom.addEventListener("keydown", onKeyDown);
    return () => dom.removeEventListener("keydown", onKeyDown);
  }, [editor, openMenuAt]);

  const anchorStyle = useMemo(
    () => ({
      position: "fixed" as const,
      top: anchor.top,
      left: anchor.left,
      width: 0,
      height: 0,
    }),
    [anchor]
  );

  return (
    <>
      <DragHandle
          editor={editor}
          nested
          computePositionConfig={POSITION}
          onNodeChange={onNodeChange}
        >
          <div className="flex items-center gap-0.5 pr-1">
            <button
              type="button"
              aria-label={t("insertBlock")}
              className={BUTTON}
              onMouseDown={(event) => event.preventDefault()}
              onClick={(event) => {
                const { pos } = hovered.current;
                if (pos < 0) return;
                insertBlockAround(editor, pos, event.altKey ? "above" : "below");
              }}
            >
              <Plus className="size-4" />
            </button>
            <button
              type="button"
              aria-label={t("blockMenu")}
              title={t("dragHandle")}
              className={cn(BUTTON, "cursor-grab active:cursor-grabbing")}
              onMouseDown={(event) => event.preventDefault()}
              onClick={(event) => {
                const { pos } = hovered.current;
                if (pos < 0) return;
                if (!selectFromHandle(pos, event.shiftKey)) return;
                openMenuAt(event.currentTarget.getBoundingClientRect());
              }}
            >
              <GripVertical className="size-4" />
            </button>
          </div>
      </DragHandle>

      <BlockMenu
        editor={editor}
        open={menuOpen}
        onOpenChange={setMenuOpen}
      >
        {/* L'ancre du menu : un point, pas un bouton. Elle existe pour que le
            menu ait où se poser quand on l'ouvre au clavier, là où la poignée
            n'est pas atteignable. `tabIndex` négatif — un point de 0 pixel ne
            doit pas être une étape de tabulation. */}
        <span aria-hidden tabIndex={-1} style={anchorStyle} />
      </BlockMenu>
    </>
  );
}
