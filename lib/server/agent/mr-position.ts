/**
 * Résolution de position dans un unified diff GitLab (MIN-69) — module PUR
 * (sans `server-only`, testable) utilisé par `mr.ts` pour poster un commentaire
 * de review : GitLab exige `new_line` seul pour une ligne ajoutée, `old_line`
 * seul pour une supprimée, et les DEUX pour une ligne de contexte — on marche
 * donc les hunks pour retrouver le pendant. Null si la ligne n'appartient pas
 * au diff (l'appelant en fait un 422, même contrat que GitHub).
 */
export function resolveDiffPosition(
  diff: string,
  line: number,
  side: "LEFT" | "RIGHT",
): { oldLine: number | null; newLine: number | null } | null {
  let oldN = 0;
  let newN = 0;
  let inHunk = false;
  const lines = diff.split("\n");
  // Le split laisse un "" final après le dernier \n — pas une ligne de contexte.
  if (lines[lines.length - 1] === "") lines.pop();
  for (const l of lines) {
    const m = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(l);
    if (m) {
      oldN = Number(m[1]);
      newN = Number(m[2]);
      inHunk = true;
      continue;
    }
    if (!inHunk) continue;
    if (l.startsWith("\\")) continue; // « \ No newline at end of file »
    if (l.startsWith("+")) {
      if (side === "RIGHT" && newN === line) return { oldLine: null, newLine: line };
      newN++;
    } else if (l.startsWith("-")) {
      if (side === "LEFT" && oldN === line) return { oldLine: line, newLine: null };
      oldN++;
    } else {
      // Ligne de contexte (préfixe espace — ou vide, certains diffs l'émettent).
      if (side === "RIGHT" && newN === line) return { oldLine: oldN, newLine: line };
      if (side === "LEFT" && oldN === line) return { oldLine: line, newLine: newN };
      oldN++;
      newN++;
    }
  }
  return null;
}
