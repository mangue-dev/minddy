import { contextBridge, ipcRenderer } from "electron";

import type { DesktopAuthLink } from "@/lib/desktop/auth-link";
import type { DesktopBridge } from "@/lib/desktop/bridge";
import type { DesktopChannel } from "@/lib/desktop/channel";
import type { DesktopUpdateStatus } from "@/lib/desktop/update-status";

/**
 * LA SURFACE, en entier (MIN-291).
 *
 * Le renderer charge du code DISTANT. Ce fichier est la seule chose qu'il peut
 * atteindre au-delà du web, et il doit se lire en trente secondes : dix
 * membres, aucun qui rende un objet Node, aucun qui prenne un chemin de fichier,
 * aucun qui exécute quoi que ce soit. Tout passe par un message au main process,
 * qui reste libre de refuser — `openExternal` en particulier ne fait rien tant
 * que l'URL n'a pas passé la garde de navigation.
 *
 * Le type est celui que la page compile contre (`lib/desktop/bridge.ts`) :
 * l'annotation ci-dessous est ce qui empêche cet objet de dériver du contrat.
 */

/**
 * La version, lue sur la ligne de commande du renderer (MIN-322).
 *
 * Elle DOIT être là avant le premier rendu — le pont est un objet figé, pas une
 * promesse —, et un preload en `sandbox: true` n'a pas d'environnement à lire.
 * Elle passait donc par un `ipcRenderer.sendSync`, qui arrête le renderer le
 * temps de l'aller-retour, au démarrage. `additionalArguments` la met dans
 * `process.argv` (cf. `webPreferences` dans main.ts) : elle est déjà là quand ce
 * fichier s'exécute, sans un seul aller-retour.
 *
 * Le `sendSync` reste en secours, et lui seul : si le drapeau manque, une
 * version vide s'afficherait dans les réglages sans que rien ne le dise.
 */
const VERSION_FLAG = "--minddy-version=";

function readVersion(): string {
  const flag = process.argv.find((arg) => arg.startsWith(VERSION_FLAG));
  if (flag) return flag.slice(VERSION_FLAG.length);
  return ipcRenderer.sendSync("minddy:version") as string;
}

const bridge: DesktopBridge = {
  version: readVersion(),

  openExternal(url: string) {
    ipcRenderer.send("minddy:open-external", url);
  },

  onAuthLink(handler: (link: DesktopAuthLink) => void) {
    const listener = (_event: unknown, link: DesktopAuthLink) => handler(link);
    ipcRenderer.on("minddy:auth-link", listener);
    // Le lien peut être arrivé AVANT que React ne soit monté : macOS lance
    // souvent l'app avec son `open-url` en poche. Le main process le garde et le
    // rejoue à cet appel — sans quoi la toute première connexion, celle qui
    // ouvre l'app, serait la seule à ne pas marcher.
    ipcRenderer.send("minddy:auth-link-ready");
    return () => {
      ipcRenderer.removeListener("minddy:auth-link", listener);
    };
  },

  setBadgeCount(count: number) {
    ipcRenderer.send("minddy:set-badge", count);
  },

  setWindowButtonsVisible(visible: boolean) {
    ipcRenderer.send("minddy:window-buttons", visible);
  },

  onWindowButtons(handler: (visible: boolean) => void) {
    const listener = (_event: unknown, visible: boolean) => handler(visible);
    ipcRenderer.on("minddy:window-buttons-state", listener);
    // Même raison que pour le deep link : l'état existe avant l'abonnement (la
    // fenêtre peut être en plein écran au chargement). Le main process le
    // rejoue plutôt que de laisser la page partir sur une supposition.
    ipcRenderer.send("minddy:window-buttons-ready");
    return () => {
      ipcRenderer.removeListener("minddy:window-buttons-state", listener);
    };
  },

  focus() {
    ipcRenderer.send("minddy:focus");
  },

  setChannel(channel: DesktopChannel) {
    ipcRenderer.send("minddy:set-channel", channel);
  },

  onUpdateStatus(handler: (status: DesktopUpdateStatus) => void) {
    const listener = (_event: unknown, status: DesktopUpdateStatus) =>
      handler(status);
    ipcRenderer.on("minddy:update-status", listener);
    // Même raison que pour les boutons macOS : le téléchargement a pu se
    // terminer avant que cette page existe — elle se recharge à chaque bascule
    // de canal, et la coquille vit des semaines. Le main process rejoue.
    ipcRenderer.send("minddy:update-status-ready");
    return () => {
      ipcRenderer.removeListener("minddy:update-status", listener);
    };
  },

  installUpdate() {
    ipcRenderer.send("minddy:install-update");
  },

  // LE DOSSIER LOCAL (MIN-359). Les trois seuls membres qui ATTENDENT une
  // réponse, d'où `invoke` là où tout le reste `send` : lire un attachement,
  // c'est relire le disque, et la page ne peut rien afficher avant.
  //
  // Aucun ne prend de chemin : `chooseLocalRepo` ouvre le panneau système, et
  // c'est le seul endroit d'où un chemin entre dans l'app.
  localRepo(input) {
    return ipcRenderer.invoke("minddy:local-repo:read", input) as Promise<
      Awaited<ReturnType<DesktopBridge["localRepo"]>>
    >;
  },

  chooseLocalRepo(input) {
    return ipcRenderer.invoke("minddy:local-repo:choose", input) as Promise<
      Awaited<ReturnType<DesktopBridge["chooseLocalRepo"]>>
    >;
  },

  forgetLocalRepo(input) {
    return ipcRenderer.invoke("minddy:local-repo:forget", input) as Promise<
      Awaited<ReturnType<DesktopBridge["forgetLocalRepo"]>>
    >;
  },

  localRepoBranches(input) {
    return ipcRenderer.invoke("minddy:local-repo:branches", input) as Promise<
      Awaited<ReturnType<NonNullable<DesktopBridge["localRepoBranches"]>>>
    >;
  },

  // LE DÉCLENCHEUR DE TOUR LOCAL (MIN-293), refusé dans l'app EMPAQUETÉE — la
  // condition vit dans le main process, pas ici : un preload est du code qu'on
  // livre, et une garde écrite du côté qui demande n'en est pas une.
  startLocalRun(input) {
    return ipcRenderer.invoke("minddy:local-run:start", input) as Promise<
      Awaited<ReturnType<DesktopBridge["startLocalRun"]>>
    >;
  },
};

contextBridge.exposeInMainWorld("minddy", bridge);
