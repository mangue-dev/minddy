"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";

import { WINDOW_BUTTONS_WIDTH } from "@/components/desktop-window-buttons";
import { useHoldWindowButtons, useWideLayout } from "@/lib/use-window-buttons";

/**
 * L'entrée et la sortie de la navigation, en mode zen. Plus courte que
 * `transitions.shell` (320 ms), et c'est délibéré : la courbe du châssis est
 * celle d'une mise en page qui se réorganise — header, fil d'Ariane et contenu
 * glissent ensemble, et il faut le temps de la lire. Ici RIEN d'autre ne bouge :
 * le bloc passe au-dessus, il ne doit que suivre le pointeur. La même courbe,
 * sur un tiers de moins.
 */
const OVERLAY_SLIDE = { duration: 0.2, ease: [0.32, 0.72, 0, 1] } as const;

/** Largeur de la lisière sensible, au bord GAUCHE du châssis, qui rappelle la
 *  navigation en mode zen. Assez large pour se viser sans mire, assez fine pour
 *  ne pas manger de clics au contenu. */
const HOTZONE = 12;

/**
 * Le bloc de navigation du mode zen (MIN-134) : la barre primaire, et la
 * secondaire quand la page en porte une. Hors du flux, rappelé au survol du bord
 * gauche, il se déplie AU-DESSUS du contenu sans rien décaler — le même marché
 * que le rail de la primaire. **Le zen retire le meuble, pas la navigation.**
 *
 * Il porte TOUJOURS la primaire, y compris sur les pages sans barre secondaire.
 * La version d'avant ne rappelait que la secondaire : sur les autres pages, le
 * zen ne laissait plus aucune navigation — et sur l'app de bureau, la barre
 * démontée rendait ses BOUTONS DE FENÊTRE, qui restaient posés en travers du
 * contenu (leur seul hôte, la ligne de marque, n'était plus là).
 *
 * D'où le second rôle de ce composant : tant que le bloc est rangé, il tient les
 * boutons retirés ; le survol qui ramène la barre les ramène avec elle, à leur
 * place, sur sa ligne de marque. Sous 768 px on ne les retire pas — l'AppShell
 * n'y rend plus les barres latérales, et le mode zen n'a pas de header pour les
 * accueillir : les cacher là fermerait la fenêtre à double tour.
 */
