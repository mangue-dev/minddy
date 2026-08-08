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
 *
 * TROISIÈME PIÈGE, même famille, mesuré sur MIN-226 : `path` désigne un SOUS-ARBRE,
 * et l'intersection le suppose. Quand le modèle veut chercher dans UN fichier, il
 * remplit les deux champs du même chemin (`path` = `glob` = `components/foo.tsx`)
 * — la lecture naturelle de « où chercher » + « quoi chercher ». On fabriquait
 * alors `:(glob)components/foo.tsx/components/foo.tsx`, qui ne matche rien : git
 * sort en 1, le tool répond « (no matches) », et le modèle enregistre que ce
 * fichier ne contient pas ce qu'il y cherchait. Sur le run qui a écrit le plan de
 * MIN-226, les 5 sondes de cette forme ont menti — dont celle qui aurait trouvé
 * le troisième appelant du composant qu'on supprimait.
 *
 * Un `path` de FICHIER ne s'intersecte donc plus : il gagne, et le glob tombe.
 * C'est la seule direction sûre — au pire on cherche plus large que demandé, et
 * jamais on ne répond « rien » sur du code qui existe.
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
 * Métacaractères de glob : leur présence dit qu'on parle d'un MOTIF, pas d'un chemin.
 *
 * `[` et `]` en sont volontairement ABSENTS. Ce sont bien des métacaractères de
 * glob (une classe de caractères), mais dans un dépôt Next.js ils écrivent
 * d'abord un segment de route — `app/(app)/projects/[id]/page.tsx` — et les
 * compter comme motif rendait la garde aveugle au chemin même derrière lequel le
 * bug s'était caché. Un `path` qui serait une vraie classe de caractères sans
 * aucun `*`/`?`/`{}` est un cas de laboratoire ; une route dynamique est le cas
 * courant.
 */
const GLOB_META = /[*?{}]/;

/**
 * `path` désigne-t-il un fichier précis plutôt qu'un sous-arbre ? Question posée
 * SANS toucher au disque (ce module est pur), donc tranchée sur la forme : aucun
 * métacaractère, et un dernier segment qui porte une extension.
 *
 * Se tromper ici est sans gravité, et c'est voulu : un faux positif (un dossier
 * nommé `app/v1.2`) fait tomber le glob et cherche dans tout le sous-arbre —
 * plus large que demandé, jamais moins. C'est l'inverse exact du défaut qu'on
 * répare, et il n'y a pas de symétrie à chercher entre les deux.
 */
function looksLikeFile(path: string): boolean {
  if (GLOB_META.test(path)) return false;
  const last = path.replace(/\/+$/, "").split("/").pop() ?? "";
  return /[^.]\.[A-Za-z0-9]+$/.test(last);
}

/**
 * Le glob doit-il être ABANDONNÉ au profit du seul `path` ? Deux cas, et tous
 * deux veulent dire « cherche là-dedans » :
 *
 *  - `path` nomme un fichier — il n'y a rien à filtrer sous un fichier ;
 *  - les deux champs portent le même chemin — l'imbriquer sous lui-même ne
 *    matcherait rien, que ce chemin soit un fichier ou un dossier.
 */
function globIsMoot(path: string, glob: string): boolean {
  return path === glob || looksLikeFile(path);
}

/**
 * Pathspecs (NON quotés) pour `git grep`. Intersecte `path` et `glob` quand les
 * deux sont fournis, et rend UN pathspec par alternative d'accolade (union OR de
 * git). Tableau à quoter par l'appelant.
 */
export function grepPathspecs(path?: string | null, glob?: string | null): string[] {
  const p = path?.trim();
  const g = glob?.trim();
  if (g && !(p && globIsMoot(p, g))) {
    return globAlternatives(g).map((alt) => `:(glob)${p ? joinWithin(p, alt) : alt}`);
  }
  if (p) return [p];
  return [];
}

/** Pathspecs (NON quotés) pour `git ls-files` (tool `glob`) — au moins un. */
export function globPathspecs(pattern: string, path?: string | null): string[] {
  const p = path?.trim();
  // Même garde qu'au-dessus : `glob(pattern, path)` où `path` est un fichier
  // (ou le motif lui-même) ne peut désigner que ce fichier.
  if (p && globIsMoot(p, pattern.trim())) return [p];
  return globAlternatives(pattern).map((alt) => `:(glob)${p ? joinWithin(p, alt) : alt}`);
}
