/**
 * Repository Provider Catalog (MIN-47) — the single source of truth for the git providers that a project can link to. Imported on the server side (dispatch, routes
 * OAuth) AND on the client side (the connection selector), so this module is NOT
 * `server-only`: it only carries public, non-secret metadata. The
 * secrets (OAuth client ids, encryption keys) live in the env/modules
 * `server-only`.
 *
 * Scope from AutoKap registry (lib/repo-providers.ts). The DB column `provider`
 * has NO CHECK constraint: this register, not the schema, is authoritative on valid
 * providers — adding a provider requires no migration.
 */

/** Providers with an actual implementation behind the auth layer. */
export type RepoProviderId = "github" | "gitlab";

/**
 * How minddy authenticates with the provider.
 * - `github_app`: GitHub App installation tokens (ephemeral, minted per call).
 * - `oauth`: OAuth app at account level, access token expiring + refresh.
 */
export type RepoProviderAuthModel = "github_app" | "oauth";

/** Icon key resolved to concrete client-side component. */
export type RepoProviderIconName = "github" | "gitlab";

export interface RepoProviderMeta {
  id: RepoProviderId;
  /** Brand name — NOT localized (GitHub/GitLab are trademarks; injected into i18n via {provider}). */
  displayName: string;
  iconName: RepoProviderIconName;
  authModel: RepoProviderAuthModel;
  status: "active";
  capabilities: {
    /** Writing (PR/MR) — the code agent runs on both providers (MIN-69):
 clone, opening/merge/close of PR or MR, review, sync webhook. */
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

/** Ordered list that the picker displays. */
export const ALL_PROVIDERS: readonly RepoProviderMeta[] =
  Object.values(REPO_PROVIDERS);

/** Providers that a user can link to now. */
export const ACTIVE_PROVIDERS: readonly RepoProviderMeta[] = ALL_PROVIDERS.filter(
  (p) => p.status === "active",
);

/** Restricts an arbitrary string (e.g. DB column `provider`) to a known id. */
export function isRepoProviderId(value: unknown): value is RepoProviderId {
  return value === "github" || value === "gitlab";
}

/**
 * Short identifier of a pull request, in SA forge notation: `#30`
 * at GitHub, `!30` at GitLab. This is the proper name of the PR — the one we
 * look for in the list and in the header; the linked ticket is only
 * just a relationship that we hang on the right.
 */
export function prIdentifier(
  provider: string | null | undefined,
  number: number,
): string {
  return `${provider === "gitlab" ? "!" : "#"}${number}`;
}

/** The suffix that GitHub sticks to the login of any App. */
const BOT_SUFFIX = "[bot]";

/**
 * Separates a forge login from its bot brand. GitHub suffixes the login of
 * any App with `[bot]` — `vercel[bot]`, `dependabot[bot]`, and ours when
 * Numo comments. This suffix is ​​a TYPE TAG, not part of the name:
 * GitHub never spells it out, it displays the name then a small
 * “bot” badge. `GitLogin` does the same.
 *
 * A login that would ONLY be `[bot]` remains as is: a weird name
 * is better than a sticker without a name in front.
 *
 * Nothing to detect on the GitLab side : its bots are ordinary accounts, without
 * naming convention — the function there makes the login unchanged.
 */
export function parseForgeLogin(login: string): { name: string; isBot: boolean } {
  const trimmed = login.trim();
  if (!trimmed.toLowerCase().endsWith(BOT_SUFFIX)) return { name: trimmed, isBot: false };
  const name = trimmed.slice(0, -BOT_SUFFIX.length);
  return name ? { name, isBot: true } : { name: trimmed, isBot: false };
}

/** Resolves a `provider` value stored in metadata, by GitHub default. */
export function getRepoProvider(
  value: string | null | undefined,
): RepoProviderMeta {
  if (value && value in REPO_PROVIDERS) {
    return REPO_PROVIDERS[value as RepoProviderId];
  }
  return REPO_PROVIDERS.github;
}
