/**
 * Le CANAL de l'app de bureau (MIN-352) — quelle version de minddy la fenêtre
 * montre.
 *
 * ## Ce que c'est, et ce que ce n'est pas
 *
 * La coquille n'embarque pas d'UI : elle est une fenêtre sur une origine. Le
 * canal ne change donc rien au binaire — il change l'ADRESSE. `stable` charge
 * `www.minddy.app` (la production), `preview` charge `preview.minddy.app` (le
 * dernier commit de `main`, avant promotion).
 *
 * Les deux servent le **même projet Supabase** : mêmes comptes, mêmes projets,
 * mêmes tickets. Basculer ne duplique rien et ne perd rien. La seule chose qui
 * ne suit pas est la SESSION — les cookies sont par origine, donc le premier
 * passage sur preview demande de se reconnecter une fois. Revenir au stable
 * retrouve la session de production, restée intacte.
 *
 * ## Pourquoi ce module est PUR
 *
 * Il est lu des deux côtés du pont : par le main process, qui décide quelle URL
 * charger (`desktop/src/main.ts`) et retient le choix sur disque
 * (`desktop/src/channel-store.ts`), et par la PAGE, qui affiche l'interrupteur
 * (`components/settings/account-preferences-section.tsx`). Aucun `electron`,
 * aucun React, aucune lecture de disque : rien que deux chaînes et la table qui
 * les relie.
 *
 * ## Le canal ne voyage pas par le pont
 *
 * La page ne DEMANDE pas dans quel canal elle est : elle le lit sur sa propre
 * origine (`desktopChannelForOrigin`). C'est la seule source qui ne puisse pas
 * mentir — un canal recopié dans le pont serait un second état à tenir
 * synchrone avec l'URL réellement chargée, et il finirait par diverger le jour
 * où une bascule échoue. Le pont n'a donc qu'un membre de plus, en écriture.
 */

import {
  DESKTOP_ORIGIN_OVERRIDE,
  DESKTOP_PREVIEW_ORIGIN,
  DESKTOP_STABLE_ORIGIN,
} from "@/lib/desktop/config";

/** `stable` = production, `preview` = la tête de `main`. */
export type DesktopChannel = "stable" | "preview";

/** Celui d'une installation neuve, et celui sur lequel on retombe au moindre doute. */
export const DESKTOP_DEFAULT_CHANNEL: DesktopChannel = "stable";

/**
 * Le canal lu d'une valeur qui vient d'AILLEURS — un fichier JSON écrit par une
 * version précédente, un message du renderer.
 *
 * Tout ce qui n'est pas exactement `"preview"` retombe sur le stable : un
 * fichier tronqué, une valeur inventée ou un canal retiré d'une version future
 * doivent ramener quelqu'un en production, jamais l'y bloquer ailleurs.
 */
export function parseDesktopChannel(raw: unknown): DesktopChannel {
  return raw === "preview" ? "preview" : DESKTOP_DEFAULT_CHANNEL;
}

/**
 * L'origine à charger pour ce canal.
 *
 * ⚠ **L'origine de dév gagne sur le canal.** Pointée sur `localhost`, la
 * coquille n'a pas deux canaux à offrir : elle a le serveur qu'on est en train
 * de lancer. Sans cette priorité, cocher la case en dév enverrait la fenêtre sur
 * la vraie preview au milieu d'une session de développement.
 */
export function desktopOriginForChannel(channel: DesktopChannel): string {
  if (DESKTOP_ORIGIN_OVERRIDE) return DESKTOP_ORIGIN_OVERRIDE;
  return channel === "preview" ? DESKTOP_PREVIEW_ORIGIN : DESKTOP_STABLE_ORIGIN;
}

/**
 * Le canal d'une origine, ou `null` quand ce n'en est aucun des deux.
 *
 * `null` n'est pas un détail : c'est le cas du dév (`localhost`), et c'est ce
 * qui dit à l'écran de réglages de **ne pas afficher l'interrupteur du tout**
 * plutôt que d'en montrer un qui ne ferait rien. Une case à cocher qu'on coche
 * et qui reste où elle était est pire que pas de case.
 */
export function desktopChannelForOrigin(origin: string): DesktopChannel | null {
  if (origin === DESKTOP_PREVIEW_ORIGIN) return "preview";
  if (origin === DESKTOP_STABLE_ORIGIN) return "stable";
  return null;
}
