/**
 * Hôtes considérés comme « du développement » : PostHog n'est jamais initialisé
 * dessus, pour qu'un `next dev` (ou un test de domaine custom) ne pollue pas les
 * statistiques de production. Voir `components/posthog-init.tsx`, qui laisse
 * une porte de sortie (`NEXT_PUBLIC_POSTHOG_ALLOW_LOCALHOST=1`) pour vérifier le
 * câblage des événements en local avec une clé jetable.
 *
 * `*.minddy.test` couvre les hôtes pointés sur 127.0.0.1 dans /etc/hosts pour
 * tester les domaines personnalisés (MIN-36) — ce sont bien des URLs locales,
 * même si leur nom ne finit pas par `.localhost`.
 */
/**
 * Les événements SERVEUR doivent-ils partir depuis cet environnement ?
 *
 * Pendant d'`isLocalAnalyticsHostname`, qui ne protège que le navigateur. Le
 * serveur n'a pas de `location.hostname` : il se repère à `VERCEL_ENV`, absent
 * en local (voir `getAppEnv`). Sans cette garde, couper le flag localhost
 * silencerait le client mais laisserait `issue_created_server`,
 * `user_signed_up`, `agent_run_started`… continuer de partir d'un `pnpm dev`
 * vers le projet de production — une pollution invisible, et d'autant plus
 * trompeuse que ce sont justement les événements qui font autorité.
 */
export function shouldSendServerAnalytics(params: {
  hasKey: boolean;
  appEnv: string;
  allowLocalhost: boolean;
}): boolean {
  if (!params.hasKey) return false;
  // Production et preview envoient toujours : ce sont de vrais utilisateurs.
  if (params.appEnv !== "development") return true;
  // En local, seulement si on a explicitement demandé à vérifier le câblage.
  return params.allowLocalhost;
}

export function isLocalAnalyticsHostname(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase();
  // Une adresse IPv6 littérale arrive entre crochets dans `location.hostname`.
  const host =
    normalized.startsWith("[") && normalized.endsWith("]")
      ? normalized.slice(1, -1)
      : normalized;

  return (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "0.0.0.0" ||
    host === "::1" ||
    host.endsWith(".localhost") ||
    host === "minddy.test" ||
    host.endsWith(".minddy.test")
  );
}
