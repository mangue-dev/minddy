/**
 * Faire disparaître la fenêtre, quand elle est en PLEIN ÉCRAN (MIN-353).
 *
 * L'app n'a qu'une fenêtre, et elle ne meurt pas : ⌘W et le feu rouge la
 * CACHENT, pour que l'app reste vivante et que les notifications continuent
 * d'arriver (§3). Cacher une fenêtre fenêtrée ne pose aucune question.
 *
 * **En plein écran, si.** macOS a donné à cette fenêtre un *Space* à elle — un
 * bureau entier, avec son animation d'entrée et sa place dans Mission Control.
 * `hide()` retire la fenêtre de ce Space **sans le refermer** : il reste un
 * bureau vide, noir, au premier plan, et il n'y a plus rien dedans pour en
 * sortir. Ce qu'on voit alors, c'est « l'app a fait un écran noir et ne s'est
 * pas fermée » — les deux moitiés du symptôme, et elles disent la même chose.
 *
 * D'où l'ordre en DEUX temps : on sort du plein écran, ce qui referme le Space
 * et rend l'écran à ce qu'il y avait avant, et **c'est seulement une fois sorti**
 * qu'on cache. L'inverse, ou les deux dans la même passe, ne marche pas :
 * `setFullScreen(false)` est asynchrone (AppKit anime la transition), et une
 * fenêtre déjà cachée n'anime rien du tout — elle reste dans son Space.
 *
 * Module PUR : la règle se teste ici, `desktop/src/hide-window.ts` ne fait que
 * la câbler sur `leave-full-screen`.
 */

/** L'état de la fenêtre, réduit à ce qui décide. */
export interface HideWindowState {
  /** `process.platform`. */
  platform: string;
  /** `window.isFullScreen()`. */
  fullScreen: boolean;
}

/**
 * Le premier geste à poser.
 *
 * - `hide` — directement, c'est le cas ordinaire.
 * - `leave-full-screen` — sortir d'abord, cacher à l'arrivée.
 *
 * **macOS seulement.** Ailleurs le plein écran n'est pas un Space mais une
 * fenêtre sans décorations, que le gestionnaire de fenêtres cache comme les
 * autres : y ajouter un aller-retour ne réparerait rien et ferait clignoter
 * l'écran.
 */
export function hideWindowStep(state: HideWindowState): "hide" | "leave-full-screen" {
  return state.platform === "darwin" && state.fullScreen
    ? "leave-full-screen"
    : "hide";
}
