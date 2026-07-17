import type { RepoProviderId } from "@/lib/repo-providers";

/**
 * Événements d'activité tracés pour les actions de review d'une pull request /
 * merge request : accepter (merge), refuser (close), approuver et demander des
 * changements. Seules ces ACTIONS comptent — les simples commentaires n'en
 * produisent aucune (choix produit). Partagé entre l'émission (route in-app +
 * webhooks GitHub/GitLab) et le rendu du journal d'activité (timeline).
 */
export const PR_ACTION_EVENT_TYPES = [
  "pr_approved",
  "pr_accepted",
  "pr_rejected",
  "pr_changes_requested",
] as const;

export type PrActionEventType = (typeof PR_ACTION_EVENT_TYPES)[number];

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

/** Encode l'acteur webhook (login + provider) vers `from_value`. */
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
