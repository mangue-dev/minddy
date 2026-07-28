/**
 * Construction des pathspecs git pour les tools `grep`/`glob` de l'agent (MIN-46).
 * Logique PURE (aucun shell), extraite de sandbox.ts pour être testable.
 *
 * PIÈGE corrigé : git traite plusieurs pathspecs comme une UNION (OR), pas une
 * intersection. Passer `-- 'path' ':(glob)pattern'` élargit donc la recherche
 * (tout ce qui est sous `path`, PLUS tout ce qui matche `pattern` dans le dépôt)
 * au lieu de la restreindre. Quand `path` ET `glob` sont fournis, on fusionne en
 * UN SEUL pathspec `:(glob)<path>/<glob>` → vraie intersection « glob dans path ».
 *
 * DEUXIÈME PIÈGE, mesuré sur un vrai run (MIN-116) : le `:(glob)` de git ne
 * développe PAS les accolades. `**\/*.{ts,tsx}` — la forme que le modèle écrit
 * spontanément, c'est la convention ripgrep / Claude Code — ne matche alors AUCUN
 * fichier, git sort en code 1, et le tool rend « (no matches) », indiscernable
 * d'une vraie absence. Sur le run de vérification, 7 `grep` sur 13 ont menti comme
 * ça, jusqu'à `grep "Issue"` qui répondait qu'il n'y avait rien. On développe donc
 * les accolades NOUS-MÊMES : une alternative = un pathspec, et l'union OR de git
 * (le piège du dessus) donne ici exactement la bonne sémantique.
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
 * Plafond du produit d'expansion. Un glob réaliste en produit une poignée
 * (`{ts,tsx,js,jsx,mjs,cjs,json,md}` = 8) ; au-delà, l'entrée est pathologique et
 * on rend le motif tel quel plutôt que de fabriquer des centaines de pathspecs.
 */
const MAX_BRACE_ALTERNATIVES = 64;
/** Garde-fou de profondeur d'imbrication (`{a,{b,c}}`) — même esprit. */
const MAX_BRACE_ROUNDS = 10;

/**
 * Développe les accolades d'un glob : `*.{ts,tsx}` → `*.ts` + `*.tsx`. Les groupes
 * imbriqués sont développés de proche en proche ; un motif sans accolade (ou dont
 * les accolades ne sont pas équilibrées) ressort tel quel, à l'identique.
 */
export function expandBraces(pattern: string): string[] {
  let level = [pattern];
  for (let round = 0; round < MAX_BRACE_ROUNDS; round++) {
    const next: string[] = [];
    let expanded = false;
    for (const p of level) {
      const group = firstBraceGroup(p);
      if (!group) {
        next.push(p);
        continue;
      }
      expanded = true;
      for (const alt of group.alternatives) {
        next.push(p.slice(0, group.start) + alt + p.slice(group.end + 1));
      }
    }
    if (!expanded) return next;
    if (next.length > MAX_BRACE_ALTERNATIVES) return [pattern];
    level = next;
  }
  return level;
}

/**
 * Premier groupe `{…}` ÉQUILIBRÉ du motif, avec ses alternatives de niveau 1.
 * Ignore ce qui est échappé (`\{`) et le contenu d'une classe `[…]` — une virgule
 * y appartient à la classe, pas au groupe.
 */
function firstBraceGroup(
  p: string,
): { start: number; end: number; alternatives: string[] } | null {
  let start = -1;
  let depth = 0;
  let inClass = false;
  let commas: number[] = [];
  for (let i = 0; i < p.length; i++) {
    const c = p[i];
    if (c === "\\") {
      i++;
      continue;
    }
    if (inClass) {
      if (c === "]") inClass = false;
      continue;
    }
    if (c === "[") {
      inClass = true;
    } else if (c === "{") {
      if (depth === 0) {
        start = i;
        commas = [];
      }
      depth++;
    } else if (c === "}") {
      if (depth === 0) continue;
      depth--;
      if (depth === 0) return { start, end: i, alternatives: sliceAt(p, start + 1, i, commas) };
    } else if (c === "," && depth === 1) {
      commas.push(i);
    }
  }
  return null;
}

/** Tranche `p[from, to)` aux positions de virgule données. */
function sliceAt(p: string, from: number, to: number, commas: number[]): string[] {
  const out: string[] = [];
  let cursor = from;
  for (const comma of commas) {
    out.push(p.slice(cursor, comma));
    cursor = comma + 1;
  }
  out.push(p.slice(cursor, to));
  return out;
}

/** Un glob → ses alternatives d'accolades, chacune rendue récursive si besoin. */
function globAlternatives(glob: string): string[] {
  return expandBraces(glob).map(recursive);
}

/**
 * Pathspecs (NON quotés) pour `git grep`. Intersecte `path` et `glob` quand les
 * deux sont fournis, et rend UN pathspec par alternative d'accolade (union OR de
 * git). Tableau à quoter par l'appelant.
 */
export function grepPathspecs(path?: string | null, glob?: string | null): string[] {
  const p = path?.trim();
  const g = glob?.trim();
  if (g) {
    return globAlternatives(g).map((alt) => `:(glob)${p ? joinWithin(p, alt) : alt}`);
  }
  if (p) return [p];
  return [];
}

/** Pathspecs (NON quotés) pour `git ls-files` (tool `glob`) — au moins un. */
export function globPathspecs(pattern: string, path?: string | null): string[] {
  const p = path?.trim();
  return globAlternatives(pattern).map((alt) => `:(glob)${p ? joinWithin(p, alt) : alt}`);
}
