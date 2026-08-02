import type { PrActionEventType } from "@/lib/pr-events";
import type { PullRequestState } from "./pull-requests";

/**
 * Les règles PURES qui disent, d'un événement de forge, quel ÉTAT il décrit et
 * quelle ligne d'ACTIVITÉ il devient. Elles vivent ici, et pas dans les
 * `route.ts` : un fichier de route Next.js ne peut exporter que ses handlers,
 * donc rien de ce qu'il contient n'est testable — or c'est exactement le genre
 * de table de correspondance qui se trompe en silence (une action mal
 * orthographiée ne lève rien, elle ne trace simplement jamais rien).
 *
 * Ce qui reste dans les routes : la vérification de signature, la résolution des
 * runs et l'écriture. Ici, uniquement des fonctions sans effet de bord.
 *
 * L'ÉTAT s'y est ajouté par MIN-164, et pour la même raison : chaque récepteur
 * traduisait « ce que la forge dit » en état minddy à sa façon, et deux de ces
 * traductions oubliaient le brouillon. Une PR est dans UN état ; il ne peut y
 * avoir qu'une seule fonction pour le dire, par forge.
 */

// ── GitHub ───────────────────────────────────────────────────────────────────

/** Ce que la règle d'état lit d'une pull request GitHub. */
export interface GithubPrStateInput {
  state?: string;
  draft?: boolean;
  merged?: boolean;
  merged_at?: string | null;
}

/**
 * État minddy d'une pull request GitHub, tel que le payload la décrit.
 *
 * L'ordre porte tout : GitHub FERME une PR en la fusionnant (`state: "closed"`
 * + `merged: true`), donc fusionnée l'emporte ; et un brouillon n'est un
 * brouillon que tant qu'il est ouvert — GitHub garde `draft: true` sur une PR
 * brouillon fermée, et l'annoncer « brouillon » cacherait qu'elle est morte.
 *
 * `merged_at` sert de repli : l'endpoint *list* de l'API ne renvoie pas `merged`
 * (cf. `toRef` dans `pr.ts`), et certains payloads de webhook non plus.
 */
export function githubPrState(pr: GithubPrStateInput): PullRequestState {
  if (pr.merged || pr.merged_at) return "merged";
  if (pr.state === "closed") return "closed";
  return pr.draft ? "draft" : "open";
}

/**
 * Actions `pull_request` dont l'état PILOTE le cycle de vie du run et du ticket
 * — plus étroit que les actions simplement INGÉRÉES (`edited`, `synchronize` :
 * la PR change, son état non).
 *
 * `opened` en fait partie : une PR humaine qui cite un ticket doit le mettre en
 * revue comme le ferait Numo, et comme le fait déjà le récepteur GitLab avec son
 * action `open`. Sans elle, ouvrir une PR n'avait d'effet que sur GitLab alors
 * que la fusionner en avait des deux côtés (MIN-143) — le même geste, deux
 * comportements selon la forge.
 */
const STATE_DRIVING_PR_ACTIONS = new Set([
  "opened",
  "closed",
  "reopened",
  "ready_for_review",
  "converted_to_draft",
]);

/**
 * action `pull_request` + payload → état à écrire, ou null (action qui ne décrit
 * aucun changement d'état).
 *
 * L'état vient du PAYLOAD, jamais de l'action seule : GitHub laisse rouvrir une
 * PR restée brouillon, et `reopened` valait « ouverte » en dur — le ticket
 * partait alors en revue pour un travail que personne n'a proposé, ce que
 * MIN-138 avait justement tranché.
 */
export function githubPrStateForAction(
  action: string,
  pr: GithubPrStateInput,
): PullRequestState | null {
  return STATE_DRIVING_PR_ACTIONS.has(action) ? githubPrState(pr) : null;
}

