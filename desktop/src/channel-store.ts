import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { app } from "electron";

import {
  DESKTOP_DEFAULT_CHANNEL,
  parseDesktopChannel,
  type DesktopChannel,
} from "@/lib/desktop/channel";

/**
 * Le canal choisi, retenu d'un lancement à l'autre (MIN-352).
 *
 * **Un fichier JSON, et pas les cookies ni le `localStorage` de la page** :
 * le canal EST l'origine, il faut donc le connaître avant d'avoir chargé quoi
 * que ce soit — un réglage rangé dans la page qui le sert ne se lirait jamais
 * assez tôt pour décider quelle page servir. Il vit donc dans `userData`, à côté
 * de la session et des caches, sous le nom d'app posé par `main.ts`.
 *
 * ⚠ Ce dossier CHANGE en développement (`minddy-dev`, cf. `app.setName`) : une
 * session de dév ne peut pas basculer le canal de l'app installée, et c'est très
 * bien ainsi.
 *
 * Lecture et écriture **synchrones**, et c'est délibéré : la lecture doit être
 * finie avant `createWindow`, et l'écriture avant le rechargement qui la suit.
 * Le fichier fait quarante octets.
 */

const FILE_NAME = "channel.json";

function channelFile(): string {
  return path.join(app.getPath("userData"), FILE_NAME);
}

/**
 * Le canal sur disque, ou le stable.
 *
 * **Tout échec retombe sur le stable, en silence** : fichier absent (première
 * ouverture, le cas normal), JSON tronqué par un arrêt brutal, dossier en
 * lecture seule. Aucun de ces cas ne justifie d'empêcher l'app de s'ouvrir, et
 * le repli va toujours vers la production.
 */
export function readDesktopChannel(): DesktopChannel {
  try {
    const raw: unknown = JSON.parse(readFileSync(channelFile(), "utf8"));
    if (typeof raw !== "object" || raw === null) return DESKTOP_DEFAULT_CHANNEL;
    return parseDesktopChannel((raw as { channel?: unknown }).channel);
  } catch {
    return DESKTOP_DEFAULT_CHANNEL;
  }
}

/**
 * Retient le canal. Rend `false` si l'écriture a échoué — l'appelant bascule
 * quand même la fenêtre, mais le choix ne survivra pas au prochain lancement, et
 * c'est une chose qu'on veut voir dans les logs plutôt que découvrir au
 * redémarrage.
 */
export function writeDesktopChannel(channel: DesktopChannel): boolean {
  try {
    writeFileSync(channelFile(), `${JSON.stringify({ channel }, null, 2)}\n`, "utf8");
    return true;
  } catch (error) {
    console.error("[channel] écriture impossible", error);
    return false;
  }
}
