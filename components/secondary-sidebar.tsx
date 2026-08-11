"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { motion, useReducedMotion } from "framer-motion";
import { cn, useIsMobileLayout } from "mangue-ui";
import { useSecondarySidebar } from "@/lib/secondary-sidebar-context";
import { SidebarFilterField } from "@/components/sidebar-filter-field";
import { transitions } from "@/lib/motion";

/** Largeur de la colonne (`w-80`), partagée par le volet et sa gouttière. */
const SECONDARY_WIDTH = 320;

/**
 * L'enregistrement doit être fait AVANT la peinture : c'est lui qui décide si la
 * sidebar primaire est en rail. Passé par un effet ordinaire, on verrait la
 * primaire dépliée le temps d'une image à chaque navigation vers une page à
 * barre secondaire.
 */
const useIsoLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * La colonne de navigation d'une page — liste des pull requests, des sessions
 * d'agent, du triage, des retours. Écrite dans la page (son état de sélection
 * pilote le détail juste à côté), affichée dans le châssis de l'application.
 *
 * Deux rendus, un seul composant :
 *
 * - **≥ 1200 px** : téléportée dans le châssis, pleine hauteur, à gauche du
 *   header. Sa ligne de titre fait la hauteur du header et porte la même
 *   bordure basse — une seule ligne horizontale traverse l'écran.
 * - **< 1200 px** : rendue sur place, exactement comme avant — colonne de la
 *   page à partir de `md`, page entière en dessous, `hiddenOnMobile` la cédant
 *   au détail. Le mobile ne bouge pas.
 */
export function SecondarySidebar({
  title,
  filter,
  actions,
  hiddenOnMobile,
  children,
}: {
  /**
   * Le nom de la colonne. Il n'est plus ÉCRIT sur la ligne de titre — le fil
   * d'Ariane le porte déjà, sur la même bande horizontale et à 340 px de là —
   * mais il reste l'étiquette accessible du volet, et le repli quand la page
   * n'offre pas de filtre. Omis par les SQUELETTES de route, qui occupent la
   * place de la barre le temps que l'écran arrive : sans eux la primaire se
   * déplierait et la gouttière se refermerait à chaque navigation, pour tout
   * rouvrir une demi-seconde plus tard.
   */
  title?: string;
  /**
   * Le filtre texte de la liste, qui occupe la ligne de titre.
   *
   * Passé en données plutôt qu'en `ReactNode` : les cinq écrans à barre
   * secondaire doivent offrir le même geste, au même endroit, avec la même
   * apparence — un `ReactNode` laisserait chacun réinventer sa version.
   *
   * Il n'y a PAS de compteur à côté : le nombre d'éléments est dans le
   * placeholder (« Filtrer les 12 pull requests… »). Un chiffre posé seul entre
   * le champ et les actions ne disait pas de quoi il comptait, et volait à un
   * champ déjà à l'étroit les 20 px qui font la différence.
   */
  filter?: {
    value: string;
    onChange: (value: string) => void;
    placeholder: string;
    clearLabel: string;
  };
  /** Actions de la ligne de titre (filtres, bouton de création…), poussées à droite. */
  actions?: ReactNode;
  /**
   * Sous `md`, la liste et le détail se relaient en plein écran : passer ici
   * l'état « le détail est ouvert » de la page. Sans effet au-dessus de `md`.
   */
  hiddenOnMobile?: boolean;
  children: ReactNode;
}) {
  const { slot, register } = useSecondarySidebar();
  const isMobileLayout = useIsMobileLayout();
  // Rien au rendu serveur : la place à prendre dans le châssis y est réservée
  // par la route (routeHasSecondaryNav), et rendre la barre ici avant de savoir
  // où elle va ferait diverger l'hydratation.
  const [mounted, setMounted] = useState(false);

  useIsoLayoutEffect(() => {
    setMounted(true);
    return register();
  }, [register]);

  if (!mounted) return null;

  const hoisted = !isMobileLayout && slot !== null;

  const aside = (
    <aside
      aria-label={title}
      className={cn(
        "min-h-0 flex-col",
        hoisted
          ? "flex h-full w-full border-r border-sidebar-border bg-sidebar"
          : cn(
              "w-full shrink-0 border-border md:flex md:w-80 md:border-r",
              hiddenOnMobile ? "hidden" : "flex",
            ),
      )}
    >
      {/* La ligne de titre COMMANDE la colonne, elle ne la nomme pas : le filtre
          de la liste, ce qui la restreint, ce qu'on peut y créer. C'est la seule
          bande épinglée du volet — tout ce qui pilote la liste doit être ici, et
          non dans `children`, qui défile avec elle. */}
      <div className="flex h-[60px] shrink-0 items-center gap-2 border-b border-border px-4">
        {filter ? (
          <SidebarFilterField {...filter} />
        ) : title ? (
          <h1 className="min-w-0 flex-1 truncate font-display text-lg font-semibold tracking-tight">
            {title}
          </h1>
        ) : (
          <div className="flex-1" />
        )}
        {actions ? (
          <div className="flex shrink-0 items-center">{actions}</div>
        ) : null}
      </div>
      <div className="scrollbar-quiet flex min-h-0 flex-1 flex-col overflow-y-auto">
        {children}
      </div>
    </aside>
  );

  return hoisted ? createPortal(aside, slot) : aside;
}