/**
 * action `pull_request` → événement d'activité (null = action non tracée).
 *
 * `synchronize` est le nom GitHub d'un PUSH sur la branche de la PR : c'est le
 * seul signal de « quelqu'un a commité là-dessus » — le payload ne porte que les
 * sha avant/après, jamais le nombre de commits, d'où une phrase qui ne compte
 * rien. Les autres actions (`edited`, `labeled`, `assigned`…) sont du bruit de
 * forge, pas des faits du ticket.
 *
 * `converted_to_draft` / `ready_for_review` restent dehors : ils changent l'ÉTAT
 * (et donc le statut du ticket, qui se raconte tout seul), mais minddy n'a pas
 * d'événement pour la bascule brouillon — la PR, elle, la montre dans sa propre
 * activité (`pr-timeline`).
 */
export function prActionForPullRequest(
  action: string,
  merged: boolean,
): PrActionEventType | null {
  switch (action) {
    case "opened":
      return "pr_opened";
    case "reopened":
      return "pr_reopened";
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

/** Ce que la règle d'état lit d'un `object_attributes` de merge request. */
export interface GitlabMrStateInput {
  state?: string;
  /** MR brouillon — GitLab le dérive du préfixe `Draft:` du titre. */
  draft?: boolean;
  /** Le nom du brouillon avant GitLab 14 : encore servi par les instances auto-hébergées. */
  work_in_progress?: boolean;
}

/**
 * État minddy d'une merge request GitLab, tel que le payload la décrit.
 *
 * `locked` est un état TRANSITOIRE (une fusion en cours), pas un quatrième
 * état de vie : il tombe donc du côté ouvert, comme dans `toRef` (`mr.ts`).
 *
 * Les DEUX noms du brouillon sont lus : GitLab a renommé `work_in_progress` en
 * `draft` en 14.0, et une instance auto-hébergée plus ancienne n'envoie que
 * l'ancien. N'en lire qu'un rendait le brouillon invisible sur ces instances.
 */
export function gitlabMrState(attrs: GitlabMrStateInput): PullRequestState {
  if (attrs.state === "merged") return "merged";
  if (attrs.state === "closed") return "closed";
  return attrs.draft || attrs.work_in_progress ? "draft" : "open";
}

/** Ce que la règle d'état lit d'un événement `merge_request` complet. */
export interface GitlabMrStateEvent {
  object_attributes?: GitlabMrStateInput & { action?: string };
  /** Champs modifiés par un `update` (présents seulement sur cette action). */
  changes?: { title?: unknown; draft?: unknown };
}

/**
 * action `merge_request` + payload → état à écrire, ou null.
 *
 * Le BROUILLON n'a pas d'action dédiée chez GitLab, contrairement aux
 * `converted_to_draft` / `ready_for_review` de GitHub : il est porté par le
 * préfixe `Draft:` du titre, et sa bascule arrive en `action: "update"` — la
 * même action qu'un changement de description ou d'étiquette. On ne relit donc
 * l'état sur un `update` que s'il TOUCHE au titre ou au brouillon, sinon une
 * simple retouche de description réécrirait l'état (et, en cascade, le statut du
 * ticket) à chaque édition.
 */
export function gitlabMrStateForAction(
  payload: GitlabMrStateEvent,
): PullRequestState | null {
  const attrs = payload.object_attributes ?? {};
  switch (attrs.action) {
    case "merge":
    case "close":
    case "open":
    case "reopen":
      return gitlabMrState(attrs);
    case "update": {
      const changes = payload.changes ?? {};
      if (changes.draft === undefined && changes.title === undefined) return null;
      // Une MR déjà fermée ou fusionnée dont on retouche le titre reste ce
      // qu'elle est : seule une MR VIVANTE bascule en brouillon.
      if (attrs.state !== "opened" && attrs.state !== "locked") return null;
      return gitlabMrState(attrs);
    }
    default:
      return null;
  }
}

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
    case "reopen":
      return "pr_reopened";
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
    type === "pr_reopened" ||
    type === "pr_committed"
  );
}
