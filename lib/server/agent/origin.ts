import "server-only";

/**
 * Origine (scheme+host) de l'app pour l'auto-invocation du drain de l'agent
 * (MIN-46). minddy n'a pas de helper d'origine canonique ; on privilégie l'URL
 * du DÉPLOIEMENT courant (VERCEL_URL) pour que l'enfant s'exécute sur le même
 * déploiement, sinon le domaine de prod. Utilisé comme fallback quand la route
 * cron ne fournit pas sa propre origine de requête.
 */
export function getAgentDrainOrigin(): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");
  const vercelUrl = process.env.VERCEL_URL?.trim();
  if (vercelUrl) return `https://${vercelUrl}`;
  return "https://www.minddy.app";
}
