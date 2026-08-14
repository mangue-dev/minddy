import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import type { RepoProviderId } from "@/lib/repo-providers";
import { buildForgeAssigneeIndex } from "@/lib/server/git/forge-members";

/**
 * Qui a le droit de faire dépenser le propriétaire d'un projet, et combien de
 * fois (MIN-330).
 *
 * `@numo` dans un commentaire de pull request lance une relecture, et cette
 * relecture est portée par un compte minddy — celui du OWNER du projet
 * (`pr-mention.ts`). Le commentaire, lui, est écrit chez la forge : sur un dépôt
 * PUBLIC, par n'importe qui. Sans garde, un inconnu vide le quota, le budget et
 * la clé BYOK du propriétaire à coût nul, et pousse au passage du texte dans le
 * contexte de l'agent.
 *
 * Deux gardes, et elles répondent à deux questions différentes :
 *
 *  1. **Est-ce quelqu'un de la maison ?** L'auteur du commentaire doit être
 *     rattachable à un MEMBRE d'un projet qui lie ce dépôt, par son compte de
 *     forge connecté (`git_user_identities` côté GitHub, la connexion OAuth côté
 *     GitLab) — exactement le pont que la synchro d'issues utilise déjà pour
 *     assigner un ticket, réutilisé ici pour autoriser une dépense.
 *
 *     **Le défaut sur un dépôt public est le refus**, sans dérogation en v1 : un
 *     contributeur externe qui écrit `@numo` n'obtient rien, et le propriétaire
 *     garde le déclenchement par le bouton « faire vérifier par Numo ». Une
 *     allowlist par dépôt reste possible plus tard — il faudrait la poser dans
 *     `project_git_links`, et surtout une surface pour l'éditer. Tant que cette
 *     surface n'existe pas, l'ouvrir reviendrait à ouvrir pour tout le monde.
 *
 *  2. **Combien de fois ?** Un membre légitime reste borné : une identité
 *     compromise, ou une automatisation qui commente en boucle, dépenserait
 *     autant qu'un inconnu. La borne est PERSISTÉE (`claim_forge_mention`) parce
 *     que le récepteur de webhook est réparti — un compteur en mémoire ne borne
 *     que l'instance qui l'héberge.
 *
 * Rien ici ne lève : une garde qui explose ferait échouer le webhook, la forge
 * re-livrerait, et la mention repartirait en boucle. Une panne de base vaut donc
 * REFUS (fail-closed) : c'est la seule réponse qui ne transforme pas un incident
 * en drain de budget.
 */

/** Fenêtre commune aux trois compteurs. */
export const MENTION_WINDOW_SECONDS = 60 * 60;

/** Déclenchements par membre et par dépôt dans la fenêtre. */
export const MENTION_LIMIT_PER_AUTHOR = 10;

/** Déclenchements pour le dépôt entier, tous membres confondus. */
export const MENTION_LIMIT_PER_REPO = 30;

/**
 * Refus adressés à un auteur non rattaché : le premier est commenté, les
 * suivants sont silencieux. Sans ce compteur, la réponse de refus serait elle-
 * même l'amplificateur — un commentaire du bot par mention de l'attaquant.
 */
const DENIAL_LIMIT_PER_AUTHOR = 1;

/**
 * Compte ce déclenchement et rend son rang dans la fenêtre courante, ou `null`
 * si la base n'a pas répondu. `null` vaut refus chez l'appelant.
 */
async function claim(key: string): Promise<number | null> {
  try {
    const { data, error } = await getServiceClient().rpc("claim_forge_mention", {
      p_key: key,
      p_window_seconds: MENTION_WINDOW_SECONDS,
    });
    if (error) {
      console.error("[forge-mention-guard] throttle unavailable:", error.message);
      return null;
    }
    return typeof data === "number" ? data : null;
  } catch (err) {
    console.error("[forge-mention-guard] throttle failed:", (err as Error).message);
    return null;
  }
}

/**
 * L'auteur de ce commentaire est-il un membre d'un des projets qui connaissent
 * ce dépôt ? `false` sur un login absent (une charge utile sans auteur ne
 * ressemble à personne) comme sur un compte de forge que personne n'a connecté.
 */
export async function isForgeAuthorMember(params: {
  provider: RepoProviderId;
  projectIds: string[];
  authorLogin: string | null;
}): Promise<boolean> {
  const login = params.authorLogin?.trim().toLowerCase();
  if (!login) return false;
  for (const projectId of params.projectIds) {
    const index = await buildForgeAssigneeIndex({
      projectId,
      provider: params.provider,
    });
    if (index.has(login)) return true;
  }
  return false;
}

/** Ce que la garde de débit répond, et ce que l'appelant en fait. */
export interface ThrottleVerdict {
  allowed: boolean;
  /** Vrai UNE fois par fenêtre : le franchissement, le seul refus qu'on commente. */
  notify: boolean;
}

/** Clé de compteur — le dépôt qualifié par sa forge, jamais un id interne. */
function repoKey(provider: RepoProviderId, repoFullName: string): string {
  return `${provider}:${repoFullName.toLowerCase()}`;
}

/**
 * Le déclenchement d'un MEMBRE : borné par auteur ET par dépôt. Les deux
 * compteurs avancent à chaque passage — c'est voulu, une rafale doit peser sur
 * le dépôt même si elle vient de plusieurs comptes.
 */
export async function claimMemberMention(params: {
  provider: RepoProviderId;
  repoFullName: string;
  authorLogin: string | null;
}): Promise<ThrottleVerdict> {
  const repo = repoKey(params.provider, params.repoFullName);
  const login = params.authorLogin?.trim().toLowerCase() || "unknown";
  const [authorCount, repoCount] = await Promise.all([
    claim(`mention:${repo}:${login}`),
    claim(`mention:${repo}`),
  ]);
  if (authorCount == null || repoCount == null) return { allowed: false, notify: false };

  const allowed =
    authorCount <= MENTION_LIMIT_PER_AUTHOR && repoCount <= MENTION_LIMIT_PER_REPO;
  const notify =
    authorCount === MENTION_LIMIT_PER_AUTHOR + 1 ||
    repoCount === MENTION_LIMIT_PER_REPO + 1;
  return { allowed, notify };
}

/**
 * Le refus d'un NON-MEMBRE : rien ne part, et on ne le dit qu'au premier. La
 * valeur de retour ne porte donc que `notify` — `allowed` y est toujours faux.
 */
export async function claimDenialNotice(params: {
  provider: RepoProviderId;
  repoFullName: string;
  authorLogin: string | null;
}): Promise<boolean> {
  const repo = repoKey(params.provider, params.repoFullName);
  const login = params.authorLogin?.trim().toLowerCase() || "unknown";
  const count = await claim(`denied:${repo}:${login}`);
  return count != null && count <= DENIAL_LIMIT_PER_AUTHOR;
}