/**
 * L'entrée et la sortie du volet, en mode zen. Plus courte que `transitions.shell`
 * (320 ms), et c'est délibéré : la courbe du châssis est celle d'une mise en page
 * qui se réorganise — header, fil d'Ariane et contenu glissent ensemble, et il
 * faut le temps de la lire. Ici RIEN d'autre ne bouge : le volet passe au-dessus,
 * il ne doit que suivre le pointeur. La même courbe, sur un tiers de moins.
 */
const OVERLAY_SLIDE = { duration: 0.2, ease: [0.32, 0.72, 0, 1] } as const;

/** Largeur de la lisière sensible, au bord GAUCHE du châssis, qui rappelle le
 *  volet en mode zen. Assez large pour se viser sans mire, assez fine pour ne
 *  pas manger de clics au contenu. */
const OVERLAY_HOTZONE = 12;

/**
 * Le point d'accueil, posé par le châssis entre la sidebar primaire et la
 * colonne header + contenu. Il a DEUX formes, et le mode zen décide laquelle :
 * la gouttière ordinaire, qui pousse le contenu (`SecondarySidebarGutter`), et
 * le volet en surimpression, qui ne pousse rien (`SecondarySidebarOverlay`).
 *
 * L'état d'ouverture du volet vit ICI, au-dessus des deux, et non dans l'overlay
 * lui-même : il doit se remettre à zéro à la SORTIE du zen, alors que l'overlay
 * est justement démonté à ce moment-là.
 */
export function SecondarySidebarSlot({
  reserve,
  overlay = false,
}: {
  reserve: boolean;
  /**
   * Mode zen (MIN-134) : la barre secondaire quitte le flux comme la primaire,
   * mais elle ne DISPARAÎT pas — elle se rappelle au survol du bord gauche et se
   * déplie AU-DESSUS du contenu, sans rien décaler. C'est le même marché que le
   * rail de la primaire : le zen retire le meuble, pas la navigation.
   */
  overlay?: boolean;
}) {
  const reduce = useReducedMotion();
  const [open, setOpen] = useState(false);
  const [focusWithin, setFocusWithin] = useState(false);

  const openPanel = useCallback(() => setOpen(true), []);
  // Sans délai de grâce : le volet suit le pointeur, il ne le fait pas attendre.
  // Le rail de la primaire en garde un (150 ms) parce qu'il RESTE à l'écran une
  // fois replié — un frôlement le fait battre. Celui-ci s'en va tout entier ;
  // le seul geste qui le sort de l'écran est celui qui le quitte vraiment.
  const closePanel = useCallback(() => setOpen(false), []);

  // Sortir du mode zen le pointeur posé sur le volet : le `pointermove` du
  // document se débranche au démontage, et personne ne verrait donc jamais le
  // pointeur en sortir. Sans cette remise à zéro, le volet reviendrait ouvert au
  // prochain zen, à l'autre bout de l'écran.
  useEffect(() => {
    if (overlay) return;
    setOpen(false);
    setFocusWithin(false);
  }, [overlay]);

  if (overlay) {
    return (
      <SecondarySidebarOverlay
        open={open || focusWithin}
        reduce={Boolean(reduce)}
        onOpen={openPanel}
        onClose={closePanel}
        onFocusWithinChange={setFocusWithin}
      />
    );
  }

  return <SecondarySidebarGutter reserve={reserve} reduce={Boolean(reduce)} />;
}

