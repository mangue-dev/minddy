/**
 * Les PAGES d'un projet (MIN-266) — la logique pure de l'arbre.
 *
 * Aucune IO ici : tout ce module travaille sur la LISTE À PLAT que le serveur
 * rend en une requête. C'est le cœur du modèle — l'imbrication n'est qu'une
 * colonne `parent_id`, donc l'arbre se reconstruit chez l'appelant (sidebar,
 * fil d'Ariane, sélecteur de parent) sans CTE récursive et sans N+1, et la
 * profondeur peut rester illimitée sans que ça coûte quoi que ce soit.
 *
 * Ce que ça impose en retour : rien n'interdit un CYCLE. Reparenter librement
 * une page sous une autre peut fermer une boucle (A → B → C → A), et toute
 * fonction qui descend l'arbre part alors en récursion infinie — écran blanc.
 * `wouldCreateCycle` est la garde, appelée AVANT l'écriture par
 * `lib/server/pages.ts` ; l'UI peut la rappeler pour griser un choix, mais elle
 * n'en est jamais le seul porteur.
 */

/** Une page, telle qu'elle sort de la table (colonnes brutes). */
export interface Page {
  id: string;
  project_id: string;
  parent_id: string | null;
  title: string;
  /** Emoji, ou null quand la page prend l'icône par défaut. */
  icon: string | null;
  /** Document ProseMirror. `null` quand la lecture ne l'a pas demandé. */
  content: unknown;
  version: number;
  /** Index fractionnaire : le tri des fratries est lexicographique. */
  position: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  deleted_by: string | null;
  /** La page par laquelle la suppression est arrivée (null sur la racine). */
  deleted_root_id: string | null;
}

/** La même page, une fois l'arbre reconstruit. */
export interface PageNode extends Page {
  children: PageNode[];
  /** 0 pour une page racine. */
  depth: number;
}

/* ─── L'arbre ──────────────────────────────────────────────────────────────── */

/**
 * Reconstruit l'arbre depuis la liste à plat, fratries triées par `position`.
 *
 * Deux cas qui ne sont pas des erreurs et ne doivent rien faire disparaître :
 * une page dont le parent n'est PAS dans la liste (parent à la corbeille, ou
 * lecture partielle) remonte à la racine plutôt que de sortir de l'arbre — une
 * page invisible est pire qu'une page mal placée ; et un cycle éventuellement
 * présent en base (garde contournée, écriture directe) est rompu ici, ses
 * membres traités comme des racines, pour qu'un rendu reste possible.
 */
export function buildPageTree(pages: readonly Page[]): PageNode[] {
  const byId = new Map<string, PageNode>();
  for (const page of pages) {
    byId.set(page.id, { ...page, children: [], depth: 0 });
  }

  const roots: PageNode[] = [];
  for (const node of byId.values()) {
    const parent = node.parent_id ? byId.get(node.parent_id) : undefined;
    if (parent && parent.id !== node.id && !descends(byId, parent, node.id)) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }

  const sort = (nodes: PageNode[], depth: number) => {
    nodes.sort(byPosition);
    for (const node of nodes) {
      node.depth = depth;
      sort(node.children, depth + 1);
    }
  };
  sort(roots, 0);

  return roots;
}

/** `a` descend-il de `ancestorId` ? Borné par le nombre de pages. */
function descends(
  byId: Map<string, PageNode>,
  from: PageNode,
  ancestorId: string
): boolean {
  const seen = new Set<string>();
  let current: PageNode | undefined = from;
  while (current) {
    if (current.id === ancestorId) return true;
    if (seen.has(current.id)) return false; // cycle déjà présent : on s'arrête
    seen.add(current.id);
    current = current.parent_id ? byId.get(current.parent_id) : undefined;
  }
  return false;
}

/**
 * Ordre d'une fratrie : la position d'abord (index fractionnaire, comparaison
 * lexicographique), le titre ensuite quand deux positions sont identiques —
 * possible après un import ou une écriture concurrente —, et l'id en dernier
 * recours pour que l'ordre soit total et donc stable d'un rendu à l'autre.
 */
function byPosition(a: Page, b: Page): number {
  if (a.position !== b.position) return a.position < b.position ? -1 : 1;
  if (a.title !== b.title) return a.title < b.title ? -1 : 1;
  return a.id < b.id ? -1 : 1;
}

/** Aplatit un arbre dans l'ordre d'affichage (parent, puis ses descendants). */
export function flattenPageTree(nodes: readonly PageNode[]): PageNode[] {
  const out: PageNode[] = [];
  const walk = (list: readonly PageNode[]) => {
    for (const node of list) {
      out.push(node);
      walk(node.children);
    }
  };
  walk(nodes);
  return out;
}

/**
 * Les ids de tous les descendants d'une page, la page NON comprise.
 *
 * C'est ce que la corbeille met à la corbeille avec elle (suppression
 * récursive), et ce que la purge finit par effacer.
 */
export function descendantIds(
  pages: readonly Page[],
  pageId: string
): string[] {
  const childrenOf = new Map<string, string[]>();
  for (const page of pages) {
    if (!page.parent_id) continue;
    const siblings = childrenOf.get(page.parent_id);
    if (siblings) siblings.push(page.id);
    else childrenOf.set(page.parent_id, [page.id]);
  }

  const out: string[] = [];
  const seen = new Set<string>([pageId]);
  const queue = [pageId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const child of childrenOf.get(current) ?? []) {
      if (seen.has(child)) continue; // cycle en base : on ne boucle pas
      seen.add(child);
      out.push(child);
      queue.push(child);
    }
  }
  return out;
}

