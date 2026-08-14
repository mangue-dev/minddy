import "server-only";

import { randomBytes, timingSafeEqual } from "node:crypto";

import { getServiceClient } from "@/lib/supabase-service";
import type { RepoProviderId } from "@/lib/repo-providers";
import { decryptForgeToken, encryptForgeToken } from "./token-crypto";

/**
 * Le secret du webhook GitLab, PAR DÉPÔT (MIN-333).
 *
 * Avant, `GITLAB_WEBHOOK_SECRET` était un secret unique, écrit dans le hook de
 * chaque locataire. Or GitLab MONTRE le token d'un hook à qui peut l'éditer :
 * tout mainteneur d'un dépôt lié pouvait le lire chez lui, puis forger des
 * événements pour les dépôts des autres — fusionner une merge request, faire
 * passer un ticket en « terminé », dans un projet qui ne le regarde pas. Un
 * secret partagé entre locataires n'est pas un secret, c'est un mot de passe
 * commun.
 *
 * PAR DÉPÔT et pas par liaison : chez GitLab le hook vit SUR le dépôt, et deux
 * projets qui lient le même dépôt partagent physiquement ce hook-là, donc son
 * token. Le secret est donc porté par toutes les lignes `project_git_links` du
 * même `(provider, external_repo_id)`, à la même valeur.
 *
 * Chiffré au repos avec l'enveloppe des tokens de forge — même secret de
 * dérivation, même colonne service-role uniquement.
 *
 * `GITLAB_WEBHOOK_SECRET` survit en REPLI, pour les hooks déjà posés qui le
 * portent encore : sans lui, activer cette version couperait toutes les
 * synchros existantes le temps d'une rotation. Le récepteur rote le hook au
 * premier événement qui arrive avec (cf. `rotateGitlabWebhookSecret`), et le
 * repli s'éteint de lui-même dépôt par dépôt.
 */

/** 32 octets d'entropie, en hexadécimal (GitLab accepte le token verbatim). */
export function generateWebhookSecret(): string {
  return randomBytes(32).toString("hex");
}

/** Comparaison à temps constant de deux secrets partagés verbatim. */
export function webhookSecretMatches(
  provided: string | null | undefined,
  expected: string,
): boolean {
  if (!provided || !expected) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Le repli historique, s'il est encore déployé. */
export function legacyGitlabWebhookSecret(): string | null {
  return process.env.GITLAB_WEBHOOK_SECRET || null;
}

interface LinkSecretRow {
  id: string;
  connection_id: string;
  webhook_secret_encrypted: string | null;
}

const SECRET_COLUMNS = "id, connection_id, webhook_secret_encrypted";

async function loadRepoLinks(
  provider: RepoProviderId,
  externalRepoId: string,
): Promise<LinkSecretRow[]> {
  const service = getServiceClient();
  const { data, error } = await service
    .from("project_git_links")
    .select(SECRET_COLUMNS)
    .eq("provider", provider)
    .eq("external_repo_id", externalRepoId);
  if (error) {
    console.error("[webhook-secret] links lookup failed:", error.message);
    return [];
  }
  return (data ?? []) as LinkSecretRow[];
}

/**
 * Le secret du dépôt, créé et persisté s'il n'existe pas encore. Appelé à la
 * POSE du hook — c'est la valeur qu'on écrit chez GitLab.
 *
 * Toutes les liaisons du dépôt reçoivent la même valeur : elles décrivent le
 * même hook. Si l'une d'elles en porte déjà une, c'est celle-là qui gagne — en
 * générer une seconde invaliderait le hook du voisin.
 */
export async function ensureRepoWebhookSecret(params: {
  provider: RepoProviderId;
  externalRepoId: string;
}): Promise<string> {
  const links = await loadRepoLinks(params.provider, params.externalRepoId);
  for (const link of links) {
    const existing = decryptForgeToken(link.webhook_secret_encrypted);
    if (existing) return existing;
  }
  return rotateRepoWebhookSecret(params);
}

/**
 * Force un secret NEUF sur toutes les liaisons du dépôt et le renvoie. Le hook
 * chez GitLab doit être réécrit avec, sinon plus rien ne passe la vérification —
 * l'appelant est responsable de cet ordre (secret d'abord, hook ensuite).
 */
export async function rotateRepoWebhookSecret(params: {
  provider: RepoProviderId;
  externalRepoId: string;
}): Promise<string> {
  const secret = generateWebhookSecret();
  const service = getServiceClient();
  const { error } = await service
    .from("project_git_links")
    .update({
      webhook_secret_encrypted: encryptForgeToken(secret),
      updated_at: new Date().toISOString(),
    })
    .eq("provider", params.provider)
    .eq("external_repo_id", params.externalRepoId);
  if (error) throw new Error(error.message);
  return secret;
}

/** Ce qu'une vérification de webhook a trouvé comme matière à comparer. */
export interface WebhookSecretCandidates {
  /** Les secrets propres au dépôt (un, en pratique — la liste couvre une
   *  rotation partielle entre deux liaisons du même dépôt). */
  own: string[];
  /** Le repli global, quand il est encore déployé. */
  legacy: string | null;
  /** Une connexion par laquelle on peut réécrire le hook (rotation). */
  connectionId: string | null;
}

/** Toute la matière de vérification d'un dépôt, en une requête. */
export async function loadWebhookSecrets(params: {
  provider: RepoProviderId;
  externalRepoId: string;
}): Promise<WebhookSecretCandidates> {
  const links = await loadRepoLinks(params.provider, params.externalRepoId);
  const own: string[] = [];
  for (const link of links) {
    const secret = decryptForgeToken(link.webhook_secret_encrypted);
    if (secret && !own.includes(secret)) own.push(secret);
  }
  return {
    own,
    legacy: legacyGitlabWebhookSecret(),
    connectionId: links[0]?.connection_id ?? null,
  };
}

/** Verdict d'une vérification : par quoi le jeton a-t-il été reconnu ? */
export type WebhookSecretVerdict = "own" | "legacy" | "rejected";

export function verifyWebhookToken(
  provided: string | null | undefined,
  candidates: WebhookSecretCandidates,
): WebhookSecretVerdict {
  if (candidates.own.some((secret) => webhookSecretMatches(provided, secret))) {
    return "own";
  }
  if (candidates.legacy && webhookSecretMatches(provided, candidates.legacy)) {
    return "legacy";
  }
  return "rejected";
}