/**
 * Le volet en surimpression du mode zen. Il est posé en `absolute` DANS la boîte
 * de navigation du châssis — donc au bord gauche du CONTENEUR, pas de l'écran :
 * sur ultrawide, où le châssis devient une carte centrée (`3xl:max-w-…`), la
 * lisière sensible suit la carte et non le bord du moniteur.
 */
function SecondarySidebarOverlay({
  open,
  reduce,
  onOpen,
  onClose,
  onFocusWithinChange,
}: {
  open: boolean;
  reduce: boolean;
  onOpen: () => void;
  onClose: () => void;
  onFocusWithinChange: (value: boolean) => void;
}) {
  const { setSlot } = useSecondarySidebar();
  const panel = useRef<HTMLDivElement | null>(null);

  /**
   * Ce qui referme le volet est de la GÉOMÉTRIE, pas un `onPointerLeave`.
   *
   * La barre n'est pas rendue ici : elle y est TÉLÉPORTÉE. Et un portail, en
   * React, propage ses événements le long de l'arbre REACT, pas du DOM — la
   * liste est bien dans le volet à l'écran, mais elle n'en est pas un descendant
   * pour les gestionnaires posés dessus. Résultat : entrer dans la liste ne
   * comptait pas comme rester dans le volet, en sortir ne comptait pas comme le
   * quitter, et le volet ouvert ne se refermait plus jamais.
   *
   * Un `pointermove` sur le document, comparé au rectangle du volet, ne dépend
   * ni de l'arbre React ni de qui est monté où. Il n'écoute que tant que le
   * volet est ouvert — au repos, il ne coûte rien.
   */
  useEffect(() => {
    if (!open) return;
    const onMove = (e: PointerEvent) => {
      const el = panel.current;
      if (!el) return;
      // Un menu ⋯ ou une infobulle de la liste se pose HORS du volet (portail
      // Radix), et lui aller dessus n'est pas le quitter : ce qu'on manipule
      // vient de la barre et la ramènerait aussitôt.
      const target = e.target as Element | null;
      if (target?.closest?.("[data-radix-popper-content-wrapper]")) {
        onOpen();
        return;
      }
      // La zone testée est celle du volet OUVERT, pas le rectangle qu'il occupe
      // à l'instant : pendant son entrée, un pointeur qui file
      // vers l'endroit où il arrive serait « dehors » et le renverrait aussitôt.
      // On la calcule sur la boîte de navigation du châssis (son `offsetParent`,
      // largeur nulle) — c'est aussi elle qui fait que tout est mesuré depuis le
      // bord du CONTENEUR, et non du moniteur, sur ultrawide.
      const box = (el.offsetParent ?? el).getBoundingClientRect();
      const inside =
        e.clientX >= box.left &&
        e.clientX <= box.left + SECONDARY_WIDTH &&
        e.clientY >= box.top &&
        e.clientY <= box.bottom;
      if (inside) onOpen();
      else onClose();
    };
    document.addEventListener("pointermove", onMove);
    // Quitter la FENÊTRE par le haut ou par la droite ne produit plus aucun
    // `pointermove` : sans ceci le volet resterait ouvert derrière un autre
    // onglet, pour se découvrir déplié au retour.
    document.documentElement.addEventListener("pointerleave", onClose);
    return () => {
      document.removeEventListener("pointermove", onMove);
      document.documentElement.removeEventListener("pointerleave", onClose);
    };
  }, [open, onOpen, onClose]);

  // Le focus clavier, pour la même raison, s'écoute en NATIF sur le volet :
  // `focusin`/`focusout` remontent le DOM, donc ils voient la liste téléportée
  // — ce que `onFocusCapture` de React ne ferait pas.
  useEffect(() => {
    const el = panel.current;
    if (!el) return;
    // Seul le focus VENU DU CLAVIER retient le volet : cliquer une ligne lui
    // donne aussi le focus, et c'est le moment précis où il doit se ranger.
    const focusIn = (e: FocusEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.matches?.(":focus-visible")) onFocusWithinChange(true);
    };
    const focusOut = (e: FocusEvent) => {
      if (!el.contains(e.relatedTarget as Node | null)) onFocusWithinChange(false);
    };
    el.addEventListener("focusin", focusIn);
    el.addEventListener("focusout", focusOut);
    return () => {
      el.removeEventListener("focusin", focusIn);
      el.removeEventListener("focusout", focusOut);
    };
  }, [onFocusWithinChange]);

  return (
    <>
      {/* La lisière. Elle ne fait rien d'autre qu'écouter le pointeur : le volet
          replié est hors champ, il n'y a donc plus rien à survoler pour le
          rappeler. Sous le volet en z-index, pour qu'il la recouvre une fois
          ouvert au lieu de lui reprendre le pointeur. Ici les gestionnaires
          React suffisent — elle est vide, aucun portail n'y atterrit. */}
      <div
        aria-hidden
        className="absolute inset-y-0 left-0 z-30"
        style={{ width: OVERLAY_HOTZONE }}
        onPointerEnter={onOpen}
        onPointerMove={onOpen}
      />
      <motion.div
        ref={panel}
        className="absolute inset-y-0 left-0 z-40 h-full overflow-hidden bg-sidebar transition-shadow duration-200 data-[open=true]:shadow-[8px_0_32px_-8px_rgba(0,0,0,0.45)]"
        data-open={open}
        style={{ width: SECONDARY_WIDTH }}
        // `initial` explicite et fermé : le mode zen ne s'active jamais au
        // rendu serveur, le volet part donc toujours de sa position rangée.
        initial={{ x: -SECONDARY_WIDTH }}
        animate={{ x: open ? 0 : -SECONDARY_WIDTH }}
        transition={reduce ? { duration: 0 } : OVERLAY_SLIDE}
      >
        <div ref={setSlot} className="h-full" style={{ width: SECONDARY_WIDTH }} />
      </motion.div>
    </>
  );
}

