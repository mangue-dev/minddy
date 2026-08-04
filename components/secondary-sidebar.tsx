"use client";

import {
  useEffect,
  useLayoutEffect,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { motion, useReducedMotion } from "framer-motion";
import { cn, useIsMobileLayout } from "mangue-ui";
import { useSecondarySidebar } from "@/lib/secondary-sidebar-context";
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
  count,
  actions,
  hiddenOnMobile,
  children,
}: {
  /**
   * Le titre de la colonne, aligné sur le header de l'application. Omis par les
   * SQUELETTES de route, qui occupent la place de la barre le temps que l'écran
   * arrive : sans eux la primaire se déplierait et la gouttière se refermerait
   * à chaque navigation, pour tout rouvrir une demi-seconde plus tard.
   */
  title?: string;
  /** Compteur discret posé après le titre. */
  count?: number;
  /** Actions de la ligne de titre (filtre, bouton de création…), poussées à droite. */
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
      <div className="flex h-[60px] shrink-0 items-center gap-2 border-b border-border px-4">
        {title ? (
          <h1 className="min-w-0 truncate font-display text-lg font-semibold tracking-tight">
            {title}
          </h1>
        ) : null}
        {count != null ? (
          <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
            {count}
          </span>
        ) : null}
        {actions ? (
          <div className="ml-auto flex min-w-0 shrink items-center">{actions}</div>
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
 * Le point d'accueil, posé par le châssis entre la sidebar primaire et la
 * colonne header + contenu. Vide, il ne prend aucune place ; `reserve` lui donne
 * sa largeur avant que la page n'ait monté sa barre (premier affichage), pour
 * que le contenu ne parte pas pleine largeur puis ne se rétracte.
 *
 * C'est aussi lui qui porte la moitié du glissement entre les deux modes : sa
 * gouttière s'ouvre et se referme (0 ↔ 320) sur la MÊME courbe que la largeur de
 * la sidebar primaire (`transitions.shell`), et le header, le fil d'Ariane et le
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
export function SecondarySidebarSlot({ reserve }: { reserve: boolean }) {
  const { setSlot } = useSecondarySidebar();
  const reduce = useReducedMotion();
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
