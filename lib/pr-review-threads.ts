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

/** Un fil de review : la racine et ses réponses, du plus ancien au plus récent. */
export interface ReviewThread<T extends ReviewCommentLike = ReviewCommentLike> {
  /** Id de la racine — c'est lui qu'on passe à l'endpoint `/replies`. */
  id: number;
  root: T;
  comments: T[];
}

/**
 * Regroupe les commentaires en fils. Les fils GitHub sont PLATS : répondre à une
 * réponse renvoie un `in_reply_to_id` qui pointe la RACINE, jamais la réponse
 * (vérifié contre l'API) — d'où la clé `in_reply_to_id ?? id`, sans récursion.
 */
export function groupReviewThreads<T extends ReviewCommentLike>(comments: T[]): Array<ReviewThread<T>> {
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

  const threads = [...groups.entries()].map(([rootId, group]) => {
    const sorted = [...group].sort(
      (a, b) => a.created_at.localeCompare(b.created_at) || a.id - b.id,
    );
    return { id: rootId, root: byId.get(rootId) ?? sorted[0], comments: sorted };
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
