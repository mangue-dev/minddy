/**
 * Construction des pathspecs git pour les tools `grep`/`glob` de l'agent (MIN-46).
 * Logique PURE (aucun shell), extraite de sandbox.ts pour être testable.
 *
 * PIÈGE corrigé : git traite plusieurs pathspecs comme une UNION (OR), pas une
 * intersection. Passer `-- 'path' ':(glob)pattern'` élargit donc la recherche
 * (tout ce qui est sous `path`, PLUS tout ce qui matche `pattern` dans le dépôt)
 * au lieu de la restreindre. Quand `path` ET `glob` sont fournis, on fusionne en
 * UN SEUL pathspec `:(glob)<path>/<glob>` → vraie intersection « glob dans path ».
 */

/** Combine un sous-arbre et un glob en un chemin unique (glob dans le sous-arbre). */
function joinWithin(path: string, glob: string): string {
  const base = path.replace(/^\/+|\/+$/g, "");
  return base ? `${base}/${glob}` : glob;
}

/**
 * Rend un glob récursif s'il ne contient PAS de `/` : convention ripgrep/Claude
 * Code où `*.ts` matche à toute profondeur. En pathspec `:(glob)` git, `*` ne
 * traverse pas `/`, donc un `*.ts` nu ne matcherait que la racine — surprenant
 * pour le modèle. On préfixe alors par un segment doublestar récursif.
 */
function recursive(glob: string): string {
  return glob.includes("/") ? glob : `**/${glob}`;
}

/**
 * Pathspecs (NON quotés) pour `git grep`. Intersecte `path` et `glob` quand les
 * deux sont fournis. Renvoie un tableau (0 ou 1 élément) à quoter par l'appelant.
 */
export function grepPathspecs(path?: string | null, glob?: string | null): string[] {
  const p = path?.trim();
  const g = glob?.trim();
  if (p && g) return [`:(glob)${joinWithin(p, recursive(g))}`];
  if (g) return [`:(glob)${recursive(g)}`];
  if (p) return [p];
  return [];
}

/** Pathspec (NON quoté) unique pour `git ls-files` (tool `glob`). */
export function globPathspec(pattern: string, path?: string | null): string {
  const p = path?.trim();
  return p ? `:(glob)${joinWithin(p, recursive(pattern))}` : `:(glob)${recursive(pattern)}`;
}
