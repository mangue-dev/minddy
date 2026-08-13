/**
 * Pourquoi une infobulle se rouvre toute seule quand on revient sur l'onglet.
 *
 * Radix ouvre l'infobulle sur le `focus` de son déclencheur, sans condition
 * (`react-tooltip/dist/index.mjs` : `onFocus: … if (!isPointerDownRef.current)
 * context.onOpen()`). Or le navigateur REND le focus à l'élément qui l'avait
 * quand l'onglet — ou la fenêtre — redevient actif : Chrome émet alors un
 * `focus` que rien ne distingue d'un `Tab` de l'utilisateur. L'infobulle
 * s'ouvre donc sur un bouton que personne n'a survolé, plusieurs minutes après
 * la dernière interaction. C'est documenté chez Radix (primitives#705, fermé en
 * « won't fix » : le focus vient du navigateur, pas d'eux) — la parade est du
 * côté de l'appelant, ici.
 *
 * Deux règles, et c'est tout :
 *
 * 1. **La restitution de focus ne compte pas.** Un `focus` qui arrive juste
 *    après que la fenêtre a repris la main n'est pas un geste : c'est le
 *    navigateur qui range. On le laisse passer (l'élément DOIT reprendre le
 *    focus, sinon le clavier repart de zéro) mais il n'ouvre rien.
 * 2. **Un focus qui ne se voit pas n'ouvre rien.** `:focus-visible` est
 *    exactement la question « le navigateur estime-t-il que l'utilisateur
 *    navigue au clavier ? ». Un focus posé par un clic, ou par du code qui
 *    rend la main à un déclencheur en fermant un popover, n'est pas visible —
 *    et une infobulle qui s'ouvre là ne répond à aucune demande.
 *
 * Ce que ça NE change pas : le survol, et la tabulation au clavier. Un vrai
 * `Tab` est précédé d'un `keydown`, qui referme le drapeau (voir le suiveur
 * ci-dessous) et se pose en `:focus-visible`.
 */

/** Le vrai geste de l'utilisateur, celui qui dit « je suis revenu ». */
export type TooltipFocusSignal = {
  /** La fenêtre vient de reprendre la main, sans geste depuis. */
  refocusPending: boolean;
  /** L'élément porte `:focus-visible` (navigation clavier). */
  focusVisible: boolean;
};

/** La décision, seule, sans DOM : faut-il ouvrir l'infobulle sur ce `focus` ? */
export function shouldOpenTooltipOnFocus({
  refocusPending,
  focusVisible,
}: TooltipFocusSignal): boolean {
  return focusVisible && !refocusPending;
}

/**
 * Le suiveur de retour de fenêtre.
 *
 * `markRefocus()` sur le `focus` de la fenêtre (ou un `visibilitychange` qui
 * repasse visible), `markGesture()` sur le premier `keydown` / `pointerdown` :
 * un geste prouve que l'utilisateur pilote, et rend au focus suivant son sens
 * habituel. `consumeRefocus()` lit ET referme le drapeau — le rangement du
 * navigateur ne concerne qu'un seul `focus`.
 */
export type WindowRefocusTracker = {
  markRefocus: () => void;
  markGesture: () => void;
  consumeRefocus: () => boolean;
  readonly refocusPending: boolean;
};

export function createWindowRefocusTracker(): WindowRefocusTracker {
  let pending = false;
  return {
    markRefocus: () => {
      pending = true;
    },
    markGesture: () => {
      pending = false;
    },
    consumeRefocus: () => {
      const was = pending;
      pending = false;
      return was;
    },
    get refocusPending() {
      return pending;
    },
  };
}
