/**
 * Le `diff_hunk` d'un commentaire de review, prêt à se rendre — l'extrait de code
 * SUR LEQUEL le commentaire a été posé.
 *
 * Les deux forges livrent cet extrait en texte unifié brut, en-tête `@@` compris
 * et sans numéros de ligne. Le rendre tel quel (ce que faisait le repli des fils
 * périmés) donne un pavé monospace où rien ne dit quelle ligne est commentée, ni
 * laquelle est ajoutée. Or c'est tout l'intérêt : un commentaire de ligne sans son
 * code est une phrase sans sujet.
 *
 * Pur et sans dépendance, comme `pr-review-threads` : la même règle sert le fil de
 * conversation et tout autre rendu qui aurait besoin du contexte.
 */

export interface HunkPreviewLine {
  /** Ajoutée, retirée, ou contexte inchangé — ce qui décide de la couleur. */
  type: "add" | "del" | "context";
  /** La ligne SANS son marqueur `+`/`-`/espace. */
  content: string;
  /** Numéro côté base, `null` sur une ligne ajoutée. */
  oldLine: number | null;
  /** Numéro côté tête, `null` sur une ligne retirée. */
  newLine: number | null;
}

/** `@@ -12,7 +12,9 @@` → les deux points de départ. Le reste de la ligne (le nom
    de la fonction englobante, que GitHub y colle) ne sert pas au calcul. */
const HEADER = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

/**
 * Les dernières lignes du hunk, numérotées. La FIN et non le début : les deux
 * forges terminent l'extrait sur la ligne commentée — c'est elle qu'on veut voir,
 * avec juste assez de contexte au-dessus pour la situer.
 *
 * Vide quand il n'y a pas de hunk (GitLab n'en sert aucun) : l'appelant retombe
 * alors sur l'ancre `fichier:ligne` seule, ce qu'il faisait déjà.
 */
export function hunkPreview(diffHunk: string, maxLines = 4): HunkPreviewLine[] {
  const raw = (diffHunk ?? "").split("\n");
  const start = raw.findIndex((l) => HEADER.test(l));
  if (start < 0) return [];
  const match = raw[start].match(HEADER)!;
  let oldLine = Number(match[1]);
  let newLine = Number(match[2]);

  const lines: HunkPreviewLine[] = [];
  for (const line of raw.slice(start + 1)) {
    // `\ No newline at end of file` : une annotation de git, pas une ligne de code.
    if (line.startsWith("\\")) continue;
    if (line.startsWith("+")) {
      lines.push({ type: "add", content: line.slice(1), oldLine: null, newLine: newLine++ });
    } else if (line.startsWith("-")) {
      lines.push({ type: "del", content: line.slice(1), oldLine: oldLine++, newLine: null });
    } else {
      // Ligne de contexte. Le préfixe est une espace — sauf sur la dernière ligne
      // d'un hunk, que certaines API rendent vide : `slice(1)` la laisse vide,
      // ce qui est exactement son contenu.
      lines.push({
        type: "context",
        content: line.startsWith(" ") ? line.slice(1) : line,
        oldLine: oldLine++,
        newLine: newLine++,
      });
    }
  }
  return maxLines > 0 ? lines.slice(-maxLines) : lines;
}
