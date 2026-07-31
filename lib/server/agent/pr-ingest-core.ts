/**
 * Rattachement d'une pull request à un ticket minddy (MIN-143) — pur, sans I/O
 * ni `server-only`, donc testable en node (même patron que `checks-core.ts`).
 *
 * Depuis que la page montre TOUTES les PR du dépôt et plus seulement celles de
 * Numo, le lien PR ↔ ticket ne peut plus venir du run : une PR humaine n'en a
 * pas. Il vient donc de ce que la PR DIT d'elle-même — et par CONVENTION, jamais
 * par devinette : `<CLÉ>-<n>` dans le nom de branche, dans le titre, ou dans une
 * ligne de fermeture (`Fixes MIN-42`) du corps. Rien d'autre. Une PR non
 * rattachée reste non rattachée : c'est un état normal, pas un échec.
 *
 * Les clés candidates sont celles des projets qui lient CE dépôt — c'est ce qui
 * empêche `ACME-42` de ramener le ticket 42 d'un projet qui n'a rien à voir.
 */

/** Mots-clés de fermeture reconnus dans le corps (ceux de GitHub/GitLab). */
const CLOSING_KEYWORDS =
  "close|closes|closed|closing|fix|fixes|fixed|fixing|resolve|resolves|resolved|resolving";

/** Échappe une clé de projet avant interpolation dans une regex. */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Motif d'une référence de ticket pour ces clés.
 *
 * Les deux gardes de bord font tout le travail anti-faux-positif :
 *  - `(?<![A-Za-z0-9])` — `ADMIN-42` ne contient pas une référence `MIN-42` ;
 *  - `(?![A-Za-z0-9])`  — `MIN-421` n'est pas `MIN-42`, et `MIN-42x` n'est rien.
 * Un `-` ou un `/` autour, en revanche, passent : c'est exactement la forme des
 * branches (`minddy/agent/min-42-quelque-chose`, `feature/MIN-42`).
 */
function referencePattern(projectKeys: readonly string[]): RegExp | null {
  const keys = [...new Set(projectKeys.map((k) => k.trim()).filter(Boolean))];
  if (keys.length === 0) return null;
  const alternation = keys.map(escapeRegExp).join("|");
  return new RegExp(`(?<![A-Za-z0-9])(${alternation})-(\\d+)(?![A-Za-z0-9])`, "gi");
}

/** Première référence trouvée dans `text`, normalisée `CLÉ-n` (clé en casse d'origine). */
function firstReference(
  text: string | null | undefined,
  pattern: RegExp,
  keyByLower: Map<string, string>,
): string | null {
  if (!text) return null;
  pattern.lastIndex = 0;
  const match = pattern.exec(text);
  if (!match) return null;
  const key = keyByLower.get(match[1].toLowerCase());
  if (!key) return null;
  // `007` est un numéro écrit bizarrement, pas un autre ticket : on le normalise.
  const number = Number.parseInt(match[2], 10);
  if (!Number.isSafeInteger(number) || number < 1) return null;
  return `${key}-${number}`;
}

/** Lignes du corps qui FERMENT un ticket (`Fixes MIN-42`, `Closes: MIN-42`). */
function closingLines(body: string | null | undefined): string {
  if (!body) return "";
  const keyword = new RegExp(`^\\s*(?:${CLOSING_KEYWORDS})\\b`, "i");
  return body
    .split(/\r?\n/)
    .filter((line) => keyword.test(line))
    .join("\n");
}

export interface IssueRefInput {
  /** Clés des projets qui lient ce dépôt — le périmètre des références valides. */
  projectKeys: readonly string[];
  branch?: string | null;
  title?: string | null;
  body?: string | null;
}

/**
 * Identifiant du ticket que cette PR déclare porter (`"MIN-42"`), ou null.
 *
 * L'ordre est celui de l'intention décroissante : la BRANCHE d'abord (on la
 * nomme exprès, c'est la convention que minddy lui-même applique), puis le
 * TITRE, puis les seules lignes de fermeture du corps. Le reste du corps est
 * ignoré volontairement — « comme dans MIN-12 » est une mention, pas un
 * rattachement.
 */
export function issueRefFromPr(input: IssueRefInput): string | null {
  const pattern = referencePattern(input.projectKeys);
  if (!pattern) return null;
  const keyByLower = new Map(
    input.projectKeys.filter(Boolean).map((k) => [k.trim().toLowerCase(), k.trim()]),
  );
  return (
    firstReference(input.branch, pattern, keyByLower) ??
    firstReference(input.title, pattern, keyByLower) ??
    firstReference(closingLines(input.body), pattern, keyByLower)
  );
}

/** `"MIN-42"` → `{ key: "MIN", number: 42 }`. Null si la forme n'y est pas. */
export function parseIssueRef(ref: string): { key: string; number: number } | null {
  const at = ref.lastIndexOf("-");
  if (at <= 0) return null;
  const number = Number.parseInt(ref.slice(at + 1), 10);
  if (!Number.isSafeInteger(number) || number < 1) return null;
  return { key: ref.slice(0, at), number };
}
