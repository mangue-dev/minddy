"use client";

// La MARGE d'un bloc de page : le `+` et la poignée, au survol.
//
// C'est le geste que tout le monde a appris ailleurs, et dont l'absence se
// remarque avant toute autre qualité de l'éditeur. Il tient sur trois pièces :
//
//  - `DragHandle` (@tiptap/extension-drag-handle-react) porte le survol, le
//    positionnement et le glisser-déposer, enfants compris. Elle vise les blocs
//    de PREMIER NIVEAU seulement (pas de `nested`), et c'est un choix, pas un
//    oubli : le registre appelle « bloc » la liste, pas l'item ; le dépliant,
//    pas son contenu. `nested` ajoutait une SECONDE poignée dès qu'on survolait
//    le texte d'une citation ou d'un item — deux poignées à deux abscisses
//    différentes pour un seul bloc au sens du produit —, et sur une liste elle
//    se calait sur l'indentation de l'item, donc par-dessus le texte. Toutes
//    les actions du menu ⋯ opèrent déjà sur le bloc de premier niveau
//    (`blocksIn`, block-actions.ts) : la poignée dit maintenant la même chose ;
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
import { Tooltip, TooltipContent, TooltipTrigger, cn } from "mangue-ui";
import { BlockMenu } from "@/components/pages/block-menu";
import {
  blockRange,
  insertBlockAround,
  selectBlockAt,
} from "@/components/pages/block-actions";

/** Figé au niveau du module : le composant `DragHandle` remonte son plugin dès
    que cet objet change d'identité. */
const POSITION = { placement: "left-start", strategy: "absolute" } as const;

/** Côté d'un bouton de la gouttière (`size-6`), en pixels — il sert au calcul
    de centrage sur la première ligne du bloc, qui n'a pas d'équivalent CSS. */
const BUTTON_SIZE = 24;

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

  /**
   * La gouttière se cale sur la PREMIÈRE LIGNE du bloc, pas sur son bord haut.
   *
   * `DragHandle` place son portail au sommet du bloc survolé (`left-start`).
   * Sur un paragraphe, une ligne fait à peu près la hauteur des boutons et
   * personne ne voit la différence ; sur un titre, la ligne fait le double, et
   * la poignée flotte visiblement trop haut. On rattrape en centrant les
   * boutons sur la hauteur de ligne RÉELLE du bloc — lue dans le DOM, parce
   * qu'elle dépend de la classe du bloc et qu'aucune valeur écrite ici ne
   * suivrait un changement de typographie.
   *
   * Écrit directement dans le style plutôt que passé par un état : le bloc
   * survolé change à chaque mouvement de souris, et un rendu React par
   * mouvement re-rendrait l'éditeur entier.
   */
  const gutter = useRef<HTMLDivElement>(null);

  const onNodeChange = useCallback(
    ({ node, pos }: { node: Node | null; pos: number }) => {
      hovered.current = { node, pos };
      const element = gutter.current;
      if (!element || pos < 0 || editor.isDestroyed) return;
      const dom = editor.view.nodeDOM(pos);
      if (!(dom instanceof HTMLElement)) {
        // Pas de bloc mesurable : on REMET à zéro plutôt que de laisser le
        // décalage du bloc précédent, qui suivrait alors la souris de bloc en
        // bloc sans jamais correspondre à celui du dessous.
        element.style.marginTop = "0px";
        return;
      }
      const style = getComputedStyle(dom);
      // Le texte ne commence pas au bord du bloc : un bloc de code a 12 px de
      // rembourrage et une bordure, une citation a les siens. Sans les compter,
      // la poignée se cale sur le CADRE et flotte au-dessus de la première
      // ligne — visible sur le code, invisible sur un paragraphe qui n'a ni
      // l'un ni l'autre.
      const inset =
        parseFloat(style.paddingTop || "0") + parseFloat(style.borderTopWidth || "0");
      // `line-height: normal` ne se lit pas en pixels : on retombe sur la
      // hauteur de police, ce qui reste bien plus juste que zéro.
      const parsed = parseFloat(style.lineHeight);
      const lineHeight = Number.isFinite(parsed)
        ? parsed
        : parseFloat(style.fontSize || "0") * 1.5;
      const offset = inset + (lineHeight - BUTTON_SIZE) / 2;
      element.style.marginTop = `${Math.max(0, Math.round(offset))}px`;
    },
    [editor]
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
        computePositionConfig={POSITION}
        onNodeChange={onNodeChange}
      >
        <div ref={gutter} className="flex items-center gap-0.5 pr-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label={t("insertBlock")}
                className={BUTTON}
                onMouseDown={(event) => event.preventDefault()}
                onClick={(event) => {
                  const { pos } = hovered.current;
                  if (pos < 0) return;
                  insertBlockAround(
                    editor,
                    pos,
                    event.altKey ? "above" : "below"
                  );
                }}
              >
                <Plus className="size-4" />
              </button>
            </TooltipTrigger>
            {/* Le geste ET sa variante : `alt` insère au-dessus, ce qu'aucune
                icône ne peut dire et que personne ne devine. */}
            <TooltipContent side="top">{t("insertBlockHint")}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label={t("blockMenu")}
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
            </TooltipTrigger>
            {/* Une poignée qui fait DEUX choses : cliquer ouvre le menu,
                glisser déplace. L'infobulle dit les deux, sinon la moitié
                qu'on n'a pas essayée n'existe pas. */}
            <TooltipContent side="top">{t("dragHandleHint")}</TooltipContent>
          </Tooltip>
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
