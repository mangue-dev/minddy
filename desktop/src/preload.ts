import { contextBridge, ipcRenderer } from "electron";

import type { DesktopAuthLink } from "@/lib/desktop/auth-link";
import type { DesktopBridge } from "@/lib/desktop/bridge";

/**
 * LA SURFACE, en entier (MIN-291).
 *
 * Le renderer charge du code DISTANT. Ce fichier est la seule chose qu'il peut
 * atteindre au-delà du web, et il doit se lire en trente secondes : cinq
 * membres, aucun qui rende un objet Node, aucun qui prenne un chemin de fichier,
 * aucun qui exécute quoi que ce soit. Tout passe par un message au main process,
 * qui reste libre de refuser — `openExternal` en particulier ne fait rien tant
 * que l'URL n'a pas passé la garde de navigation.
 *
 * Le type est celui que la page compile contre (`lib/desktop/bridge.ts`) :
 * l'annotation ci-dessous est ce qui empêche cet objet de dériver du contrat.
 */

const bridge: DesktopBridge = {
  // Synchrone, et une seule fois au chargement du preload : un preload en
  // `sandbox: true` n'a pas d'environnement à lire, et la version doit être là
  // avant le premier rendu.
  version: ipcRenderer.sendSync("minddy:version") as string,

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
};

contextBridge.exposeInMainWorld("minddy", bridge);
