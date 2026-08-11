"use client";

// La TABLE DES MATIÈRES flottante d'une page.
//
// Elle est posée en haut à droite du panneau, hors du flux et hors du
// défilement, et elle se lit à deux distances : au repos, une pile de TRAITS
// dont la longueur dit le niveau du titre et dont la position dit où l'on en
// est ; au survol, un panneau bordé qui porte les titres eux-mêmes, et plus un
// seul trait. C'est le geste de Notion, et ce qui le rend bon est justement ce
// qu'il ne fait pas au repos — il ne prend pas de place, il ne prend pas de
// nom, il ne demande pas à être lu.
//
// Cliquer y va ET rallume le bloc : après un défilement, rien ne distingue le
// titre qu'on a demandé de ses voisins arrivés à l'écran en même temps.
//
// Elle ne dit rien quand il n'y a rien à dire : sous deux titres, une page se
// parcourt à l'œil, et une table des matières d'une ligne est un ornement.
//
// D'où viennent les titres : de l'ÉTAT ProseMirror, pas du DOM. C'est la même
// source que le document enregistré, donc elle ne peut pas décrire une page
// qui n'existe plus ; et elle suit la frappe sans qu'on ait à observer quoi que
// ce soit. Le DOM ne sert qu'à une chose ici, mesurer — où est ce titre à
// l'écran, et où faut-il défiler pour l'y amener.

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import { useTranslations } from "next-intl";
import type { Editor } from "@tiptap/core";
import { cn } from "mangue-ui";
import { revealBlock } from "@/components/pages/block-actions";
import { readHeadings, sameHeadings, type TocEntry } from "@/lib/pages-toc";

/** En deçà, la table ne paraît pas : voir l'en-tête. */
const MIN_HEADINGS = 2;

/** Longueur du trait au repos, par niveau de titre. */
const DASH_WIDTH: Record<number, string> = { 1: "w-4", 2: "w-3", 3: "w-2" };

/** Retrait du titre déplié, par niveau. */
const INDENT: Record<number, string> = { 1: "pl-0", 2: "pl-3", 3: "pl-6" };

/** Marge au-dessus du titre visé, une fois le défilement fini. */
const SCROLL_MARGIN = 24;

function headingElement(editor: Editor, pos: number): HTMLElement | null {
  if (editor.isDestroyed || pos > editor.state.doc.content.size) return null;
  const dom = editor.view.nodeDOM(pos);
  return dom instanceof HTMLElement ? dom : null;
}

