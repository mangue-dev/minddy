import { headTail } from "./prune";

/**
 * Auto-relecture EXÉCUTÉE de fin de tour.
 *
 * Le prompt système demande depuis toujours, à l'étape 4 de « How to work » :
 * « Run `git diff` and read your change end to end before replying ». C'était une
 * politesse — rien ne l'exécutait, rien ne vérifiait qu'elle avait eu lieu. Or le
 * dépôt applique partout ailleurs la règle inverse : les interdits git sont
 * ANNONCÉS comme exécutés parce qu'ils le sont (command-guard.ts, MIN-108), et
 * le type-check de fin de tour PARLE au modèle au lieu d'espérer qu'il le lance
 * (diagnostics.ts, MIN-110). Ce module applique la même doctrine à la relecture :
 * le diff du tour est mis DANS le contexte du modèle avant qu'il ne réponde.
 *
 * Ce que ça attrape, et que rien d'autre n'attrapait : l'erreur de JOINTURE —
 * deux fichiers écrits dans le même geste, chacun correct isolément, dont le
 * contrat entre eux est faux. Le cas fondateur : `"deleteViewTitle": "Delete
 * “{name}”?"` dans le catalogue, `t("deleteViewTitle")` dans le composant. Ni
 * le type-check ni les tests du dépôt ne voyaient la faute (cf.
 * lib/i18n-contract.test.ts, écrit pour celle-là) — et une relecture fichier par
 * fichier ne la voit pas non plus, parce que chaque moitié passe. Il faut avoir
 * les deux versants sous les yeux EN MÊME TEMPS, ce que le diff du tour donne.
 *
 * Le diff est présenté comme la sortie d'un `git diff` que le harness a lancé À
 * SA PLACE — l'agent n'a donc aucune raison de le relancer, et le round coûte
 * une injection plutôt qu'un aller-retour de tool.
 */

/** Cap du diff injecté. Au-delà, le modèle ne relit plus, il subit — même
 *  raisonnement que `TYPE_ERRORS_MAX_CHARS`, calibré plus haut parce qu'un diff
 *  se lit en entier ou ne se lit pas. Élision par le MILIEU (`headTail`) : le
 *  début et la fin d'un diff portent les fichiers, pas le remplissage. */
export const SELF_REVIEW_DIFF_MAX_CHARS = 12_000;

/** Budget mural minimum restant sur le chunk pour injecter une relecture. Plus
 *  bas que le type-check : ici on ne lance rien de coûteux, juste deux commandes
 *  git — mais il faut laisser au modèle de quoi lire et corriger. */
export const SELF_REVIEW_MIN_BUDGET_MS = 45_000;

/** Fichiers non suivis listés par nom (au-delà, on dit combien il en reste). */
const UNTRACKED_MAX = 20;

const HEADER = `Before you reply, here is what this turn actually changed. The harness ran \`git diff\` for you — do not run it again.`;

const INSTRUCTIONS = `Read it end to end, as a reviewer would, then either fix what you find or reply.

Check especially what is only visible ACROSS files, because each file alone looks right:
- a value produced in one file and consumed in another (i18n placeholders, props, payload fields, env vars, DB columns) — do the two sides agree?
- something added in one place that its counterpart still ignores (a new case, a new state, a new option);
- anything you changed halfway and did not finish.
Then the usual: no stray debug or scratch file, no leftover commented-out code, nothing unrelated to what was asked.

If it is all correct, just reply — do not restate the diff.`;

/** Un fichier non suivi, tel que `git status --porcelain` le rend. */
export function parseUntracked(porcelain: string): string[] {
  return porcelain
    .split("\n")
    .filter((line) => line.startsWith("?? "))
    .map((line) => line.slice(3).trim())
    .filter(Boolean);
}

/**
 * Le bloc d'auto-relecture, ou `null` s'il n'y a rien à relire.
 *
 * PUR : la sandbox est lue par l'appelant (execute.ts), pour que la mise en
 * forme, les caps et la formulation restent testables sans microVM — même
 * découpage que `formatTypeErrors`.
 */
export function formatSelfReview(input: {
  /** Sortie de `git diff <baseline>` : les fichiers SUIVIS modifiés ce tour. */
  diff: string;
  /** Sortie de `git status --porcelain` : sert à lister les fichiers ajoutés. */
  porcelain?: string;
}): string | null {
  const diff = input.diff.trim();
  const untracked = parseUntracked(input.porcelain ?? "");

  // Rien de suivi modifié ET rien de neuf : le tour n'a pas touché au dépôt.
  if (!diff && untracked.length === 0) return null;

  const shown = untracked.slice(0, UNTRACKED_MAX);
  const hidden = untracked.length - shown.length;
  const untrackedBlock =
    untracked.length > 0
      ? `\n\nNew files this turn (untracked, so absent from the diff above):\n${shown
          .map((path) => `- ${path}`)
          .join("\n")}${hidden > 0 ? `\n… and ${hidden} more.` : ""}`
      : "";

  const diffBlock = diff
    ? `\n\n\`\`\`diff\n${headTail(diff, SELF_REVIEW_DIFF_MAX_CHARS)}\n\`\`\``
    : "\n\n(No tracked file was modified.)";

  return `${HEADER}${diffBlock}${untrackedBlock}\n\n${INSTRUCTIONS}`;
}
