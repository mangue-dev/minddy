/**
 * Événements d'activité tracés pour les actions de review d'une pull request :
 * accepter (merge), refuser (close), approuver et demander des changements. Seules
 * ces ACTIONS comptent — les simples commentaires n'en produisent aucune (choix
 * produit). Partagé entre l'émission (route in-app + webhook GitHub) et le rendu
 * du journal d'activité (timeline).
 */
export const PR_ACTION_EVENT_TYPES = [
  "pr_approved",
  "pr_accepted",
  "pr_rejected",
  "pr_changes_requested",
] as const;

export type PrActionEventType = (typeof PR_ACTION_EVENT_TYPES)[number];

/**
 * Vrai si l'événement est une action PR venue DIRECTEMENT de GitHub (webhook)
 * plutôt que d'un clic in-app : pas d'acteur minddy (`actor_id` null), le login
 * GitHub est porté par `from_value`. Les actions in-app portent toujours un
 * `actor_id` (le membre) → ce test les exclut.
 */
export function isGithubPrEvent(e: { type: string; actor_id: string | null }): boolean {
  return !e.actor_id && (PR_ACTION_EVENT_TYPES as readonly string[]).includes(e.type);
}