/** Les ancêtres d'une page, du plus proche à la racine (fil d'Ariane inversé). */
export function ancestorsOf(pages: readonly Page[], pageId: string): Page[] {
  const byId = new Map(pages.map((p) => [p.id, p]));
  const out: Page[] = [];
  const seen = new Set<string>([pageId]);
  let parentId = byId.get(pageId)?.parent_id ?? null;
  while (parentId) {
    const parent = byId.get(parentId);
    if (!parent || seen.has(parent.id)) break;
    seen.add(parent.id);
    out.push(parent);
    parentId = parent.parent_id;
  }
  return out;
}

/* ─── La garde ─────────────────────────────────────────────────────────────── */

/**
 * Ce déplacement fermerait-il une boucle ?
 *
 * Vrai dans deux cas : la page devient son propre parent, ou elle devient
 * enfant d'un de ses propres descendants. Le serveur répond 409 dans ce cas —
 * la garde est là parce que la profondeur est illimitée : sans plafond, le seul
 * rempart contre la récursion infinie de la sidebar est de refuser l'écriture
 * qui la rendrait possible.
 *
 * Un `nextParentId` qui ne désigne aucune page connue n'est PAS un cycle : la
 * validation de l'existence du parent est un autre contrôle, ailleurs.
 */
export function wouldCreateCycle(
  pages: readonly Page[],
  pageId: string,
  nextParentId: string | null
): boolean {
  if (!nextParentId) return false;
  if (nextParentId === pageId) return true;

  const byId = new Map(pages.map((p) => [p.id, p]));
  const seen = new Set<string>();
  let current: string | null = nextParentId;
  while (current) {
    if (current === pageId) return true;
    if (seen.has(current)) return false; // cycle préexistant, sans la page
    seen.add(current);
    current = byId.get(current)?.parent_id ?? null;
  }
  return false;
}

/* ─── Les positions ────────────────────────────────────────────────────────── */

/**
 * Index fractionnaire, alphabet de 62 chiffres dont l'ordre ASCII coïncide avec
 * l'ordre des valeurs : une clé se compare comme une chaîne, en base et en JS,
 * sans conversion. Une clé est la partie fractionnaire d'un nombre — « V » vaut
 * ~0,5, « V5 » un peu plus.
 *
 * L'intérêt sur un entier : insérer entre deux voisins n'écrit QUE la ligne
 * déplacée. Réordonner une fratrie de trente sous-pages par glisser-déposer
 * coûte un update, pas trente.
 */
const DIGITS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

/**
 * Une position valide : au moins un chiffre, et rien que des chiffres de
 * l'alphabet. C'est ce que le serveur exige d'une position venue du client
 * (glisser-déposer) — une chaîne hors alphabet trierait n'importe où.
 */
export function isPosition(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0) return false;
  for (const char of value) {
    if (!DIGITS.includes(char)) return false;
  }
  return !value.endsWith("0");
}

/** Une clé ne finit jamais par le chiffre zéro : sinon aucune clé ne tient
    entre elle et la précédente. Une valeur venue d'ailleurs est rattrapée. */
function sanitize(key: string | null | undefined): string | null {
  if (!key) return null;
  for (const char of key) {
    if (!DIGITS.includes(char)) return null;
  }
  return key.endsWith("0") ? `${key}V` : key;
}

/** Milieu de `a` et `b`, deux fractions, avec `a < b` (b null = 1). */
function midpoint(a: string, b: string | null): string {
  if (b !== null) {
    let common = 0;
    while ((a[common] ?? "0") === b[common]) common += 1;
    if (common > 0) {
      return b.slice(0, common) + midpoint(a.slice(common), b.slice(common));
    }
  }

  const digitA = a.length > 0 ? DIGITS.indexOf(a[0]) : 0;
  const digitB = b !== null ? DIGITS.indexOf(b[0]) : DIGITS.length;

  if (digitB - digitA > 1) {
    return DIGITS[Math.round(0.5 * (digitA + digitB))];
  }
  // Chiffres consécutifs : on descend d'un cran.
  if (b !== null && b.length > 1) return b.slice(0, 1);
  return DIGITS[digitA] + midpoint(a.slice(1), null);
}

/**
 * Une position entre deux voisins. `before`/`after` sont les positions des
 * pages qui encadrent la place visée, `null` pour un bord de fratrie :
 * `positionBetween(null, null)` donne la toute première page,
 * `positionBetween(dernière, null)` ajoute en fin de fratrie.
 *
 * Un couple incohérent (before ≥ after, valeurs corrompues) ne lève pas : on
 * retombe sur un bord. Refuser ici bloquerait un déplacement pour une donnée
 * douteuse, là où le pire qui puisse arriver est un ordre inattendu.
 */
export function positionBetween(
  before: string | null | undefined,
  after: string | null | undefined
): string {
  let a = sanitize(before);
  let b = sanitize(after);
  if (a !== null && b !== null && a >= b) {
    // Ordre incohérent : on ne garde que la borne basse.
    b = null;
  }
  if (a === null && b === null) return midpoint("", null);
  if (a === null) return midpoint("", b);
  return midpoint(a, b);
}

/** La position d'une nouvelle page, en fin de la fratrie donnée. */
export function positionAtEnd(siblings: readonly Page[]): string {
  let last: string | null = null;
  for (const sibling of siblings) {
    if (last === null || sibling.position > last) last = sibling.position;
  }
  return positionBetween(last, null);
}
