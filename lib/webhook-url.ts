/**
 * L'adresse d'un webhook, telle qu'on la saisit.
 *
 * Module pur, sans dépendance : c'est ce qui le rend testable et utilisable des
 * deux côtés — le champ qui la collecte comme, un jour, ce qui la reçoit.
 */

/**
 * « example.com/hooks/minddy » est une URL pour qui la lit, pas pour
 * `new URL()` — et c'est ainsi qu'on la copie depuis une doc ou une barre
 * d'adresse. On complète donc le schéma manquant plutôt que de refuser la
 * saisie.
 *
 * En `https`, jamais `http` : cette adresse recevra des charges utiles signées,
 * et un défaut en clair serait un choix pris à la place de l'utilisateur. Un
 * schéma déjà écrit, lui, est respecté tel quel — `http://localhost:3000` reste
 * ce qu'il est.
 */
export function normalizeWebhookUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
}

/** L'adresse est-elle appelable telle quelle ? (le serveur revérifie) */
export function isDeliverableWebhookUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}
