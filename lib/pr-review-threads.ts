/**
 * Regroupement des commentaires de review d'une PR en fils. Volontairement PUR
 * (aucune dépendance) et générique : la même règle sert au rendu client et à la
 * construction du contexte de l'agent, côté serveur — la dupliquer les ferait
 * diverger. Ce qui dépend du diff rendu vit dans `pr-review-diff`.
 */

/** Le strict nécessaire au regroupement — les types client et serveur s'y conforment. */
export interface ReviewCommentLike {
  id: number;
  /** Racine du fil, ou null si ce commentaire EST la racine. */
  in_reply_to_id: number | null;
  created_at: string;
}

/**
 * Ce que la forge sait d'un FIL et que la liste des commentaires ne dit pas
 * (MIN-139) : son identité propre et son état de résolution.
 *
 * `rootCommentId` est la clé d'appariement : les deux forges désignent le fil par
 * son premier commentaire, exactement l'id sur lequel `groupReviewThreads`
 * regroupe déjà. `threadId`, lui, est OPAQUE et sans rapport avec les ids de
 * commentaires — node id GraphQL côté GitHub (`PRRT_…`, seule clé acceptée par
 * `resolveReviewThread`), id de discussion côté GitLab. D'où son type `string` :
 * il ne se compare pas, il se renvoie tel quel à la forge.
 */
export interface ReviewThreadState {
  rootCommentId: number;
  threadId: string;
  resolved: boolean;
  /** Qui a résolu, quand la forge le dit — l'en-tête d'un fil replié le nomme. */
  resolvedBy: string | null;
}

/** Un fil de review : la racine et ses réponses, du plus ancien au plus récent. */
export interface ReviewThread<T extends ReviewCommentLike = ReviewCommentLike> {
  /** Id de la racine — c'est lui qu'on passe à l'endpoint `/replies`. */
  id: number;
  root: T;
  comments: T[];
  /**
   * État du fil chez la forge, quand l'appelant l'a chargé (`listReviewThreads`).
   * `undefined` = INCONNU — pas « non résolu » : c'est le cas de tout appelant qui
   * ne lit que les commentaires, et l'UI n'y propose alors aucune affordance
   * plutôt que d'afficher un fil ouvert qui ne l'est peut-être pas.
   */
  resolution?: ReviewThreadState;
}

/**
 * Regroupe les commentaires en fils. Les fils GitHub sont PLATS : répondre à une
 * réponse renvoie un `in_reply_to_id` qui pointe la RACINE, jamais la réponse
 * (vérifié contre l'API) — d'où la clé `in_reply_to_id ?? id`, sans récursion.
 *
 * `states` (optionnel) attache l'état de résolution, apparié par la racine. Un
 * état sans fil correspondant est ignoré, et un fil sans état reste `undefined` :
 * les deux listes viennent de deux appels distincts et peuvent diverger d'un
 * commentaire posté entre les deux.
 */
export function groupReviewThreads<T extends ReviewCommentLike>(
  comments: T[],
  states?: ReviewThreadState[],
): Array<ReviewThread<T>> {
  const byId = new Map(comments.map((c) => [c.id, c]));
  const groups = new Map<number, T[]>();

  for (const c of comments) {
    // Une réponse dont la racine manque (fil tronqué par la pagination) devient
    // sa propre racine — mieux vaut un fil orphelin qu'un commentaire escamoté.
    const rootId = c.in_reply_to_id != null && byId.has(c.in_reply_to_id) ? c.in_reply_to_id : c.id;
    const group = groups.get(rootId);
    if (group) group.push(c);
    else groups.set(rootId, [c]);
  }

  const stateByRoot = new Map((states ?? []).map((s) => [s.rootCommentId, s]));
  const threads = [...groups.entries()].map(([rootId, group]) => {
    const sorted = [...group].sort(
      (a, b) => a.created_at.localeCompare(b.created_at) || a.id - b.id,
    );
    return {
      id: rootId,
      root: byId.get(rootId) ?? sorted[0],
      comments: sorted,
      resolution: stateByRoot.get(rootId),
    };
  });
  // Fils ordonnés par leur racine : deux fils sur la même ligne s'empilent dans
  // l'ordre où ils ont été ouverts.
  return threads.sort(
    (a, b) => a.root.created_at.localeCompare(b.root.created_at) || a.id - b.id,
  );
}

/**
 * Ligne à AFFICHER pour un fil périmé : `line` quand GitHub sait encore la placer,
 * sinon la ligne du commit d'origine. Sert d'étiquette (« fichier:120 »), pas
 * d'ancre — un fil périmé n'en a plus.
 */
export function displayLineOf(comment: { line: number | null; original_line: number | null }): number | null {
  return comment.line ?? comment.original_line;
}
