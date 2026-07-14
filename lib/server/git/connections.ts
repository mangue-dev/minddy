import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import type { RepoProviderId } from "@/lib/repo-providers";
import type { GitConnection } from "@/lib/types";
import { encryptGitlabToken } from "./gitlab-credentials";
import type { GitlabTokenSet } from "./gitlab-app";

/**
 * Accès aux connexions git au niveau compte (git_connections) — MIN-47. Service
 * client (RLS bypassé), la vérif utilisateur est faite ici en TS (pattern
 * api_keys). Les colonnes de tokens ne sont JAMAIS renvoyées : les fonctions
 * publiques sélectionnent des colonnes explicites, sans les secrets.
 */

/** Colonnes non-secrètes exposables à l'UI. */
const PUBLIC_COLS =
  "id, provider, account_login, account_type, installation_id, created_at, updated_at";

interface PublicRow {
  id: string;
  provider: string;
  account_login: string | null;
  account_type: string | null;
  installation_id: number | null;
  created_at: string;
  updated_at: string;
}

function toPublic(
  row: PublicRow,
  projects: GitConnection["projects"],
): GitConnection {
  return {
    id: row.id,
    provider: row.provider as RepoProviderId,
    account_login: row.account_login,
    account_type: row.account_type,
    installation_id: row.installation_id,
    created_at: row.created_at,
    updated_at: row.updated_at,
    projects,
  };
}

/**
 * Liste les connexions git de l'utilisateur (sanitisées), avec les projets qui
 * les réutilisent. Renvoie [] si aucune, null sur erreur DB.
 */
export async function listUserConnections(
  userId: string,
): Promise<GitConnection[] | null> {
  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("git_connections")
    .select(PUBLIC_COLS)
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) return null;
  const rows = (data ?? []) as PublicRow[];
  if (rows.length === 0) return [];

  // Projets liés par connexion (pour l'avertissement de déconnexion).
  const { data: links } = await supabase
    .from("project_git_links")
    .select("connection_id, projects(id, name)")
    .in(
      "connection_id",
      rows.map((r) => r.id),
    );
  const byConnection = new Map<string, GitConnection["projects"]>();
  // Supabase infère la relation to-one embarquée comme un tableau ; à l'exécution
  // c'est un objet (FK many-to-one). On cast via unknown pour refléter le runtime.
  for (const link of (links ?? []) as unknown as Array<{
    connection_id: string;
    projects: { id: string; name: string } | null;
  }>) {
    if (!link.projects) continue;
    const list = byConnection.get(link.connection_id) ?? [];
    list.push({ id: link.projects.id, name: link.projects.name });
    byConnection.set(link.connection_id, list);
  }

  return rows.map((r) => toPublic(r, byConnection.get(r.id) ?? []));
}

/**
 * Trouve une connexion réutilisable de l'utilisateur pour un provider (la plus
 * récente). Sert au flux « reuse » : ne pas refaire l'install/authorize si une
 * connexion existe déjà. Renvoie null si aucune.
 */
export async function findReusableConnection(
  userId: string,
  provider: RepoProviderId,
): Promise<{ id: string; account_login: string | null } | null> {
  const supabase = getServiceClient();
  const { data } = await supabase
    .from("git_connections")
    .select("id, account_login")
    .eq("user_id", userId)
    .eq("provider", provider)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as { id: string; account_login: string | null } | null) ?? null;
}

/**
 * Charge une connexion appartenant à l'utilisateur (colonnes publiques), ou null.
 * Sert à valider qu'une connexion référencée dans un bind appartient bien à
 * l'owner du projet.
 */
export async function getUserConnection(
  userId: string,
  connectionId: string,
): Promise<
  { id: string; provider: RepoProviderId; installation_id: number | null } | null
> {
  const supabase = getServiceClient();
  const { data } = await supabase
    .from("git_connections")
    .select("id, provider, installation_id")
    .eq("id", connectionId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) return null;
  return {
    id: data.id,
    provider: data.provider as RepoProviderId,
    installation_id: data.installation_id,
  };
}

/**
 * Upsert d'une connexion GitHub App (callback setup). installation_id est unique
 * globalement : on met à jour la ligne existante ou on insère. Renvoie l'id.
 */
export async function upsertGithubConnection(params: {
  userId: string;
  installationId: number;
  accountLogin: string | null;
  accountType: string | null;
  repositorySelection: string | null;
}): Promise<string> {
  const supabase = getServiceClient();
  const nowIso = new Date().toISOString();

  const { data: existing } = await supabase
    .from("git_connections")
    .select("id")
    .eq("installation_id", params.installationId)
    .maybeSingle();

  if (existing) {
    await supabase
      .from("git_connections")
      .update({
        user_id: params.userId,
        provider: "github",
        account_login: params.accountLogin,
        account_type: params.accountType,
        repository_selection: params.repositorySelection,
        updated_at: nowIso,
      })
      .eq("id", existing.id);
    return existing.id as string;
  }

  const { data, error } = await supabase
    .from("git_connections")
    .insert({
      user_id: params.userId,
      provider: "github",
      installation_id: params.installationId,
      account_login: params.accountLogin,
      account_type: params.accountType,
      repository_selection: params.repositorySelection,
    })
    .select("id")
    .single();
  if (error || !data) {
    throw new Error(error?.message || "Failed to store GitHub connection");
  }
  return data.id as string;
}

/**
 * Upsert d'une connexion GitLab OAuth (callback). Dé-duplique par
 * (user_id, provider, provider_account_id) : reconnexion du même compte → update
 * des tokens. Renvoie l'id.
 */
export async function upsertGitlabConnection(params: {
  userId: string;
  providerAccountId: string;
  accountLogin: string | null;
  tokens: GitlabTokenSet;
}): Promise<string> {
  const supabase = getServiceClient();
  const nowIso = new Date().toISOString();
  const tokenFields = {
    access_token_encrypted: encryptGitlabToken(params.tokens.accessToken),
    refresh_token_encrypted: encryptGitlabToken(params.tokens.refreshToken),
    token_expires_at: params.tokens.expiresAt,
    oauth_scopes: params.tokens.scope,
  };

  const { data: existing } = await supabase
    .from("git_connections")
    .select("id")
    .eq("user_id", params.userId)
    .eq("provider", "gitlab")
    .eq("provider_account_id", params.providerAccountId)
    .maybeSingle();

  if (existing) {
    await supabase
      .from("git_connections")
      .update({
        account_login: params.accountLogin,
        ...tokenFields,
        updated_at: nowIso,
      })
      .eq("id", existing.id);
    return existing.id as string;
  }

  const { data, error } = await supabase
    .from("git_connections")
    .insert({
      user_id: params.userId,
      provider: "gitlab",
      provider_account_id: params.providerAccountId,
      account_login: params.accountLogin,
      ...tokenFields,
    })
    .select("id")
    .single();
  if (error || !data) {
    throw new Error(error?.message || "Failed to store GitLab connection");
  }
  return data.id as string;
}

/**
 * Supprime une connexion de l'utilisateur (déconnexion au niveau compte). Les
 * project_git_links pointant dessus tombent en cascade (ON DELETE CASCADE).
 * Renvoie false si la connexion n'existe pas / n'appartient pas à l'utilisateur.
 */
export async function deleteConnection(
  userId: string,
  connectionId: string,
): Promise<boolean> {
  const supabase = getServiceClient();
  const { data } = await supabase
    .from("git_connections")
    .delete()
    .eq("id", connectionId)
    .eq("user_id", userId)
    .select("id")
    .maybeSingle();
  return !!data;
}
