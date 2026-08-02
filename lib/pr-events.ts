import type { RepoProviderId } from "@/lib/repo-providers";

/**
 * Événements d'activité tracés pour la vie d'une pull request / merge request :
 * l'ouvrir, la rouvrir, y pousser des commits, la commenter (fil ou code), et
 * les gestes de review — approuver, demander des changements, accepter (merge),
 * refuser (close). Partagé entre l'émission (agent + routes in-app + webhooks
 * GitHub/GitLab) et le rendu du journal d'activité (timeline).
 *
 * `pr_reopened` a manqué jusqu'à MIN-164 : c'était la seule transition du cycle
 * de vie sans ligne. Le ticket disait « refusée » puis repassait en revue sans
 * que rien n'explique pourquoi — et la réouverture faite par Numo ne se racontait
 * pas du tout (`registerPr` n'émettait `pr_opened` que sur une vraie ouverture).
 */
export const PR_ACTION_EVENT_TYPES = [
  "pr_approved",
  "pr_accepted",
  "pr_rejected",
  "pr_changes_requested",
  "pr_opened",
  "pr_reopened",
  "pr_committed",
  "pr_commented",
  "pr_code_commented",
] as const;

export type PrActionEventType = (typeof PR_ACTION_EVENT_TYPES)[number];

/**
 * Fenêtre de regroupement des gestes RÉPÉTABLES (cf. `collapsesInBurst`) : au
 * sein de cette fenêtre, un même acteur qui refait le même geste sur la même PR
 * ne produit qu'une ligne. Calée sur celle de l'anti-écho — le hook qui revient
 * après une action in-app tombe dans la même seconde.
 */
export const PR_EVENT_BURST_MS = 2 * 60_000;

/**
 * Ce type d'événement se regroupe-t-il dans une rafale ?
 *
 * Vrai pour les COMMENTAIRES seulement : une review GitHub de huit remarques de
 * ligne, c'est huit `pull_request_review_comment` en quelques millisecondes pour
 * UN SEUL geste — huit fois « a commenté le code de la PR #12 » rendrait le
 * journal illisible. Les autres gestes sont des faits distincts, y compris les
 * pushs successifs : chacun garde sa ligne.
 */
export function collapsesInBurst(type: string): boolean {
  return type === "pr_commented" || type === "pr_code_commented";
}

/** Provider d'origine d'une action PR venue d'un webhook (id du registre). */
export type ForgeProvider = RepoProviderId;

/**
 * Marqueur de provider encodé dans `from_value` (MIN-69) : les événements GitHub
 * historiques portent le login nu — GitHub reste donc la forme non préfixée, et
 * GitLab se distingue par le préfixe `gitlab:`. Pas de colonne dédiée, donc TOUT
 * lecteur de `from_value` d'un événement `pr_*` doit décoder via `forgePrActor`
 * (timeline ET sortie MCP recentActivity) — ne jamais afficher la valeur brute.
 */
const GITLAB_ACTOR_PREFIX = "gitlab:";

/**
 * Encode l'acteur (login + provider) vers `from_value`.
 *
 * Appelé avec un login nul par les gestes IN-APP, qui n'ont pas d'acteur de
 * forge à nommer — l'acteur y est le membre minddy (`actor_id`). Ce qu'ils
 * encodent quand même, c'est le PROVIDER : sans lui, `describeEvent` retombe sur
 * « pull request » et un utilisateur GitLab lit du GitHub sur son propre ticket.
 */
export function forgeActorValue(
  provider: ForgeProvider,
  login: string | null,
): string | null {
  if (provider === "gitlab") return `${GITLAB_ACTOR_PREFIX}${login ?? ""}`;
  return login;
}

/** Décode `from_value` d'un événement PR webhook → provider + login affichable. */
export function forgePrActor(fromValue: string | null): {
  provider: ForgeProvider;
  login: string | null;
} {
  if (fromValue?.startsWith(GITLAB_ACTOR_PREFIX)) {
    return {
      provider: "gitlab",
      login: fromValue.slice(GITLAB_ACTOR_PREFIX.length) || null,
    };
  }
  return { provider: "github", login: fromValue || null };
}

/**
 * Vrai si l'événement est une action PR venue DIRECTEMENT du provider (webhook
 * GitHub/GitLab) plutôt que d'un clic in-app : pas d'acteur minddy (`actor_id`
 * null), le login provider est porté par `from_value`. Les actions in-app portent
 * toujours un `actor_id` (le membre) → ce test les exclut.
 */
export function isForgePrEvent(e: { type: string; actor_id: string | null }): boolean {
  return !e.actor_id && (PR_ACTION_EVENT_TYPES as readonly string[]).includes(e.type);
}
