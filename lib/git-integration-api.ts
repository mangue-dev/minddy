"use client";

import type { RepoProviderId } from "./repo-providers";
import type {
  CandidateRepo,
  GitConnection,
  ProjectGitLink,
} from "./types";

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

export async function unlinkGitRepoApi(projectId: string): Promise<void> {
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

export async function disconnectGitConnectionApi(id: string): Promise<void> {
  await parseJson(
    await fetch(`/api/account/git-connections/${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),
  );
}
