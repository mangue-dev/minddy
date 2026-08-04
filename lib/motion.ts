import type { Transition } from "framer-motion";

/** Shared motion tuning, mirrored from AutoKap (lib/motion.ts). */
export const transitions = {
  spring: { type: "spring", stiffness: 400, damping: 30 } as Transition,
  gentle: { type: "spring", stiffness: 300, damping: 25 } as Transition,
  snappy: { type: "spring", stiffness: 500, damping: 35 } as Transition,
  fade: { duration: 0.15, ease: "easeOut" } as Transition,
  /**
   * Le glissement du CHÂSSIS : largeur de la sidebar primaire, gouttière de la
   * sidebar secondaire, et par ricochet tout ce qui est à leur droite — header,
   * fil d'Ariane, contenu. Les trois DOIVENT partager cette courbe, sinon leurs
   * bords se décalent entre eux pendant le trajet au lieu de glisser d'un bloc.
   *
   * Une durée plutôt qu'un ressort : un ressort dépasse sa cible, et une largeur
   * de mise en page qui dépasse fait tressauter toute la moitié droite de
   * l'écran. La courbe part vite et se pose doucement.
   */
  shell: { duration: 0.32, ease: [0.32, 0.72, 0, 1] } as Transition,
};
