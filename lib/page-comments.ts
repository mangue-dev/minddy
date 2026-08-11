// Les FILS d'une page (MIN-282) — la moitié pure : les lignes entrent, les fils
// sortent, ordonnés et marqués.
//
// Rien de la base, rien de tiptap, rien de React : le document n'arrive ici que
// sous la forme de l'ensemble des ids de blocs qu'il porte. C'est ce qui rend
// l'ANCRAGE et le DÉTACHEMENT testables tels quels (lib/page-comments.test.ts),
// alors que ce sont exactement les deux comportements qu'on ne peut pas vérifier
// à l'œil.
//
// ─── Ce que « détaché » veut dire, et pourquoi ce n'est pas une colonne ──────
//
// Un fil ancré sur un bloc qui n'est plus dans le document est détaché. C'est
// une LECTURE, calculée à chaque affichage contre le document réel — jamais une
// écriture. Deux raisons, et la seconde est la vraie : un bloc peut revenir par
// un simple ⌘Z, et une page se lit à plusieurs, donc l'onglet qui constaterait
// la disparition écrirait un état que l'onglet d'à côté est en train de défaire.
//
// Un fil détaché ne disparaît pas : il remonte EN TÊTE, avec l'extrait figé au
// moment où il a été écrit (`quote`). Le supprimer avec son bloc perdrait la
// seule trace de pourquoi le bloc a été retiré.

/** Un commentaire de page, tel que le rend l'API. */
export interface PageComment {
  id: string;
  page_id: string;
  project_id: string;
  /** L'ancre : le bloc commenté. Null = un commentaire sur la PAGE. */
  block_id: string | null;
  /** L'extrait du bloc, figé au moment du commentaire. */
  quote: string | null;
  body: string;
  author_id: string | null;
  /** La racine du fil quand cette ligne est une réponse (profondeur ≤ 1). */
  parent_id: string | null;
  resolved_at: string | null;
  resolved_by: string | null;
  via_assistant?: boolean;
  via_mcp?: boolean;
  api_key_id?: string | null;
  api_key_name?: string | null;
  api_key_agent?: string | null;
  created_at: string;
  updated_at: string;
}

/** Un fil : sa racine, ses réponses, et ce que son ancre est devenue. */
export interface PageThread {
  root: PageComment;
  replies: PageComment[];
  /** Ancré sur un bloc — que ce bloc existe encore ou non. */
  anchored: boolean;
  /** Ancré sur un bloc ABSENT du document : le fil parle d'un texte parti. */
  detached: boolean;
  resolved: boolean;
}

/**
 * Les fils d'une page, dans l'ordre où ils se lisent.
 *
 * `blockIds` est l'ensemble des ids de blocs du document tel qu'il est À
 * L'ÉCRAN — pas celui de la dernière sauvegarde. C'est le seul état qui décide
 * du détachement, et il change sous les doigts.
 *
 * L'ordre : les DÉTACHÉS d'abord (ils parlent d'un texte que plus personne ne
 * voit, donc rien dans la page ne les rappellera), puis le reste par date. Les
 * fils RÉSOLUS sortent quand `includeResolved` est faux — c'est le défaut, et
 * c'est ce que « masquer les fils résolus » veut dire.
 */
export function arrangeThreads(
  comments: PageComment[],
  blockIds: ReadonlySet<string>,
  options: { includeResolved?: boolean } = {}
): PageThread[] {
  const roots = comments.filter((c) => !c.parent_id);
  const rootIds = new Set(roots.map((c) => c.id));
  const repliesByRoot = new Map<string, PageComment[]>();
  for (const c of comments) {
    if (!c.parent_id || !rootIds.has(c.parent_id)) continue;
    const list = repliesByRoot.get(c.parent_id) ?? [];
    list.push(c);
    repliesByRoot.set(c.parent_id, list);
  }
  // Une réponse ORPHELINE (racine supprimée hors de cette liste) redevient une
  // racine plutôt que de disparaître : perdre du texte parce qu'on a perdu son
  // parent est exactement ce que le détachement refuse par ailleurs.
  const orphans = comments.filter((c) => c.parent_id && !rootIds.has(c.parent_id));

  const threads: PageThread[] = [...roots, ...orphans].map((root) => {
    const anchored = !!root.block_id;
    return {
      root,
      replies: (repliesByRoot.get(root.id) ?? []).sort((a, b) =>
        a.created_at.localeCompare(b.created_at)
      ),
      anchored,
      detached: anchored && !blockIds.has(root.block_id as string),
      resolved: !!root.resolved_at,
    };
  });

  const visible = options.includeResolved
    ? threads
    : threads.filter((thread) => !thread.resolved);

  return visible.sort((a, b) => {
    if (a.detached !== b.detached) return a.detached ? -1 : 1;
    return a.root.created_at.localeCompare(b.root.created_at);
  });
}

/**
 * Les blocs qui portent un fil OUVERT et vivant — ce que le liseré peint.
 *
 * Un fil résolu n'allume plus rien : c'est la moitié visible de « masquer les
 * fils résolus », et sans elle le document resterait strié de discussions
 * closes.
 */
export function commentedBlockIds(threads: PageThread[]): Set<string> {
  const ids = new Set<string>();
  for (const thread of threads) {
    if (thread.resolved || thread.detached || !thread.root.block_id) continue;
    ids.add(thread.root.block_id);
  }
  return ids;
}

/** Combien de fils résolus sont cachés — le compte que porte le bouton qui les
    rouvre. Sans lui, « il n'y a rien » et « tout est résolu » se ressemblent. */
export function resolvedCount(
  comments: PageComment[],
  blockIds: ReadonlySet<string>
): number {
  return arrangeThreads(comments, blockIds, { includeResolved: true }).filter(
    (thread) => thread.resolved
  ).length;
}

/** Plafond de l'extrait figé : de quoi reconnaître la phrase, pas de quoi
    recopier le bloc — un fil détaché doit tenir sur deux lignes dans la liste. */
export const MAX_QUOTE_LENGTH = 300;

/** L'extrait tel qu'on le range : replié sur une ligne, coupé net, avec son
    ellipse quand il a été coupé. */
export function normalizeQuote(raw: string | null | undefined): string | null {
  const text = (raw ?? "").replace(/\s+/g, " ").trim();
  if (!text) return null;
  return text.length <= MAX_QUOTE_LENGTH
    ? text
    : `${text.slice(0, MAX_QUOTE_LENGTH).trimEnd()}…`;
}
