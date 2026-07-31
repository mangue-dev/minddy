import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import type { RepoProviderId } from "@/lib/repo-providers";
import type { GitIdentity } from "@/lib/types";
import { decryptForgeToken, encryptForgeToken } from "./token-crypto";
import {
  refreshGithubUserToken,
  type GithubUserTokenSet,
} from "./github-user-auth";

/**
 * Le compte git PERSONNEL d'un utilisateur minddy (MIN-144), table
 * `git_user_identities`. C'est lui qui signe les gestes humains sur une pull
 * request — là où `git_connections` dit « l'App est installée sur ce compte ».
 *
 * Service client (RLS bypassée), la vérification utilisateur est faite ici en TS
 * (pattern `connections.ts`). Les colonnes de tokens ne sortent JAMAIS : les
 * fonctions publiques sélectionnent des colonnes explicites, sans les secrets.
 *
 * GitHub uniquement pour l'instant : côté GitLab, la connexion OAuth de
 * `git_connections` EST déjà l'identité de la personne (cf. `forge-actor.ts`).
 */

/** Rafraîchir quand le token est dans cette fenêtre d'expiry. */
const REFRESH_SKEW_MS = 5 * 60 * 1000;

/** Colonnes non-secrètes exposables à l'UI. */
const PUBLIC_COLS = "id, provider, account_login, account_avatar_url, created_at";

interface PublicRow {
  id: string;
  provider: string;
  account_login: string | null;
  account_avatar_url: string | null;
  created_at: string;
}

function toPublic(row: PublicRow): GitIdentity {
  return {
    id: row.id,
    provider: row.provider as RepoProviderId,
    account_login: row.account_login,
    account_avatar_url: row.account_avatar_url,
    created_at: row.created_at,
    source: "identity",
  };
}

/**
 * Tous les comptes git de l'utilisateur, sanitisés — GitHub depuis
 * `git_user_identities`, GitLab depuis sa connexion OAuth de `git_connections`
 * (qui EST déjà son identité : la dupliquer ferait diverger deux rotations de
 * token). [] si aucun, null sur erreur DB.
 */
