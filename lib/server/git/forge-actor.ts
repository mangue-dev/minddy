import "server-only";

import type { RepoProviderId } from "@/lib/repo-providers";
import { GITHUB_API_BASE, githubHeaders } from "./github-rest";
import { GITLAB_API_BASE, gitlabHeaders } from "./gitlab-rest";
import { getGithubUserToken } from "./user-identities";
import { getGitlabAccessToken } from "./gitlab-app";
import { findReusableConnection } from "./connections";
import {
  githubCapabilityFromRepo,
  gitlabCapabilityFromProject,
  type RepoCapability,
} from "./repo-capability";

/**
 * L'ACTEUR d'un geste humain sur une pull request (MIN-144) : le token du compte
 * git de l'utilisateur connecté, plus ce qu'il a le droit de faire sur ce dépôt.
 *
 * C'est le second porteur de `PrScope`. Le premier — `target.token`, token
 * d'installation GitHub ou OAuth du LIEN GitLab — continue de servir aux
 * lectures et à tout ce que fait Numo : l'agent EST minddy, il doit rester le
 * bot. La ligne de partage est *humain vs agent*, pas *écriture vs lecture*.
 *
 * Côté GitLab, l'acteur corrige au passage un vrai bug d'identité :
 * `resolveRepoCloneTargetForRepo` prend la connexion portée par le LIEN de
 * projet — celle de qui a lié le dépôt. Un membre B écrivait donc sous
 * l'identité GitLab du membre A. Ici, c'est SA propre connexion, jamais celle du
 * lien.
 */

export type ForgeActor =
  | {
      kind: "actor";
      token: string;
      login: string | null;
      avatarUrl: string | null;
      capability: RepoCapability;
    }
  | {
      kind: "none";
      /** `noAccount` = rien de connecté (ou à reconnecter) ; `noRepoAccess` = 404. */
      reason: "noAccount" | "noRepoAccess";
      login?: string | null;
    };

/**
 * Cache in-process du VERDICT d'appartenance, par (userId, provider, dépôt).
 * TTL court : le droit d'un compte sur un dépôt bouge rarement, mais quand il
 * bouge, cinq minutes est le pire délai acceptable.
 *
 * Il ne garde QUE la capability, jamais le token : le mint a déjà son propre
 * cache (ligne DB côté GitHub, refresh paresseux côté GitLab), et cacher un
 * token ici le ferait survivre à une déconnexion.
 */
const CAPABILITY_TTL_MS = 5 * 60_000;
const capabilityCache = new Map<string, { capability: RepoCapability; at: number }>();

function cacheKey(userId: string, provider: RepoProviderId, repoFullName: string) {
  return `${userId}:${provider}:${repoFullName}`;
}

/** Le login/avatar du compte, pour les dire dans l'UI sans second aller-retour. */
interface ActorAccount {
  token: string;
  login: string | null;
  avatarUrl: string | null;
}

/**
 * Mint du token du compte de CET utilisateur, ou null s'il n'en a pas connecté
 * (ou si le token est irrécupérable : secret tourné, refresh mort — l'appelant
 * en fait « reconnecte ton compte », jamais une 500).
 */
async function resolveAccount(
  userId: string,
  provider: RepoProviderId,
): Promise<ActorAccount | null> {
  if (provider === "github") return getGithubUserToken(userId);

  const connection = await findReusableConnection(userId, "gitlab");
  if (!connection) return null;
  try {
    const token = await getGitlabAccessToken(connection.id);
    return { token, login: connection.account_login, avatarUrl: null };
  } catch (err) {
    console.warn(
      `[forge-actor] GitLab token unavailable: ${(err as Error).message}`,
    );
    return null;
  }
}

/**
 * Appartenance au dépôt, vue par le compte de l'utilisateur.
 *
 * Les deux forges répondent **404** quand le compte ne voit pas le dépôt (elles
 * en cachent jusqu'à l'existence) : c'est le seul verdict « pas membre », et le
 * seul qu'on mette en cache.
 *
 * Tout le reste — 403 (quota d'API épuisé, SSO d'organisation non validé), 5xx,
 * réponse illisible — retombe sur `read` SANS cache : une panne ou une limite de
 * débit ne doit pas se figer cinq minutes en « vous n'êtes pas membre ». Le
 * geste d'écriture, lui, échouera avec le vrai message de la forge.
 */
async function fetchCapability(
  provider: RepoProviderId,
  repoFullName: string,
  token: string,
): Promise<{ capability: RepoCapability; cacheable: boolean }> {
  const response =
    provider === "github"
      ? await fetch(`${GITHUB_API_BASE}/repos/${repoFullName}`, {
          headers: githubHeaders(token),
        })
      : await fetch(
          `${GITLAB_API_BASE}/projects/${encodeURIComponent(repoFullName)}`,
          { headers: gitlabHeaders(token) },
        );

  if (response.status === 404) return { capability: "none", cacheable: true };
  if (!response.ok) return { capability: "read", cacheable: false };

  const json = await response.json().catch(() => null);
  return {
    capability:
      provider === "github"
        ? githubCapabilityFromRepo(json)
        : gitlabCapabilityFromProject(json),
    cacheable: true,
  };
}

/**
 * Qui agit, et jusqu'où. Ne lève jamais : toute panne se traduit en refus
 * explicite que l'UI sait expliquer.
 */
export async function resolveForgeActor(opts: {
  userId: string;
  provider: RepoProviderId;
  repoFullName: string;
}): Promise<ForgeActor> {
  const account = await resolveAccount(opts.userId, opts.provider);
  if (!account) return { kind: "none", reason: "noAccount" };

  const key = cacheKey(opts.userId, opts.provider, opts.repoFullName);
  const cached = capabilityCache.get(key);
  if (cached && Date.now() - cached.at < CAPABILITY_TTL_MS) {
    return cached.capability === "none"
      ? { kind: "none", reason: "noRepoAccess", login: account.login }
      : { kind: "actor", ...account, capability: cached.capability };
  }

  let probed: { capability: RepoCapability; cacheable: boolean };
  try {
    probed = await fetchCapability(opts.provider, opts.repoFullName, account.token);
  } catch (err) {
    // Réseau mort : on ne prétend ni qu'il a le droit ni qu'il ne l'a pas. Sans
    // cache, la tentative suivante retentera — et l'écriture, elle, échouera
    // avec le message de la forge.
    console.warn(`[forge-actor] capability probe failed: ${(err as Error).message}`);
    return { kind: "actor", ...account, capability: "read" };
  }

  if (probed.cacheable) {
    capabilityCache.set(key, { capability: probed.capability, at: Date.now() });
  }
  if (probed.capability === "none") {
    return { kind: "none", reason: "noRepoAccess", login: account.login };
  }
  return { kind: "actor", ...account, capability: probed.capability };
}
