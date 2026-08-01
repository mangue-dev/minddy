import type { PrActionEventType } from "@/lib/pr-events";

/**
 * La règle PURE qui dit quel événement de forge devient quelle ligne d'activité
 * de ticket. Elle vit ici, et pas dans les `route.ts` : un fichier de route
 * Next.js ne peut exporter que ses handlers, donc rien de ce qu'il contient
 * n'est testable — or c'est exactement le genre de table de correspondance qui
 * se trompe en silence (une action mal orthographiée ne lève rien, elle ne
 * trace simplement jamais rien).
 *
 * Ce qui reste dans les routes : la vérification de signature, la résolution des
 * runs et l'écriture. Ici, uniquement des fonctions sans effet de bord.
 */

// ── GitHub ───────────────────────────────────────────────────────────────────

/**
 * action `pull_request` → événement d'activité (null = action non tracée).
 *
 * `synchronize` est le nom GitHub d'un PUSH sur la branche de la PR : c'est le
 * seul signal de « quelqu'un a commité là-dessus » — le payload ne porte que les
 * sha avant/après, jamais le nombre de commits, d'où une phrase qui ne compte
 * rien. Les autres actions (`edited`, `labeled`, `assigned`…) sont du bruit de
 * forge, pas des faits du ticket.
 */
export function prActionForPullRequest(
  action: string,
  merged: boolean,
): PrActionEventType | null {
  switch (action) {
    case "opened":
      return "pr_opened";
    case "synchronize":
      return "pr_committed";
    case "closed":
      return merged ? "pr_accepted" : "pr_rejected";
    default:
      return null;
  }
}

/**
 * state d'une review soumise → événement d'activité (null = ignoré).
 *
 * Une review « commented » n'est un MESSAGE que si elle en porte un : soumise
 * sans corps, elle n'est que l'enveloppe des remarques de ligne, déjà tracées
 * une à une par `pull_request_review_comment`. La tracer quand même ajouterait
 * une ligne « a commenté » qui ne renvoie à aucun texte.
 *
 * `dismissed` reste dehors : retirer une review n'a pas d'équivalent GitLab, et
 * minddy n'a pas d'événement pour l'annulation d'un geste.
 */
export function prActionForReview(review: {
  state?: string;
  body?: string | null;
}): PrActionEventType | null {
  switch (review.state) {
    case "approved":
      return "pr_approved";
    case "changes_requested":
      return "pr_changes_requested";
    case "commented":
      return review.body?.trim() ? "pr_commented" : null;
    default:
      return null;
  }
}

/**
 * Un event `issue_comment` porte-t-il un commentaire de PULL REQUEST à tracer ?
 * GitHub sert les commentaires de fil des issues ET des PR sur le même event ;
 * seule la présence de `issue.pull_request` les distingue. Les commentaires
 * d'issue distante ne sont pas de notre ressort (la synchro MIN-97 est à sens
 * unique et ne porte que l'ouverture/fermeture).
 */
export function isPullRequestComment(payload: {
  action?: string;
  issue?: { pull_request?: unknown } | null;
}): boolean {
  return payload.action === "created" && !!payload.issue?.pull_request;
}

// ── GitLab ───────────────────────────────────────────────────────────────────

/** Ce que la règle GitLab lit d'un `object_attributes` de merge request. */
export interface GitlabMrActionInput {
  action?: string;
  /** Ancienne tête : GitLab ne la met QUE sur un `update` qui porte un push. */
  oldrev?: string;
}

/**
 * action `merge_request` → événement d'activité (null = action non tracée).
 *
 * GitLab n'a pas d'action « push » : un nouveau commit arrive en `update`, la
 * même action que le changement de titre, de description ou d'étiquette. Ce qui
 * les sépare est `oldrev`, présent uniquement quand la tête a bougé.
 *
 * `unapproved` / `unapproval` restent dehors, pour la raison d'origine : retirer
 * une approbation n'est pas un geste tracé, et GitHub n'a pas d'équivalent.
 */
export function prActionForMergeRequest(
  attrs: GitlabMrActionInput,
): PrActionEventType | null {
  switch (attrs.action) {
    case "open":
      return "pr_opened";
    case "merge":
      return "pr_accepted";
    case "close":
      return "pr_rejected";
    // `approved` = la MR devient entièrement approuvée ; `approval` = une
    // approbation individuelle quand plusieurs sont requises. Mutuellement
    // exclusifs par événement → pas de double trace.
    case "approved":
    case "approval":
      return "pr_approved";
    case "update":
      return attrs.oldrev ? "pr_committed" : null;
    default:
      return null;
  }
}

/** Ce que la règle GitLab lit d'un `object_attributes` de note. */
export interface GitlabNoteInput {
  noteable_type?: string;
  /** Ancrage dans le diff : présent seulement sur une remarque de ligne. */
  position?: unknown;
}

/**
 * Note GitLab → événement d'activité (null = note hors merge request).
 *
 * Un `Note Hook` couvre les commentaires de tout ce qui se commente chez GitLab
 * (issue, commit, extrait, merge request) : `noteable_type` est le seul filtre.
 * L'ancrage `position` sépare ensuite la remarque de code du message de fil —
 * c'est le pendant exact du couple `pull_request_review_comment` / `issue_comment`
 * de GitHub.
 */
export function prActionForNote(attrs: GitlabNoteInput): PrActionEventType | null {
  if (attrs.noteable_type !== "MergeRequest") return null;
  return attrs.position ? "pr_code_commented" : "pr_commented";
}

/**
 * Gestes que minddy fait AVEC le token du compte connecté au dépôt GitLab : leur
 * écho webhook porte ce compte, et la trace existe déjà côté route ou agent.
 *
 * Les COMMENTAIRES n'en sont pas : personne ne les poste sous ce token — un
 * commentaire in-app part du compte git de la personne, et se reconnaît par
 * `isPrActionEcho`. Les y mettre reviendrait à rendre muets, définitivement, les
 * commentaires de celui qui a lié le dépôt.
 */
export function isServiceAccountGesture(type: PrActionEventType): boolean {
  return (
    type === "pr_accepted" ||
    type === "pr_rejected" ||
    type === "pr_opened" ||
    type === "pr_committed"
  );
}