export async function listUserIdentities(
  userId: string,
): Promise<GitIdentity[] | null> {
  const supabase = getServiceClient();
  const [identities, gitlab] = await Promise.all([
    supabase
      .from("git_user_identities")
      .select(PUBLIC_COLS)
      .eq("user_id", userId)
      .order("created_at", { ascending: false }),
    supabase
      .from("git_connections")
      .select("id, account_login, created_at")
      .eq("user_id", userId)
      .eq("provider", "gitlab")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (identities.error) return null;

  const rows = ((identities.data ?? []) as PublicRow[])
    // Une éventuelle ligne GitLab ici ne ferait pas autorité : la connexion, si.
    .filter((r) => r.provider !== "gitlab")
    .map(toPublic);
  const gitlabRow = gitlab.data as
    | { id: string; account_login: string | null; created_at: string }
    | null;
  if (gitlabRow) {
    rows.push({
      id: gitlabRow.id,
      provider: "gitlab",
      account_login: gitlabRow.account_login,
      account_avatar_url: null,
      created_at: gitlabRow.created_at,
      source: "connection",
    });
  }
  return rows;
}

/**
 * Enregistre (ou remplace) le compte git autorisé par l'utilisateur. Unique par
 * `(user_id, provider)` : réautoriser un autre compte GitHub remplace le
 * précédent — c'est bien « MON compte git », au singulier.
 */
export async function upsertUserIdentity(params: {
  userId: string;
  provider: RepoProviderId;
  providerAccountId: string;
  accountLogin: string | null;
  accountAvatarUrl: string | null;
  tokens: GithubUserTokenSet;
}): Promise<string> {
  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("git_user_identities")
    .upsert(
      {
        user_id: params.userId,
        provider: params.provider,
        provider_account_id: params.providerAccountId,
        account_login: params.accountLogin,
        account_avatar_url: params.accountAvatarUrl,
        access_token_encrypted: encryptForgeToken(params.tokens.accessToken),
        refresh_token_encrypted: params.tokens.refreshToken
          ? encryptForgeToken(params.tokens.refreshToken)
          : null,
        token_expires_at: params.tokens.expiresAt,
        oauth_scopes: params.tokens.scope,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,provider" },
    )
    .select("id")
    .single();
  if (error || !data) {
    throw new Error(error?.message || "Failed to store git user identity");
  }
  return data.id as string;
}

/**
 * Déconnecte le compte git d'un provider. Renvoie false si l'utilisateur n'en
 * avait aucun — l'appelant en fait un 404.
 */
export async function deleteUserIdentity(
  userId: string,
  identityId: string,
): Promise<boolean> {
  const supabase = getServiceClient();
  const { data } = await supabase
    .from("git_user_identities")
    .delete()
    .eq("id", identityId)
    .eq("user_id", userId)
    .select("id")
    .maybeSingle();
  return !!data;
}

interface TokenRow {
  id: string;
  account_login: string | null;
  account_avatar_url: string | null;
  access_token_encrypted: string | null;
  refresh_token_encrypted: string | null;
  token_expires_at: string | null;
}

async function loadTokenRow(
  userId: string,
  provider: RepoProviderId,
): Promise<TokenRow | null> {
  const supabase = getServiceClient();
  const { data } = await supabase
    .from("git_user_identities")
    .select(
      "id, account_login, account_avatar_url, access_token_encrypted, " +
        "refresh_token_encrypted, token_expires_at",
    )
    .eq("user_id", userId)
    .eq("provider", provider)
    .maybeSingle();
  return (data as TokenRow | null) ?? null;
}

/** Le compte GitHub d'un utilisateur, token frais compris. */
export interface GithubUserCredentials {
  token: string;
  login: string | null;
  avatarUrl: string | null;
}

/**
 * Token GitHub utilisateur valide, ou **null** — jamais d'exception : aucun
 * compte connecté, une enveloppe indéchiffrable (secret tourné) et un refresh
 * mort se disent tous « reconnecte ton compte » en amont, pas 500.
 *
 * Deux mondes selon la configuration de l'App :
 *  • « Expire user authorization tokens » ACTIVÉ → expiry à 8 h + refresh token,
 *    rafraîchi paresseusement sous `REFRESH_SKEW_MS` ;
 *  • désactivé → `token_expires_at` null et AUCUN refresh token : le token est
 *    permanent, on le déchiffre et on le rend tel quel.
 *
 * Persistance en compare-and-set sur `token_expires_at` (le refresh token de
 * GitHub est single-use rotatif, comme celui de GitLab) : le perdant d'une
 * course relit la ligne et réutilise le token du gagnant.
 */
export async function getGithubUserToken(
  userId: string,
): Promise<GithubUserCredentials | null> {
  const row = await loadTokenRow(userId, "github");
  if (!row) return null;
  const account = { login: row.account_login, avatarUrl: row.account_avatar_url };
  const withToken = (token: string | null) => (token ? { token, ...account } : null);

  // Token permanent : l'App n'expire pas ses autorisations.
  if (row.token_expires_at == null) {
    return withToken(decryptForgeToken(row.access_token_encrypted));
  }

  const nowMs = Date.now();
  if (Date.parse(row.token_expires_at) - nowMs > REFRESH_SKEW_MS) {
    const token = decryptForgeToken(row.access_token_encrypted);
    if (token) return withToken(token);
    // Déchiffrement échoué (secret tourné / corruption) → on tente un refresh.
  }

  const refreshToken = decryptForgeToken(row.refresh_token_encrypted);
  if (!refreshToken) return null;

  let refreshed: GithubUserTokenSet;
  try {
    refreshed = await refreshGithubUserToken(refreshToken);
  } catch (err) {
    // Course de rotation single-use : un autre worker a rafraîchi en premier. On
    // relit ; si l'expiry stockée a AVANCÉ, son token est frais — on le reprend.
    const recovered = await loadTokenRow(userId, "github");
    if (
      recovered &&
      recovered.token_expires_at != null &&
      recovered.token_expires_at !== row.token_expires_at
    ) {
      const token = decryptForgeToken(recovered.access_token_encrypted);
      if (token) return withToken(token);
    }
    console.warn(
      `[user-identities] GitHub token refresh failed: ${(err as Error).message}`,
    );
    return null;
  }

  const supabase = getServiceClient();
  await supabase
    .from("git_user_identities")
    .update({
      access_token_encrypted: encryptForgeToken(refreshed.accessToken),
      refresh_token_encrypted: refreshed.refreshToken
        ? encryptForgeToken(refreshed.refreshToken)
        : null,
      token_expires_at: refreshed.expiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq("id", row.id)
    .eq("token_expires_at", row.token_expires_at);
  return { token: refreshed.accessToken, ...account };
}
