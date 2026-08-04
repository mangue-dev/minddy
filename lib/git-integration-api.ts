"use client";

import type { RepoProviderId } from "./repo-providers";
import type {
  AgentBranchesResponse,
  BranchDeletionResult,
  CandidateRepo,
  GitConnection,
  GitIdentity,
  ProjectGitLink,
} from "./types";
import { trackEvent } from "./analytics";

async function parseJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!response.ok) {
    const message =
      (data as { error?: string } | null)?.error || text.trim() || "Request failed";
    throw new Error(message);
  }
  return data as T;
}

// ── Niveau projet (paramètres du projet) ────────────────────────────────────

export interface ProviderConnectInfo {
  id: RepoProviderId;
  /** Le provider est configuré côté serveur (env présentes). */
  configured: boolean;
  /** Connexion réutilisable de l'owner pour ce provider (ou null). */
  connection: { id: string; account_login: string | null } | null;
}

export interface ProjectGitLinkResponse {
  link: ProjectGitLink | null;
  isOwner: boolean;
  providers: ProviderConnectInfo[];
}

export type StartConnectResponse =
  | { mode: "reuse"; connectionId: string }
  | { mode: "install" | "oauth"; url: string };

export async function fetchProjectGitLinkApi(
  projectId: string,
): Promise<ProjectGitLinkResponse> {
  return parseJson(await fetch(`/api/projects/${projectId}/git-link`));
}

/** Les projets qui ont un dépôt lié — ceux où l'agent peut travailler. */
export async function fetchGitLinkedProjectsApi(): Promise<{ projectIds: string[] }> {
  return parseJson(await fetch(`/api/projects/git-linked`));
}

export async function fetchGitCandidatesApi(
  projectId: string,
  connectionId: string,
): Promise<{ candidates: CandidateRepo[] }> {
  return parseJson(
    await fetch(
      `/api/projects/${projectId}/git-link?candidates=${encodeURIComponent(connectionId)}`,
    ),
  );
}

export async function startGitConnectApi(
  projectId: string,
  provider: RepoProviderId,
): Promise<StartConnectResponse> {
  return parseJson(
    await fetch(`/api/projects/${projectId}/git-link`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "start", provider }),
    }),
  );
}

export async function bindGitRepoApi(
  projectId: string,
  connectionId: string,
  externalRepoId: string,
): Promise<{ link: ProjectGitLink }> {
  return parseJson(
    await fetch(`/api/projects/${projectId}/git-link`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "bind",
        connection_id: connectionId,
        external_repo_id: externalRepoId,
      }),
    }),
  );
}

/**
 * Bascule la synchro unidirectionnelle des issues du dépôt lié (MIN-97).
 * Renvoie la liaison rafraîchie — le backfill, lui, tourne côté serveur après
 * la réponse et arrive par le realtime.
 */
export async function setGitIssueSyncApi(
  projectId: string,
  enabled: boolean,
  provider: RepoProviderId,
): Promise<{ link: ProjectGitLink | null }> {
  trackEvent("project_git_issue_sync_toggled", { provider, enabled });
  return parseJson(
    await fetch(`/api/projects/${projectId}/git-link`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "issue_sync", enabled }),
    }),
  );
}

/**
 * Toutes les branches que minddy a poussées sur le dépôt lié et qui existent
 * encore (MIN-102), avec leur état. Le serveur recalcule cette liste au moment
 * de supprimer : ce qu'on affiche ici n'est qu'une proposition, pas une
 * autorisation.
 */
export async function fetchAgentBranchesApi(
  projectId: string,
): Promise<AgentBranchesResponse> {
  return parseJson(await fetch(`/api/projects/${projectId}/git-link/agent-branches`));
}

export async function deleteAgentBranchesApi(
  projectId: string,
  branches: string[],
  provider: RepoProviderId,
): Promise<{ results: BranchDeletionResult[] }> {
  const res = await parseJson<{ results: BranchDeletionResult[] }>(
    await fetch(`/api/projects/${projectId}/git-link/agent-branches`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ branches }),
    }),
  );
  const deleted = res.results.filter((r) => r.ok).length;
  trackEvent("project_git_branches_cleaned", {
    provider,
    deleted,
    failed: res.results.length - deleted,
  });
  return res;
}

export async function unlinkGitRepoApi(projectId: string): Promise<void> {
  trackEvent("project_git_unlinked", { provider: "unknown" });
  await parseJson(
    await fetch(`/api/projects/${projectId}/git-link`, { method: "DELETE" }),
  );
}

// ── Niveau compte (paramètres du compte) ────────────────────────────────────

export interface GitConnectionsResponse {
  connections: GitConnection[];
  providers: { id: RepoProviderId; configured: boolean }[];
}

export async function fetchGitConnectionsApi(): Promise<GitConnectionsResponse> {
  return parseJson(await fetch("/api/account/git-connections"));
}

/**
 * Démarre une connexion git au niveau COMPTE — depuis les paramètres du compte,
 * ou depuis le wizard de création (MIN-62), qui choisit un dépôt avant que le
 * projet existe. `mode: "reuse"` = aucune sortie de page ; les deux autres modes
 * quittent l'app, l'appelant sauve son brouillon avant de suivre `url`.
 *
 * `origin` dit d'où l'on part, et donc où le callback ramène — table close côté
 * serveur. Les deux appelants le passent en clair : un défaut silencieux
 * renverrait le wizard sur la mauvaise page sans que rien ne le signale.
 */
export async function startAccountGitConnectApi(
  provider: RepoProviderId,
  origin: "wizard" | "settings",
): Promise<StartConnectResponse> {
  return parseJson(
    await fetch("/api/account/git-connections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "start", provider, origin }),
    }),
  );
}

/** Dépôts candidats d'une connexion du compte (même liste, sans projet). */
export async function fetchAccountGitCandidatesApi(
  connectionId: string,
): Promise<{ candidates: CandidateRepo[] }> {
  return parseJson(
    await fetch(
      `/api/account/git-connections?candidates=${encodeURIComponent(connectionId)}`,
    ),
  );
}

export async function disconnectGitConnectionApi(id: string): Promise<void> {
  trackEvent("git_connection_removed", { provider: "unknown" });
  await parseJson(
    await fetch(`/api/account/git-connections/${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),
  );
}

// ── Compte git personnel (identité des gestes de PR, MIN-144) ───────────────

export interface GitIdentitiesResponse {
  identities: GitIdentity[];
  providers: { id: RepoProviderId; configured: boolean }[];
}

export async function fetchGitIdentitiesApi(): Promise<GitIdentitiesResponse> {
  return parseJson(await fetch("/api/account/git-identities"));
}

/**
 * Démarre l'autorisation du compte git personnel. Toujours une sortie de page
 * (l'utilisateur autorise chez la forge) : l'appelant suit `url`. `origin` dit
 * d'où il part, et donc où le callback le ramène — table close côté serveur.
 */
export async function startGitIdentityConnectApi(
  provider: RepoProviderId,
  origin?: "settings" | "pr",
): Promise<{ url: string }> {
  trackEvent("git_identity_connect_started", { provider });
  return parseJson(
    await fetch("/api/account/git-identities", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "start", provider, origin }),
    }),
  );
}

export async function disconnectGitIdentityApi(
  id: string,
  provider: RepoProviderId,
): Promise<void> {
  trackEvent("git_identity_removed", { provider });
  await parseJson(
    await fetch(`/api/account/git-identities/${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),
  );
}
