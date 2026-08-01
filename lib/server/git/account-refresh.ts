import "server-only";

import {
  findReusableConnection,
  listUserInstallations,
  updateConnectionAccount,
} from "./connections";
import { getInstallationAccount } from "./github-app";
import { getGithubUserAccount } from "./github-user-auth";
import { getGitlabAccessToken, getGitlabUser } from "./gitlab-app";
import { getGithubUserToken, updateIdentityAccount } from "./user-identities";

/**
 * Tenir à jour le NOM des comptes de forge (MIN-154).
 *
 * Depuis que l'identité se joint sur `provider_account_id`, le login n'est plus
 * une clé — mais il reste ce que l'utilisateur lit dans ses réglages, et il
 * était écrit une fois pour toutes à la connexion du compte. Après un renommage
 * chez GitHub ou GitLab, minddy affichait un nom qui n'était plus celui de
 * personne.
 *
 * On le rafraîchit LÀ OÙ IL S'AFFICHE — les deux routes GET des réglages — et
 * nulle part ailleurs. Pas sur le chemin chaud des routes PR : `resolveForgeActor`
 * y sonde déjà la capability du dépôt, et cette sonde ne dit pas qui porte le
 * token ; y greffer le rafraîchissement coûterait un `GET /user` de plus à chaque
 * requête. Pas non plus au refresh de token : un token d'App GitHub peut être
 * non expirant, et ce chemin ne s'exécute alors jamais.
 */

/**
 * Anti-rafales in-process, sur le modèle du `capabilityCache` de `forge-actor.ts` :
 * ouvrir ses réglages, changer d'onglet et revenir ne doit pas rejouer trois
 * appels de forge. Dix minutes est un délai large pour un nom qui bouge une fois
 * par an, et court devant la durée de vie d'un process.
 *
 * En mémoire, pas en base : `updated_at` ne peut pas servir de marqueur (il bouge
 * à chaque rotation de token, et jamais pour un token permanent), et ce garde ne
 * mérite pas une colonne. Le pire cas d'un process neuf est un appel de plus.
 *
 * On garde la PASSE, pas seulement sa date : la page des réglages monte les deux
 * requêtes ensemble (`useGitIdentitiesQuery` + `useGitConnectionsQuery` dans
 * `account-git-identity-section.tsx`), et un garde qui ne saurait dire que
 * « quelqu'un s'en occupe » laisserait la seconde lire les lignes d'AVANT
 * l'écriture — le nom périmé s'afficherait sur le chargement même qui devait le
 * corriger. Attendre une passe déjà terminée ne coûte rien : la promesse est
 * résolue.
 */
const REFRESH_TTL_MS = 10 * 60_000;
const refreshByUser = new Map<string, { at: number; done: Promise<void> }>();

/** Le compte GitHub personnel : le token fait autorité sur id, login et avatar. */
async function refreshGithubIdentity(userId: string): Promise<void> {
  const credentials = await getGithubUserToken(userId);
  if (!credentials) return;
  const account = await getGithubUserAccount(credentials.token);
  await updateIdentityAccount(userId, "github", {
    // Réécrit tel quel : ça rattrape au passage un `provider_account_id` nul.
    providerAccountId: String(account.id),
    accountLogin: account.login || null,
    accountAvatarUrl: account.avatarUrl,
  });
}

/** Côté GitLab, la connexion OAuth EST l'identité de la personne. */
async function refreshGitlabConnection(userId: string): Promise<void> {
  const connection = await findReusableConnection(userId, "gitlab");
  if (!connection) return;
  const token = await getGitlabAccessToken(connection.id);
  const user = await getGitlabUser(token);
  await updateConnectionAccount(connection.id, {
    providerAccountId: String(user.id),
    accountLogin: user.username || null,
  });
}

/**
 * Les installations de l'App — le compte SUR lequel elle est installée, pas
 * celui de l'utilisateur : rien à minter, le JWT d'App suffit.
 *
 * `getInstallationAccount` rend null quand l'appel échoue (installation
 * révoquée, App non configurée) : on ne touche à rien plutôt que d'effacer le
 * nom affiché.
 */
async function refreshGithubInstallations(userId: string): Promise<void> {
  const connections = await listUserInstallations(userId);
  for (const connection of connections) {
    const account = await getInstallationAccount(connection.installation_id);
    if (!account?.login) continue;
    await updateConnectionAccount(connection.id, {
      accountLogin: account.login,
      accountType: account.type,
      repositorySelection: account.repositorySelection,
    });
  }
}

/**
 * Les trois branches, en parallèle. Chacune est rattrapée séparément : une forge
 * muette laisse le nom d'hier à l'écran, elle n'emporte pas les deux autres — et
 * cette promesse-ci ne rejette donc JAMAIS, ce dont dépend son partage plus bas.
 */
async function runRefresh(userId: string): Promise<void> {
  const branches: [string, Promise<void>][] = [
    ["github identity", refreshGithubIdentity(userId)],
    ["gitlab connection", refreshGitlabConnection(userId)],
    ["github installations", refreshGithubInstallations(userId)],
  ];
  await Promise.all(
    branches.map(([label, task]) =>
      task.catch((err: unknown) => {
        console.warn(
          `[account-refresh] ${label} refresh failed: ${(err as Error).message}`,
        );
      }),
    ),
  );
}

/**
 * Recale les noms de tous les comptes de forge de cet utilisateur, best-effort
 * de bout en bout : une forge muette laisse le nom d'hier à l'écran, elle ne
 * fait jamais échouer la page des réglages. Ne lève donc JAMAIS.
 *
 * Rend la main quand les lignes sont à jour — pas avant. C'est ce que l'appelant
 * attend : il LIT juste après.
 */
export async function refreshForgeAccountNames(userId: string): Promise<void> {
  const now = Date.now();
  const pending = refreshByUser.get(userId);
  // Une passe de la fenêtre ne se rejoue pas ; si elle court encore, on l'attend
  // au lieu de la doubler — ou de lire par-dessus son épaule.
  if (pending && now - pending.at < REFRESH_TTL_MS) {
    await pending.done;
    return;
  }
  // Posée AVANT l'attente : deux chargements concurrents n'en déclenchent qu'une,
  // et le second attend LA MÊME. Une passe qui échoue garde sa place dans la
  // fenêtre : on ne matraque pas une forge en panne à chaque rechargement.
  const done = runRefresh(userId);
  refreshByUser.set(userId, { at: now, done });
  await done;
}
