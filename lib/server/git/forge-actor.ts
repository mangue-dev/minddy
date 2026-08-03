import "server-only";

import { createHash } from "node:crypto";

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
      /**
       * `noAccount` = rien de connecté ; `noRepoAccess` = 404 ; `expired` = un
       * compte est bien connecté mais la forge REFUSE son token (401).
       *
       * Les trois mènent à des phrases différentes, et confondre le dernier avec
       * autre chose est le pire des trois : c'est ce qui faisait dire à minddy
       * « votre compte git ne peut pas fusionner ce dépôt » au propriétaire du
       * dépôt (mesuré le 2026-08-03), avant de lui servir un `Bad credentials`
       * brut au premier geste.
       */
      reason: "noAccount" | "noRepoAccess" | "expired";
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

/**
 * Les tokens dont une rotation forcée n'a RIEN tiré — l'autorisation est à
 * refaire, et rien d'automatique ne la réparera.
 *
 * Sans ce garde, chacune des trois ou quatre requêtes que le panneau d'une PR
 * tire toutes les quinze secondes rejouerait la rotation, soit une quinzaine
 * d'échanges OAuth ratés par minute sur un compte déjà perdu.
 *
 * Indexé par l'EMPREINTE du token, pas par l'utilisateur : réautoriser change le
 * token, donc l'empreinte, donc le garde se lève de lui-même — là où un TTL
 * ferait attendre la fin de sa fenêtre à quelqu'un qui vient de réparer. Une
 * empreinte n'est pas un secret ; le token, lui, ne s'écrit nulle part ici.
 */
const deadTokens = new Set<string>();
const DEAD_TOKENS_MAX = 500;

function tokenFingerprint(token: string): string {
  return createHash("sha256").update(token).digest("base64url").slice(0, 22);
}

function rememberDeadToken(token: string): void {
  // Borne mémoire : un process de longue vie ne doit pas accumuler sans fin.
  // On repart de zéro plutôt que d'évincer finement — le coût d'un oubli est un
  // échange OAuth de plus, pas une erreur.
  if (deadTokens.size >= DEAD_TOKENS_MAX) deadTokens.clear();
  deadTokens.add(tokenFingerprint(token));
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
  /** Ignore l'expiry stockée et fait tourner le token : voir `resolveForgeActor`. */
  force = false,
): Promise<ActorAccount | null> {
  if (provider === "github") return getGithubUserToken(userId, { force });

  const connection = await findReusableConnection(userId, "gitlab");
  if (!connection) return null;
  try {
    const token = await getGitlabAccessToken(connection.id, { force });
    return { token, login: connection.account_login, avatarUrl: null };
  } catch (err) {
    console.warn(
      `[forge-actor] GitLab token unavailable: ${(err as Error).message}`,
    );
    return null;
  }
}

/** `expired` = la forge a refusé le token lui-même (401), pas le dépôt. */
type CapabilityProbe =
  | { outcome: "capability"; capability: RepoCapability; cacheable: boolean }
  | { outcome: "expired" };

/**
 * Appartenance au dépôt, vue par le compte de l'utilisateur.
 *
 * Les deux forges répondent **404** quand le compte ne voit pas le dépôt (elles
 * en cachent jusqu'à l'existence) : c'est le seul verdict « pas membre », et le
 * seul qu'on mette en cache.
 *
 * **401** ne parle pas du dépôt : il parle du TOKEN. Le lire comme un droit
 * dégradé — ce que faisait le repli sur `read` — produit la pire phrase possible,
 * « votre compte ne peut pas fusionner ce dépôt », adressée à quelqu'un qui en
 * est propriétaire ; puis un `Bad credentials` nu au premier geste. Un token
 * refusé se dit « reconnectez votre compte », et rien d'autre.
 *
 * Le reste — 403 (quota d'API épuisé, SSO d'organisation non validé), 5xx,
 * réponse illisible — retombe sur `read` SANS cache : une panne ou une limite de
 * débit ne doit pas se figer cinq minutes en « vous n'êtes pas membre ». Le
 * geste d'écriture, lui, échouera avec le vrai message de la forge.
 */
async function fetchCapability(
  provider: RepoProviderId,
  repoFullName: string,
  token: string,
): Promise<CapabilityProbe> {
  const response =
    provider === "github"
      ? await fetch(`${GITHUB_API_BASE}/repos/${repoFullName}`, {
          headers: githubHeaders(token),
        })
      : await fetch(
          `${GITLAB_API_BASE}/projects/${encodeURIComponent(repoFullName)}`,
          { headers: gitlabHeaders(token) },
        );

  if (response.status === 401) return { outcome: "expired" };
  if (response.status === 404) {
    return { outcome: "capability", capability: "none", cacheable: true };
  }
  if (!response.ok) {
    return { outcome: "capability", capability: "read", cacheable: false };
  }

  const json = await response.json().catch(() => null);
  return {
    outcome: "capability",
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
  let account = await resolveAccount(opts.userId, opts.provider);
  if (!account) return { kind: "none", reason: "noAccount" };

  // Token déjà constaté mort : ni probe, ni rotation. AVANT le cache de
  // capability — un droit mémorisé il y a trois minutes ne rend pas un token
  // utilisable, et le rendre ici ferait repartir un geste voué au 401.
  if (deadTokens.has(tokenFingerprint(account.token))) {
    return { kind: "none", reason: "expired", login: account.login };
  }

  const key = cacheKey(opts.userId, opts.provider, opts.repoFullName);
  const cached = capabilityCache.get(key);
  if (cached && Date.now() - cached.at < CAPABILITY_TTL_MS) {
    return cached.capability === "none"
      ? { kind: "none", reason: "noRepoAccess", login: account.login }
      : { kind: "actor", ...account, capability: cached.capability };
  }

  const probe = async (token: string): Promise<CapabilityProbe | null> => {
    try {
      return await fetchCapability(opts.provider, opts.repoFullName, token);
    } catch (err) {
      // Réseau mort : on ne prétend ni qu'il a le droit ni qu'il ne l'a pas.
      // Sans cache, la tentative suivante retentera — et l'écriture, elle,
      // échouera avec le message de la forge.
      console.warn(`[forge-actor] capability probe failed: ${(err as Error).message}`);
      return null;
    }
  };

  let probed = await probe(account.token);
  if (!probed) return { kind: "actor", ...account, capability: "read" };

  // Token refusé : l'expiry stockée mentait. Une rotation forcée rattrape le cas
  // où une course l'a laissée en base derrière un token déjà invalidé par
  // GitHub — c'est la panne qui coûtait huit heures d'écriture à l'utilisateur,
  // et elle se répare ici sans qu'il ait rien à faire. Une seule tentative : si
  // le refresh token est mort lui aussi, l'autorisation est bel et bien à
  // refaire, et c'est ce qu'on dit.
  if (probed.outcome === "expired") {
    const rotated = await resolveAccount(opts.userId, opts.provider, true);
    if (!rotated || rotated.token === account.token) {
      rememberDeadToken(account.token);
      return { kind: "none", reason: "expired", login: account.login };
    }
    account = rotated;
    probed = await probe(account.token);
    if (!probed) return { kind: "actor", ...account, capability: "read" };
    if (probed.outcome === "expired") {
      rememberDeadToken(account.token);
      return { kind: "none", reason: "expired", login: account.login };
    }
  }

  if (probed.cacheable) {
    capabilityCache.set(key, { capability: probed.capability, at: Date.now() });
  }
  if (probed.capability === "none") {
    return { kind: "none", reason: "noRepoAccess", login: account.login };
  }
  return { kind: "actor", ...account, capability: probed.capability };
}