export function ZenNavOverlay({
  width,
  children,
}: {
  /** Largeur du bloc : la primaire seule, ou la primaire plus la secondaire. */
  width: number;
  children: ReactNode;
}) {
  const reduce = useReducedMotion();
  const [open, setOpen] = useState(false);
  const [focusWithin, setFocusWithin] = useState(false);
  const panel = useRef<HTMLDivElement | null>(null);

  const shown = open || focusWithin;

  const openPanel = useCallback(() => setOpen(true), []);
  // Sans délai de grâce : le bloc suit le pointeur, il ne le fait pas attendre.
  // Le rail de la primaire en garde un (150 ms) parce qu'il RESTE à l'écran une
  // fois replié — un frôlement le fait battre. Celui-ci s'en va tout entier ;
  // le seul geste qui le sort de l'écran est celui qui le quitte vraiment.
  const closePanel = useCallback(() => setOpen(false), []);

  // Les boutons macOS suivent la barre qui les héberge : rangée, ils s'en vont
  // avec elle. Voir lib/use-window-buttons.ts pour ce que « retirer » veut dire.
  const wide = useWideLayout();
  useHoldWindowButtons("zen", wide && !shown);

  /**
   * Ce qui referme le bloc est de la GÉOMÉTRIE, pas un `onPointerLeave`.
   *
   * La barre secondaire n'est pas rendue ici : elle y est TÉLÉPORTÉE. Et un
   * portail, en React, propage ses événements le long de l'arbre REACT, pas du
   * DOM — la liste est bien dans le bloc à l'écran, mais elle n'en est pas un
   * descendant pour les gestionnaires posés dessus. Résultat : entrer dans la
   * liste ne comptait pas comme rester dedans, en sortir ne comptait pas comme
   * le quitter, et le bloc ouvert ne se refermait plus jamais.
   *
   * Un `pointermove` sur le document, comparé au rectangle du bloc, ne dépend ni
   * de l'arbre React ni de qui est monté où. Il n'écoute que tant que le bloc
   * est ouvert — au repos, il ne coûte rien.
   */
  useEffect(() => {
    if (!open) return;
    const onMove = (e: PointerEvent) => {
      const el = panel.current;
      if (!el) return;
      // Un menu ⋯, un menu de compte ou une infobulle se pose HORS du bloc
      // (portail Radix), et lui aller dessus n'est pas le quitter : ce qu'on
      // manipule vient de la navigation et la ramènerait aussitôt.
      const target = e.target as Element | null;
      if (target?.closest?.("[data-radix-popper-content-wrapper]")) {
        setOpen(true);
        return;
      }
      // Une sidebar secondaire est téléportée dans le panneau. Elle se trouve
      // bien sous `panel` dans le DOM final, même si React ne la considère pas
      // comme un descendant pour ses événements. Tester cette appartenance
      // avant la géométrie évite que le filtre de sa bande haute referme la nav
      // lors d'un décalage de coordonnées (notamment dans l'app de bureau).
      if (target && el.contains(target)) {
        setOpen(true);
        return;
      }
      // La zone testée est celle du bloc OUVERT, pas le rectangle qu'il occupe à
      // l'instant : pendant son entrée, un pointeur qui file vers l'endroit où
      // il arrive serait « dehors » et le renverrait aussitôt. On la calcule sur
      // la boîte de navigation du châssis (son `offsetParent`, largeur nulle) —
      // c'est aussi elle qui fait que tout est mesuré depuis le bord du
      // CONTENEUR, et non du moniteur, sur ultrawide.
      const box = (el.offsetParent ?? el).getBoundingClientRect();
      const inside =
        e.clientX >= box.left &&
        e.clientX <= box.left + width &&
        e.clientY >= box.top &&
        e.clientY <= box.bottom;
      setOpen(inside);
    };
    document.addEventListener("pointermove", onMove);
    // Quitter la FENÊTRE par le haut ou par la droite ne produit plus aucun
    // `pointermove` : sans ceci le bloc resterait ouvert derrière un autre
    // onglet, pour se découvrir déplié au retour.
    const onDocumentLeave = (e: PointerEvent) => {
      // Les boutons de fenêtre macOS sont natifs : y entrer fait quitter le DOM
      // sans `pointermove` exploitable. Ils occupent ce coin précis ; garder le
      // panneau ouvert permet d'achever le geste au lieu de le refermer sous le
      // pointeur. Dès qu'il revient dans la page, `onMove` reprend la décision.
      // Même protection pendant la traversée de la bande haute du panneau : le
      // grip de déplacement de la fenêtre peut engloutir le mouvement suivant,
      // particulièrement si le pointeur va vite. Sans ce filet, la nav se
      // referme avant même que le curseur atteigne son filtre ou ses contrôles.
      if (
        (e.clientX <= WINDOW_BUTTONS_WIDTH || e.clientX <= width) &&
        e.clientY <= 60
      ) {
        return;
      }
      closePanel();
    };
    document.documentElement.addEventListener("pointerleave", onDocumentLeave);
    return () => {
      document.removeEventListener("pointermove", onMove);
      document.documentElement.removeEventListener("pointerleave", onDocumentLeave);
    };
  }, [open, width, closePanel]);

  // Le focus clavier, pour la même raison, s'écoute en NATIF sur le bloc :
  // `focusin`/`focusout` remontent le DOM, donc ils voient la barre téléportée
  // — ce que `onFocusCapture` de React ne ferait pas.
  useEffect(() => {
    const el = panel.current;
    if (!el) return;
    // Seul le focus VENU DU CLAVIER retient le bloc : cliquer une ligne lui
    // donne aussi le focus, et c'est le moment précis où il doit se ranger.
    const focusIn = (e: FocusEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.matches?.(":focus-visible")) setFocusWithin(true);
    };
    const focusOut = (e: FocusEvent) => {
      if (!el.contains(e.relatedTarget as Node | null)) setFocusWithin(false);
    };
    el.addEventListener("focusin", focusIn);
    el.addEventListener("focusout", focusOut);
    return () => {
      el.removeEventListener("focusin", focusIn);
      el.removeEventListener("focusout", focusOut);
    };
  }, []);

  return (
    <>
      {/* La lisière. Elle ne fait rien d'autre qu'écouter le pointeur : le bloc
          rangé est hors champ, il n'y a donc plus rien à survoler pour le
          rappeler. Sous le bloc en z-index, pour qu'il la recouvre une fois
          ouvert au lieu de lui reprendre le pointeur. Ici les gestionnaires
          React suffisent — elle est vide, aucun portail n'y atterrit. */}
      <div
        aria-hidden
        className={`zen-nav-hotzone absolute inset-y-0 left-0 ${shown ? "z-30" : "z-[41]"}`}
        style={{ width: HOTZONE }}
        onPointerEnter={openPanel}
        onPointerMove={openPanel}
      />
      <motion.div
        ref={panel}
        className="absolute inset-y-0 left-0 z-40 flex h-full overflow-hidden bg-sidebar transition-shadow duration-200 data-[open=true]:shadow-[8px_0_32px_-8px_rgba(0,0,0,0.45)]"
        data-open={shown}
        style={{ width }}
        // `initial` explicite et fermé : le mode zen ne s'active jamais au
        // rendu serveur, le bloc part donc toujours de sa position rangée.
        initial={{ x: -width }}
        animate={{ x: shown ? 0 : -width }}
        transition={reduce ? { duration: 0 } : OVERLAY_SLIDE}
      >
        {children}
      </motion.div>
    </>
  );
}
