/**
 * Dernier rempart avant l'envoi à PostHog (MIN-78).
 *
 * Le catalogue typé (`lib/analytics-events.ts`) empêche déjà d'inventer un nom
 * d'événement ou une prop hors contrat À LA COMPILATION. Ces fonctions couvrent
 * ce que le typage ne peut pas voir : une VALEUR calculée à l'exécution qui
 * serait du texte utilisateur trop long, un objet imbriqué, un `NaN`, ou une
 * clé `$`-préfixée qui écraserait une propriété réservée de PostHog.
 *
 * Règle de fond : on n'envoie que des MÉTADONNÉES (compteurs, booléens, enums,
 * ids, tranches de longueur). Jamais un titre de ticket, un commentaire, ni un
 * message adressé à Numo.
 */

/** Longueur max d'une valeur texte — bien au-delà de tout enum légitime. */
const MAX_STRING_LENGTH = 512;
/** Au-delà, c'est qu'on essaie de sérialiser un objet métier entier. */
const MAX_PROP_KEYS = 24;
const MAX_EVENT_NAME_LENGTH = 64;

/** snake_case (plus `:` et `-`), le format de nommage du catalogue. */
const SAFE_KEY_PATTERN = /^[a-z0-9_:-]+$/;

/** Caractères de contrôle (dont \n, \t) — remplacés par une espace. */
const CONTROL_CHARS = /[\u0000-\u001F\u007F]/g;

/** Neutralise les caractères de contrôle et borne la longueur. */
function clampText(value: string, maxLength: number): string {
  return value.replace(CONTROL_CHARS, " ").trim().slice(0, maxLength);
}

/**
 * Normalise un nom d'événement, ou renvoie "" s'il est inexploitable — l'appelant
 * (`useAnalytics().track`) abandonne alors l'envoi plutôt que de créer une
 * définition d'événement parasite dans PostHog.
 */
export function sanitizeAnalyticsEventName(value: unknown): string {
  if (typeof value !== "string") return "";
  const sanitized = clampText(value, MAX_EVENT_NAME_LENGTH).toLowerCase();
  return SAFE_KEY_PATTERN.test(sanitized) ? sanitized : "";
}

/**
 * Ne garde que des primitives sûres. Tout le reste (objets, tableaux,
 * fonctions, `undefined`, `NaN`, clés `$`-préfixées) est SILENCIEUSEMENT écarté :
 * une prop manquante est un moindre mal comparé à un événement rejeté par
 * l'ingestion ou à une fuite de donnée personnelle.
 */
export function sanitizeAnalyticsProps(
  value: Record<string, unknown> | undefined
): Record<string, string | number | boolean | null> {
  if (!value || typeof value !== "object") return {};

  const sanitized: Record<string, string | number | boolean | null> = {};
  for (const [rawKey, rawValue] of Object.entries(value).slice(0, MAX_PROP_KEYS)) {
    if (typeof rawKey !== "string") continue;
    const key = clampText(rawKey, MAX_EVENT_NAME_LENGTH).toLowerCase();
    if (!key || !SAFE_KEY_PATTERN.test(key)) continue;

    if (typeof rawValue === "string") {
      sanitized[key] = clampText(rawValue, MAX_STRING_LENGTH);
      continue;
    }
    if (typeof rawValue === "number") {
      // NaN / Infinity cassent la sérialisation JSON côté ingestion.
      if (Number.isFinite(rawValue)) sanitized[key] = rawValue;
      continue;
    }
    if (typeof rawValue === "boolean") {
      sanitized[key] = rawValue;
      continue;
    }
    // `null` est une information ("pas de valeur"), `undefined` n'en est pas une.
    if (rawValue === null) sanitized[key] = null;
  }

  return sanitized;
}

/**
 * Tranche de longueur d'un texte libre, pour mesurer l'usage SANS envoyer le
 * contenu. À utiliser partout où l'on serait tenté de tracker un message
 * (commentaire, prompt Numo, retour du board public).
 */
export function lengthBucket(text: string | null | undefined): string {
  const length = text?.length ?? 0;
  if (length === 0) return "empty";
  if (length <= 40) return "xs";
  if (length <= 140) return "s";
  if (length <= 500) return "m";
  if (length <= 2000) return "l";
  return "xl";
}

/** Même idée pour une durée en millisecondes (runs d'agent, réponses Numo). */
export function durationBucket(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "unknown";
  if (ms < 1_000) return "under_1s";
  if (ms < 5_000) return "1_5s";
  if (ms < 30_000) return "5_30s";
  if (ms < 120_000) return "30s_2m";
  if (ms < 600_000) return "2_10m";
  return "over_10m";
}

/**
 * Réduit une erreur à une CATÉGORIE stable, jamais son message brut.
 *
 * Un message d'erreur peut contenir une adresse email, un identifiant ou un
 * fragment de requête ; il change aussi à chaque mise à jour du fournisseur, ce
 * qui fragmente les statistiques. On mappe donc les cas connus vers une poignée
 * de valeurs, et tout le reste vers `unknown` — largement suffisant pour savoir
 * *pourquoi* les gens n'arrivent pas à se connecter.
 */
export function errorReason(error: unknown): string {
  const message = (error instanceof Error ? error.message : String(error ?? "")).toLowerCase();
  if (!message) return "unknown";
  if (message.includes("invalid login credentials")) return "invalid_credentials";
  if (message.includes("email not confirmed")) return "email_not_confirmed";
  if (message.includes("already registered") || message.includes("already exists")) {
    return "user_already_exists";
  }
  if (message.includes("password should be")) return "weak_password";
  if (message.includes("for security purposes") || message.includes("rate limit")) {
    return "rate_limited";
  }
  if (message.includes("email address") && message.includes("invalid")) return "invalid_email";
  if (message.includes("captcha")) return "captcha_failed";
  if (message.includes("fetch") || message.includes("network")) return "network";
  if (message.includes("timeout") || message.includes("timed out")) return "timeout";
  if (message.includes("provider is not enabled")) return "provider_disabled";
  return "unknown";
}

/** Et pour une taille de fichier en octets (pièces jointes). */
export function sizeBucket(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "unknown";
  if (bytes < 100_000) return "under_100kb";
  if (bytes < 1_000_000) return "100kb_1mb";
  if (bytes < 5_000_000) return "1_5mb";
  return "over_5mb";
}
