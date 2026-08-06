/**
 * Le `diff_hunk` d'un commentaire de review, prêt à se rendre — l'extrait de code
 * SUR LEQUEL le commentaire a été posé.
 *
 * Les deux forges livrent cet extrait en texte unifié brut, en-tête `@@` compris
 * et sans numéros de ligne. Le rendre tel quel donne un pavé monospace où rien ne
 * dit quelle ligne est commentée, ni laquelle est ajoutée. Or c'est tout
 * l'intérêt : un commentaire de ligne sans son code est une phrase sans sujet.
 *
 * Deux lectures, et c'est `hunkPatch` qui sert le rendu : il rend le fragment
 * analysable par la lib de diff, donc COLORÉ et en mode diff comme l'onglet
 * Fichiers. `hunkPreview` reste la lecture nue du fragment, pour qui a besoin des
 * lignes plutôt que d'un patch.
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

/** Le hunk analysé : ses lignes numérotées, et le point de départ des deux côtés. */
interface ParsedHunk {
  lines: HunkPreviewLine[];
  oldStart: number;
  newStart: number;
}

function parseHunk(diffHunk: string): ParsedHunk | null {
  const raw = (diffHunk ?? "").split("\n");
  const start = raw.findIndex((l) => HEADER.test(l));
  if (start < 0) return null;
  const match = raw[start].match(HEADER)!;
  const oldStart = Number(match[1]);
  const newStart = Number(match[2]);
  let oldLine = oldStart;
  let newLine = newStart;

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
  return { lines, oldStart, newStart };
}

/**
 * Les dernières lignes du hunk, numérotées. La FIN et non le début : les deux
 * forges terminent l'extrait sur la ligne commentée — c'est elle qu'on veut voir,
 * avec juste assez de contexte au-dessus pour la situer.
 *
 * Vide quand il n'y a pas de hunk (GitLab n'en sert aucun) : l'appelant retombe
 * alors sur l'ancre `fichier:ligne` seule, ce qu'il faisait déjà.
 */
export function hunkPreview(diffHunk: string, maxLines = 4): HunkPreviewLine[] {
  const parsed = parseHunk(diffHunk);
  if (!parsed) return [];
  return maxLines > 0 ? parsed.lines.slice(-maxLines) : parsed.lines;
}

/**
 * Le même extrait, mais réécrit en DIFF UNIFIÉ complet — la forme que
 * `parsePatchFiles` sait analyser, donc celle qui ouvre à cet extrait le rendu de
 * l'onglet Fichiers : coloration Shiki, marquage mot-à-mot, gouttière.
 *
 * C'est tout l'objet de la fonction : le `diff_hunk` des forges est un FRAGMENT
 * (un `@@` et ses lignes, sans nom de fichier), et la lib de diff ne prend que des
 * fichiers. On lui rend donc le fichier autour — le vrai chemin, pour que
 * l'extension décide de la grammaire, exactement comme `toUnifiedDiff` le fait
 * pour un fichier de PR.
 *
 * L'en-tête est RECALCULÉ sur la tranche gardée, pas recopié : les numéros de
 * ligne affichés viennent de là, et ceux du hunk d'origine parleraient des lignes
 * qu'on vient d'écarter.
 *
 * Chaîne vide quand il n'y a rien à rendre (pas de hunk, ou un hunk vide) :
 * l'appelant n'affiche alors pas d'extrait.
 */
export function hunkPatch(path: string, diffHunk: string, maxLines = 4): string {
  const parsed = parseHunk(diffHunk);
  if (!parsed) return "";
  const kept = maxLines > 0 ? parsed.lines.slice(-maxLines) : parsed.lines;
  if (kept.length === 0) return "";

  // Le curseur au DÉBUT de la tranche : chaque ligne écartée a fait avancer le
  // côté auquel elle appartient, et seulement celui-là.
  let oldStart = parsed.oldStart;
  let newStart = parsed.newStart;
  for (const line of parsed.lines.slice(0, parsed.lines.length - kept.length)) {
    if (line.type !== "add") oldStart++;
    if (line.type !== "del") newStart++;
  }
  const oldCount = kept.filter((l) => l.type !== "add").length;
  const newCount = kept.filter((l) => l.type !== "del").length;

  const body = kept
    .map((l) => (l.type === "add" ? "+" : l.type === "del" ? "-" : " ") + l.content)
    .join("\n");
  // Convention de git pour un côté vide : le numéro est celui de la ligne APRÈS
  // laquelle ça s'insère, donc un cran en dessous du curseur.
  const oldAt = oldCount === 0 ? Math.max(0, oldStart - 1) : oldStart;
  const newAt = newCount === 0 ? Math.max(0, newStart - 1) : newStart;

  return [
    `diff --git a/${path} b/${path}`,
    `--- a/${path}`,
    `+++ b/${path}`,
    `@@ -${oldAt},${oldCount} +${newAt},${newCount} @@`,
    body,
    "",
  ].join("\n");
}