export function PageToc({
  editor,
  scrollRef,
}: {
  editor: Editor | null;
  /** Le conteneur qui défile — celui qu'on mesure, et celui qu'on déplace. */
  scrollRef: RefObject<HTMLElement | null>;
}) {
  const t = useTranslations("Pages");
  const [entries, setEntries] = useState<TocEntry[]>([]);
  const [active, setActive] = useState<number | null>(null);

  useEffect(() => {
    if (!editor) return;
    const read = () => {
      const next = readHeadings(editor.state.doc);
      setEntries((current) => (sameHeadings(current, next) ? current : next));
    };
    read();
    editor.on("update", read);
    return () => {
      editor.off("update", read);
    };
  }, [editor]);

  // Où l'on en est : le dernier titre passé au-dessus de la ligne de flottaison.
  // Mesuré au défilement plutôt que par un observateur d'intersection, parce que
  // la question n'est pas « quels titres sont visibles » (ils peuvent l'être à
  // trois, ou à zéro sur une longue section) mais « lequel suis-je en train de
  // lire », et cette réponse-là est toujours définie.
  useEffect(() => {
    // `scrollRef` est lu DANS l'effet : au premier rendu il est encore vide (le
    // conteneur est peint après), et c'est le passage de zéro à N titres qui
    // rejoue cet effet-là, une fois l'éditeur monté.
    const root = scrollRef.current;
    if (!editor || !root || entries.length < MIN_HEADINGS) return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      const line = root.getBoundingClientRect().top + SCROLL_MARGIN * 3;
      let current = entries[0].pos;
      for (const entry of entries) {
        const element = headingElement(editor, entry.pos);
        if (element && element.getBoundingClientRect().top <= line) {
          current = entry.pos;
        }
      }
      setActive(current);
    };
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(measure);
    };
    measure();
    root.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      root.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [editor, scrollRef, entries]);

  /* ── Le clignement du bloc atteint ────────────────────────────────────
     Arriver au bon endroit ne suffit pas : une fois le défilement fini, rien à
     l'écran ne dit LEQUEL des titres visibles on a demandé. `revealBlock` est
     exactement ce qu'utilise l'ancre d'un lien de bloc — même geste, même
     signal, et pas un second vocabulaire pour dire la même chose.
     On garde de quoi l'annuler : sans ça, le minuteur du clic précédent
     éteindrait le bloc qu'on vient d'allumer. */
  const unflash = useRef<(() => void) | null>(null);
  useEffect(
    () => () => {
      unflash.current?.();
    },
    []
  );

  const goTo = useCallback(
    (pos: number) => {
      const container = scrollRef.current;
      if (!editor || !container) return;
      // Y aller ET l'allumer : `revealBlock` tient les deux ensemble, et dit
      // pourquoi le défilement y est SEC — un clignement joué pendant un
      // défilement doux est un clignement que personne ne voit.
      //
      // La marge se compte depuis le haut du conteneur, et non par
      // `scrollIntoView` : celui-ci colle le titre au bord haut, sous le fil
      // d'Ariane et l'état d'enregistrement qui y sont épinglés.
      unflash.current?.();
      unflash.current = revealBlock(editor, container, pos, SCROLL_MARGIN);
    },
    [editor, scrollRef]
  );

  if (entries.length < MIN_HEADINGS) return null;

  return (
    /* DEUX COUCHES superposées, et c'est ce qui permet d'animer sans sauter.
       Les traits repliés et le panneau déplié n'ont ni le même pas, ni la même
       largeur, ni la même hauteur de ligne. Tant qu'ils étaient UNE seule
       pile, passer de l'un à l'autre voulait dire animer une géométrie contre
       une autre : les traits partaient en cours de route, et se rattrapaient à
       la fermeture. Empilés au même bord haut, chacun garde sa propre mise en
       page — plus rien ne se recalcule, et il ne reste qu'un FONDU croisé,
       qui, lui, ne peut pas sauter.

       L'enveloppe est `pointer-events-none` : elle mesure la largeur du
       panneau, et sans ça elle intercepterait les clics du document sur seize
       centimètres de vide. Seules les couches VISIBLES reprennent la souris.
       Le survol, lui, remonte quand même jusqu'ici — c'est ce qui déplie. */
    <div
      className={cn(
        // ANCRÉE EN HAUT, et non centrée : une table centrée se déplace à
        // l'œil quand la fenêtre change de hauteur, et sur une page longue elle
        // finit au milieu du texte plutôt qu'en tête de ce qu'on lit.
        "group/toc pointer-events-none absolute top-20 right-2 z-10 w-64",
        // Sous `lg`, la colonne de texte et la table se disputeraient la même
        // place : elle disparaît plutôt que de passer par-dessus le document.
        "hidden lg:block"
      )}
    >
      {/* AU REPOS — la silhouette du document. Les traits sont la seule chose
          à l'écran, et le pas serré (10 px) est ce qui les fait lire comme une
          silhouette plutôt que comme une liste. */}
      <div
        aria-hidden
        className={cn(
          "pointer-events-auto ml-auto flex w-10 flex-col items-end py-1.5 pr-1.5",
          // Une page de cent titres ne doit pas faire courir les traits sur
          // toute la hauteur : la silhouette se coupe, elle ne défile pas.
          "max-h-[70vh] overflow-hidden",
          "transition-opacity duration-200 ease-out",
          "group-hover/toc:pointer-events-none group-hover/toc:opacity-0",
          "group-focus-within/toc:pointer-events-none group-focus-within/toc:opacity-0"
        )}
      >
        {entries.map((entry) => (
          <span key={entry.pos} className="flex h-2.5 items-center">
            <span
              className={cn(
                "h-0.5 rounded-full transition-colors",
                DASH_WIDTH[Math.min(entry.level, 3)],
                entry.pos === active ? "bg-foreground/70" : "bg-foreground/25"
              )}
            />
          </span>
        ))}
      </div>

      {/* AU SURVOL — le panneau, posé par-dessus, au même bord haut. Il entre
          d'un cheveu vers la gauche : le déplacement dit d'où il sort, sans
          qu'aucune des deux couches n'ait à se réorganiser. */}
      <nav
        aria-label={t("tableOfContents")}
        className={cn(
          "absolute top-0 right-0 w-64",
          "scrollbar-quiet flex max-h-[70vh] flex-col overflow-y-auto",
          // 12 px de rayon, 6 px de rembourrage : le rayon CONCENTRIQUE d'une
          // ligne est donc de 6 px (`rounded-md` plus bas). Une valeur libre
          // ferait deux courbes qui ne s'emboîtent pas.
          "rounded-xl border border-border bg-popover/95 p-1.5 shadow-lg backdrop-blur-sm",
          "pointer-events-none translate-x-1 opacity-0",
          "transition-[opacity,transform] duration-200 ease-out",
          "group-hover/toc:pointer-events-auto group-hover/toc:translate-x-0 group-hover/toc:opacity-100",
          "group-focus-within/toc:pointer-events-auto group-focus-within/toc:translate-x-0 group-focus-within/toc:opacity-100"
        )}
      >
        {entries.map((entry) => {
          const current = entry.pos === active;
          const level = Math.min(entry.level, 3);
          return (
            <button
              key={entry.pos}
              type="button"
              onClick={() => goTo(entry.pos)}
              title={entry.text}
              className={cn(
                "flex h-7 w-full shrink-0 items-center rounded-md px-2 outline-none",
                "transition-colors hover:bg-muted",
                "focus-visible:ring-2 focus-visible:ring-ring"
              )}
            >
              <span
                className={cn(
                  "min-w-0 flex-1 truncate text-left text-[13px] font-medium",
                  // Le retrait dit la hiérarchie ici, là où au repos c'est la
                  // longueur du trait qui la dit.
                  INDENT[level],
                  current ? "text-foreground" : "text-muted-foreground"
                )}
              >
                {entry.text}
              </span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