/**
 * La gouttière : le mode ordinaire. Vide, elle ne prend aucune place ; `reserve`
 * lui donne sa largeur avant que la page n'ait monté sa barre (premier
 * affichage), pour que le contenu ne parte pas pleine largeur puis ne se
 * rétracte.
 *
 * C'est elle qui porte la moitié du glissement entre les deux modes de la
 * PRIMAIRE : elle s'ouvre et se referme (0 ↔ 320) sur la MÊME courbe que la
 * largeur de celle-ci (`transitions.shell`), et le header, le fil d'Ariane et le
 * contenu suivent d'un bloc. Le volet intérieur garde sa largeur pendant tout le
 * trajet — c'est la gouttière qui le découvre ou le recouvre, il ne se comprime
 * jamais.
 *
 * Elle est peinte AUX COULEURS DE LA BARRE, et non laissée transparente : en
 * quittant une page à sidebar secondaire, la page se démonte d'un coup et la
 * gouttière se retrouve vide pendant les 320 ms de sa fermeture. Sans fond, on y
 * voyait le `bg-background` du châssis — une bande claire ouverte entre la barre
 * primaire et le header, tous deux en `bg-sidebar`. Avec, la colonne se referme
 * comme un volet, sans trou.
 */
function SecondarySidebarGutter({
  reserve,
  reduce,
}: {
  reserve: boolean;
  reduce: boolean;
}) {
  const { setSlot } = useSecondarySidebar();
  return (
    <motion.div
      className="relative h-full shrink-0 overflow-hidden bg-sidebar"
      // `initial` explicite : c'est cette valeur-là que framer écrit dans le
      // HTML du serveur, et c'est elle qui réserve la colonne au premier
      // affichage (cf. routeHasSecondaryNav).
      initial={{ width: reserve ? SECONDARY_WIDTH : 0 }}
      animate={{ width: reserve ? SECONDARY_WIDTH : 0 }}
      transition={reduce ? { duration: 0 } : transitions.shell}
    >
      {/* Le trait qui court sous le header et sous la ligne de titre de la
          barre, rejoué ici pour la même raison : vidée, la gouttière l'aurait
          interrompu sur toute sa largeur le temps de se refermer.
          Il passe DERRIÈRE le volet (`relative` sur celui-ci, qui le peint
          par-dessus), et surtout pas au-dessus : `--border` vaut 8 % de blanc en
          thème sombre, deux traits superposés en font un de 15 % — une ligne
          plus claire sur la largeur exacte de la barre, au milieu d'une ligne
          qui traverse tout l'écran. */}
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 h-[60px] border-b border-border"
      />
      <div
        ref={setSlot}
        className="relative h-full"
        style={{ width: SECONDARY_WIDTH }}
      />
    </motion.div>
  );
}
