import {
  getChangeKey,
  findChangeByNewLineNumber,
  findChangeByOldLineNumber,
  type ChangeData,
  type HunkData,
} from "react-diff-view";
import type { PullRequestReviewComment } from "@/lib/agent-api";
import type { ReviewThread } from "@/lib/pr-review-threads";

/**
 * Où (ou si) un fil de review s'accroche au diff rendu. Séparé du regroupement
 * (`pr-review-threads`, pur) parce que tout ici dépend de `react-diff-view` — et
 * séparé du rendu parce que les deux règles ci-dessous sont subtiles et se testent
 * sans React.
 */

/** Un fil de review côté client — celui que manipulent la vue diff et ses widgets. */
export type PrReviewThread = ReviewThread<PullRequestReviewComment>;

/**
 * Clé du changement (`getChangeKey`) sous lequel afficher un fil, ou null s'il ne
 * s'ancre nulle part dans les hunks rendus.
 *
 * ⚠️ Le test n'est PAS `line !== null`. Vérifié contre l'API GitHub : un
 * commentaire posé sur une ligne de CONTEXTE garde son `line` même une fois que le
 * diff s'est déplacé ailleurs dans le fichier — se fier à `line` afficherait donc
 * un fil qui ne correspond à aucune ligne rendue, et il disparaîtrait sans bruit.
 * Seule la résolution effective dans les hunks fait foi. Corollaire heureux : un
 * fil dont la ligne est masquée réapparaît à sa place dès qu'on déplie le contexte
 * autour (les hunks passés ici sont ceux RENDUS, expansions comprises).
 */
export function resolveThreadChangeKey(
  hunks: HunkData[],
  thread: PrReviewThread,
): string | null {
  const { line, side } = thread.root;
  if (line == null) return null;
  // `side` dit dans quel fichier `line` se compte : LEFT = l'ancien, RIGHT = le nouveau.
  const change: ChangeData | undefined =
    side === "LEFT"
      ? findChangeByOldLineNumber(hunks, line)
      : findChangeByNewLineNumber(hunks, line);
  return change ? getChangeKey(change) : null;
}

/**
 * Lignes commentables d'un fichier : celles des hunks D'ORIGINE de GitHub.
 *
 * GitHub refuse (**422** `line: could not be resolved`) tout commentaire sur une
 * ligne hors diff — vérifié contre l'API. Or la vue déplie du contexte : ces
 * lignes-là sont affichées mais PAS dans le diff. On les distingue par leur clé de
 * changement, calculée sur les hunks d'origine (avant expansion) : une ligne
 * dépliée porte une clé absente de cet ensemble. Sans ce filtre, on offrirait un
 * bouton qui échoue.
 */
export function commentableChangeKeys(hunks: HunkData[]): Set<string> {
  const keys = new Set<string>();
  for (const hunk of hunks) {
    for (const change of hunk.changes) keys.add(getChangeKey(change));
  }
  return keys;
}

/**
 * Ancre GitHub (`side` + `line`) d'une ligne de la gouttière, ou null si ce côté
 * n'en porte pas — la gouttière est rendue pour les deux côtés (`old`/`new`), y
 * compris là où la ligne n'existe pas (le vis-à-vis d'un ajout, par exemple).
 *
 * Une ligne de contexte existe des deux côtés : on l'ancre à DROITE, comme
 * GitHub — commenter du contexte parle du code tel qu'il est après la PR.
 */
export function gutterAnchor(
  change: ChangeData,
  gutterSide: "old" | "new",
): { side: "LEFT" | "RIGHT"; line: number } | null {
  if (change.type === "normal") {
    return gutterSide === "new" ? { side: "RIGHT", line: change.newLineNumber } : null;
  }
  if (change.type === "insert") {
    return gutterSide === "new" ? { side: "RIGHT", line: change.lineNumber } : null;
  }
  return gutterSide === "old" ? { side: "LEFT", line: change.lineNumber } : null;
}
