/**
 * Catalogue des providers de dépôt (MIN-47) — la source de vérité unique des
 * providers git qu'un projet peut lier. Importé côté serveur (dispatch, routes
 * OAuth) ET côté client (le sélecteur de connexion), donc ce module n'est PAS
 * `server-only` : il ne porte que des métadonnées publiques, non secrètes. Les
 * secrets (client ids OAuth, clés de chiffrement) vivent dans les env / modules
 * `server-only`.
 *
 * Porté du registre d'AutoKap (lib/repo-providers.ts). La colonne DB `provider`
 * n'a PAS de contrainte CHECK : ce registre, pas le schéma, fait autorité sur les
 * providers valides — ajouter un provider ne demande aucune migration.
 */

/** Providers avec une implémentation réelle derrière la couche d'auth. */
export type RepoProviderId = "github" | "gitlab";

/**
 * Comment minddy s'authentifie auprès du provider.
 * - `github_app` : tokens d'installation GitHub App (éphémères, mintés par appel).
 * - `oauth`      : app OAuth au niveau compte, access token expirant + refresh.
 */
export type RepoProviderAuthModel = "github_app" | "oauth";

/** Clé d'icône résolue en composant concret côté client. */
export type RepoProviderIconName = "github" | "gitlab";

export interface RepoProviderMeta {
  id: RepoProviderId;
  /** Nom de marque — NON localisé (GitHub/GitLab sont des marques ; injecté dans l'i18n via {provider}). */
  displayName: string;
  iconName: RepoProviderIconName;
  authModel: RepoProviderAuthModel;
  status: "active";
  capabilities: {
    /** Écriture (PR/MR) — l'agent de code tourne sur les deux providers (MIN-69) :
        clone, ouverture/merge/close de PR ou MR, review, webhook de synchro. */
    write: boolean;
  };
}

export const REPO_PROVIDERS = {
  github: {
    id: "github",
    displayName: "GitHub",
    iconName: "github",
    authModel: "github_app",
    status: "active",
    capabilities: { write: true },
  },
  gitlab: {
    id: "gitlab",
    displayName: "GitLab",
    iconName: "gitlab",
    authModel: "oauth",
    status: "active",
    capabilities: { write: true },
  },
} as const satisfies Record<RepoProviderId, RepoProviderMeta>;

/** Liste ordonnée que le sélecteur affiche. */
export const ALL_PROVIDERS: readonly RepoProviderMeta[] =
  Object.values(REPO_PROVIDERS);

/** Providers qu'un utilisateur peut lier maintenant. */
export const ACTIVE_PROVIDERS: readonly RepoProviderMeta[] = ALL_PROVIDERS.filter(
  (p) => p.status === "active",
);

/** Restreint une chaîne arbitraire (ex. la colonne DB `provider`) à un id connu. */
export function isRepoProviderId(value: unknown): value is RepoProviderId {
  return value === "github" || value === "gitlab";
}

/**
 * Identifiant court d'une pull request, dans la notation de SA forge : `#30`
 * chez GitHub, `!30` chez GitLab. C'est le nom propre de la PR — celui qu'on
 * cherche des yeux dans la liste et dans l'en-tête ; le ticket lié, lui, n'est
 * qu'une relation qu'on accroche à droite.
 */
export function prIdentifier(
  provider: string | null | undefined,
  number: number,
): string {
  return `${provider === "gitlab" ? "!" : "#"}${number}`;
}

/** Le suffixe que GitHub colle au login de toute App. */
const BOT_SUFFIX = "[bot]";

/**
 * Sépare un login de forge de sa marque de bot. GitHub suffixe le login de
 * toute App par `[bot]` — `vercel[bot]`, `dependabot[bot]`, et le nôtre quand
 * Numo commente. Ce suffixe est une ÉTIQUETTE DE TYPE, pas une partie du nom :
 * GitHub ne l'écrit jamais en toutes lettres, il affiche le nom puis une petite
 * pastille « bot ». `GitLogin` fait pareil.
 *
 * Un login qui ne serait QUE `[bot]` reste rendu tel quel : mieux vaut un nom
 * bizarre qu'une pastille sans nom devant.
 *
 * Rien à détecter côté GitLab : ses bots sont des comptes ordinaires, sans
 * convention de nommage — la fonction y rend le login inchangé.
 */
export function parseForgeLogin(login: string): { name: string; isBot: boolean } {
  const trimmed = login.trim();
  if (!trimmed.toLowerCase().endsWith(BOT_SUFFIX)) return { name: trimmed, isBot: false };
  const name = trimmed.slice(0, -BOT_SUFFIX.length);
  return name ? { name, isBot: true } : { name: trimmed, isBot: false };
}

/** Résout une valeur `provider` stockée en métadonnées, par défaut GitHub. */
export function getRepoProvider(
  value: string | null | undefined,
): RepoProviderMeta {
  if (value && value in REPO_PROVIDERS) {
    return REPO_PROVIDERS[value as RepoProviderId];
  }
  return REPO_PROVIDERS.github;
}
