import type { Hunk, SelectedLineRange } from "@pierre/diffs";
import type { PullRequestReviewComment } from "@/lib/agent-api";
import type { ReviewThread } from "@/lib/pr-review-threads";

/**
 * Où une remarque s'accroche au diff : la traduction entre le vocabulaire de la
 * forge (`side: "LEFT" | "RIGHT"`, numéro de ligne) et celui de `@pierre/diffs`
 * (`side: "deletions" | "additions"`), plus la règle du 422.
 *
 * Séparé du regroupement (`pr-review-threads`, pur et partagé avec le serveur)
 * et du rendu, comme l'était `pr-review-diff` avant lui : les deux règles
 * ci-dessous sont subtiles, dictées par le comportement RÉEL de l'API GitHub,
 * et elles se testent sans React.
 */

/** Un fil de review côté client — celui que manipulent la vue diff et ses annotations. */
export type PrReviewThread = ReviewThread<PullRequestReviewComment>;

/** Côté d'une ligne chez Pierre. GitHub nomme les deux mêmes côtés LEFT / RIGHT. */
export type DiffSide = "deletions" | "additions";

/** Ancre d'une ligne, dans le vocabulaire de la vue. */
export interface LineAnchor {
  side: DiffSide;
  line: number;
}

/**
 * Ancre d'un commentaire à envoyer. `startLine` n'est posé que pour une
 * remarque multi-lignes : GitHub attend alors `line` = DERNIÈRE ligne de la
 * plage et `start_line` = la première.
 */
export interface CommentAnchor extends LineAnchor {
  startLine?: number;
  startSide?: DiffSide;
}

export function toGithubSide(side: DiffSide): "LEFT" | "RIGHT" {
  return side === "deletions" ? "LEFT" : "RIGHT";
}

export function toDiffSide(side: "LEFT" | "RIGHT"): DiffSide {
  return side === "LEFT" ? "deletions" : "additions";
}

/**
 * Identité d'une ancre dans les tables du composant (brouillons, composers
 * ouverts). Même forme que le nom du `<slot>` que la lib crée pour une
 * annotation, ce qui n'est pas un hasard : c'est la même paire (côté, ligne).
 */
export function anchorKey(anchor: LineAnchor): string {
  return `${anchor.side}:${anchor.line}`;
}

/**
 * Ligne d'ancrage d'un fil, ou `null` s'il n'en a plus.
 *
 * ⚠️ On rend l'ancre DÉCLARÉE, sans vérifier qu'elle tombe dans le diff : c'est
 * la lib qui tranche, en ne créant le `<slot>` correspondant que si la ligne est
 * effectivement rendue. Un fil dont la ligne est masquée réapparaît donc à sa
 * place dès qu'on déplie le contexte autour, sans qu'on ait à suivre l'état de
 * dépliage — et un fil dont la ligne n'existe plus dans aucun hunk se replie
 * dans les « périmés », comme avant (cf. `placedAnchorKeys` dans `pr-diff`).
 *
 * Le test n'est PAS `line !== null` seul : vérifié contre l'API GitHub, un
 * commentaire posé sur une ligne de CONTEXTE garde son `line` même une fois que
 * le diff s'est déplacé ailleurs dans le fichier. C'est bien pour ça que la
 * décision « ancré ou périmé » ne se prend pas ici.
 */
export function threadAnchor(thread: PrReviewThread): LineAnchor | null {
  const { line, side } = thread.root;
  if (line == null) return null;
  return { side: toDiffSide(side), line };
}

/**
 * Une ligne appartient-elle aux hunks du patch — donc au diff que la forge
 * connaît ?
 *
 * GitHub refuse (**422** `line: could not be resolved`) tout commentaire sur une
 * ligne hors diff, et la vue en affiche justement : le dépliage de contexte
 * ramène des lignes VRAIES mais absentes du patch. Les hunks passés ici sont
 * ceux du patch d'origine — la lib garde son état de dépliage à part et ne les
 * touche pas, ce qui fait de ce test la frontière exacte.
 */
export function isLineInDiff(hunks: Hunk[], side: DiffSide, line: number): boolean {
  return hunks.some((hunk) => {
    const start = side === "deletions" ? hunk.deletionStart : hunk.additionStart;
    const count = side === "deletions" ? hunk.deletionCount : hunk.additionCount;
    return count > 0 && line >= start && line < start + count;
  });
}

/**
 * Nature de la ligne dans le patch : ajoutée, supprimée, ou inchangée
 * (contexte). `null` si elle n'y est pas du tout.
 *
 * Sert l'en-tête d'une annotation, et il n'est pas décoratif : en vue unifiée,
 * une ligne MODIFIÉE produit deux lignes portant le même numéro — la supprimée
 * puis l'ajoutée — donc deux annotations voisines que seul ce mot départage.
 */
export function lineKind(
  hunks: Hunk[],
  side: DiffSide,
  line: number,
): "added" | "removed" | "context" | null {
  for (const hunk of hunks) {
    const start = side === "deletions" ? hunk.deletionStart : hunk.additionStart;
    const count = side === "deletions" ? hunk.deletionCount : hunk.additionCount;
    if (count === 0 || line < start || line >= start + count) continue;
    let current = start;
    for (const content of hunk.hunkContent) {
      if (content.type === "context") {
        if (line < current + content.lines) return "context";
        current += content.lines;
        continue;
      }
      const changed = side === "deletions" ? content.deletions : content.additions;
      if (line < current + changed) return side === "deletions" ? "removed" : "added";
      current += changed;
    }
    return null;
  }
  return null;
}

/**
 * Ancre à envoyer pour une sélection de gouttière, ou `null` si elle sort du
 * diff — auquel cas on n'ouvre pas de composer plutôt que d'offrir un envoi
 * voué au 422.
 *
 * La sélection arrive dans l'ordre du GESTE : glisser vers le haut donne
 * `start > end`. GitHub, lui, veut la plage dans l'ordre du FICHIER.
 *
 * Une plage qui change de côté en route (de la colonne des suppressions à celle
 * des ajouts, en côte-à-côte) ne décrit rien que la forge sache ancrer : on la
 * ramène alors à sa ligne d'arrivée. `multiLine` fait de même partout où les
 * plages ne sont pas supportées (GitLab).
 */
export function commentAnchor(
  hunks: Hunk[],
  range: SelectedLineRange,
  { multiLine }: { multiLine: boolean },
): CommentAnchor | null {
  const endSide: DiffSide = range.endSide ?? range.side ?? "additions";
  const startSide: DiffSide = range.side ?? endSide;

  const single = (): CommentAnchor | null =>
    isLineInDiff(hunks, endSide, range.end) ? { side: endSide, line: range.end } : null;

  if (!multiLine || startSide !== endSide || range.start === range.end) return single();

  const line = Math.max(range.start, range.end);
  const startLine = Math.min(range.start, range.end);
  // Les deux BOUTS suffisent : une plage dont les extrémités sont dans le diff
  // peut enjamber un écart masqué, et GitHub l'accepte — c'est le même
  // commentaire, sur la même paire de lignes.
  if (!isLineInDiff(hunks, endSide, line) || !isLineInDiff(hunks, startSide, startLine)) {
    return single();
  }
  return { side: endSide, line, startLine, startSide };
}
