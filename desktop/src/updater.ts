import { app, dialog, type BrowserWindow } from "electron";
import { autoUpdater } from "electron-updater";

import {
  updatePromptChoice,
  updatePromptCopy,
} from "@/lib/desktop/update-prompt";
import {
  IDLE_UPDATE_STATUS,
  reduceUpdateStatus,
  type DesktopUpdateEvent,
  type DesktopUpdateStatus,
} from "@/lib/desktop/update-status";

/**
 * Les mises à jour de la coquille (MIN-292) — §5 de docs/desktop-electron.md.
 *
 * **Ce que l'app met à jour, c'est elle-même, pas minddy.** L'UI vit sur
 * `www.minddy.app` et se livre par `git push` ; ici on ne remplace le binaire que
 * quand la coquille change — deux fois par an, plus une majeure Electron toutes
 * les huit semaines. D'où le rythme, qui n'a pas à être serré.
 *
 * **Squirrel.Mac EXIGE une app signée.** La signature n'est donc pas seulement la
 * formalité du premier lancement : c'est ce qui permet à l'app de se mettre à
 * jour ensuite. Une build non signée qui essaierait quand même échoue sur une
 * erreur de vérification de code, sans rien dire d'utile — d'où le renoncement
 * franc de `startAutoUpdates` hors app empaquetée.
 *
 * L'URL du flux n'est PAS ici. electron-builder la recopie dans
 * `app-update.yml`, à l'intérieur du bundle, à partir du bloc `publish` de
 * desktop/electron-builder.yml — et `autoUpdater` le lit tout seul. Une URL
 * écrite deux fois est une URL qui divergera.
 */

/**
 * ⚠ **Import NOMMÉ, et rien qu'au point d'usage.** Deux pièges se tiennent la
 * main ici, et les deux ne se voient QUE dans l'app empaquetée :
 *
 * 1. `electron-updater` se déclare `__esModule: true` mais **n'exporte pas de
 *    `default`**. Un `import electronUpdater from "electron-updater"` compile
 *    sans un mot et rend `undefined` à l'exécution — le main process meurt au
 *    chargement, sur une boîte « A JavaScript error occurred in the main
 *    process » et rien d'autre.
 * 2. `autoUpdater` est un **getter paresseux** qui construit un `MacUpdater` au
 *    premier accès, et ce constructeur appelle `app.getVersion()`. Le lire au
 *    niveau du module (`const { autoUpdater } = …`) le ferait donc s'exécuter
 *    avant qu'Electron soit prêt. L'import nommé, lui, se compile en un accès de
 *    propriété à l'endroit où on s'en sert : il ne se déclenche jamais avant.
 */

/** Six heures. Une coquille qui bouge deux fois par an n'a pas besoin de mieux. */
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

/** La fenêtre à qui attacher la proposition d'installer, quand il y en a une. */
let ownerWindow: () => BrowserWindow | null = () => null;

/**
 * L'état, tenu ICI et pas dans la page (MIN-353).
 *
 * Le renderer arrive toujours après coup — il se remonte à chaque rechargement,
 * à chaque bascule de canal — alors que la coquille, elle, vit des semaines.
 * Elle est donc la seule des deux qui puisse se souvenir qu'une version attend
 * sur le disque.
 */
let status: DesktopUpdateStatus = IDLE_UPDATE_STATUS;

/** L'état courant, pour le rejeu demandé par un abonné qui vient d'arriver. */
export function currentUpdateStatus(): DesktopUpdateStatus {
  return status;
}

/**
 * Réduit l'événement, et n'annonce que si quelque chose a bougé.
 *
 * `reduceUpdateStatus` rend l'objet PRÉCÉDENT quand rien ne change (une version
 * déjà prête réannoncée par la vérification des six heures) : l'égalité de
 * référence est donc exactement le test qu'il faut, et elle évite de réveiller
 * la barre latérale toutes les six heures pour lui redire la même chose.
 */
function publish(event: DesktopUpdateEvent): void {
  const next = reduceUpdateStatus(status, event);
  if (next === status) return;
  status = next;
  sendStatus();
}

function sendStatus(target?: Electron.WebContents): void {
  (target ?? ownerWindow()?.webContents)?.send("minddy:update-status", status);
}

/** Le rejeu, CIBLÉ sur l'abonné qui le demande — même motif que les boutons macOS. */
export function replayUpdateStatus(target: Electron.WebContents): void {
  sendStatus(target);
}

/**
 * Ce que la ligne de la barre latérale déclenche.
 *
 * Elle ne relance PAS l'app : elle rouvre la boîte native, qui demande le
 * dernier oui. Une page distante qui ferait redémarrer l'application d'un
 * `postMessage` serait un membre de pont d'une tout autre nature que les neuf
 * autres — et « installer » sans confirmation sur un simple clic de barre
 * latérale n'est de toute façon pas ce qu'on veut.
 *
 * Sans effet si rien n'est prêt : le fichier n'est pas là, il n'y a rien à
 * proposer.
 */
export function requestInstall(): void {
  if (status.state !== "ready") return;
  void promptInstall(status.version);
}

export function startAutoUpdates(owner: () => BrowserWindow | null): void {
  ownerWindow = owner;

  // Hors app empaquetée il n'y a ni signature ni `app-update.yml` : Squirrel
  // échouerait bruyamment à chaque lancement du dev.
  if (!app.isPackaged) return;

  // On télécharge tout seul, mais on n'IMPOSE rien : l'installation se DEMANDE
  // une fois le téléchargement fini (`update-downloaded` plus bas), et un refus
  // la laisse au prochain ⌘Q. Redémarrer l'app sous les doigts de quelqu'un qui
  // écrit un ticket est le genre de geste qu'on ne pardonne pas à une app de
  // bureau.
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  // **Le filet de `autoInstallOnAppQuit` ne suffisait pas, et c'est la forme de
  // l'app qui le dit** : ⌘W la CACHE, le feu rouge aussi (main.ts). Une app de
  // bureau qu'on ne ferme jamais ne quitte jamais — donc n'installait jamais, et
  // sans le dire. La version neuve restait sur le disque des semaines.
  //
  // ⚠ **Une seule fois par version.** `update-downloaded` n'est émis qu'à la fin
  // d'un téléchargement, mais la vérification tourne toutes les six heures et
  // rien n'interdit à electron-updater de retélécharger après une erreur de
  // reprise. Reproposer la même version toutes les six heures à quelqu'un qui a
  // dit « plus tard », c'est la transformer en interruption.
  autoUpdater.on("update-downloaded", (info) => {
    // L'état, TOUJOURS : c'est lui qui fait vivre la ligne de la barre latérale
    // longtemps après que la boîte a été renvoyée. Seule la boîte se retient.
    publish({ kind: "downloaded", version: info.version });
    if (promptedVersion === info.version) return;
    promptedVersion = info.version;
    void promptInstall(info.version);
  });

  // Une erreur de mise à jour n'est pas une erreur de l'app : réseau coupé, flux
  // momentanément absent, Wi-Fi d'hôtel. On la journalise et on retente au
  // prochain tour, sans jamais l'afficher — sinon la seule chose que l'app dit à
  // quelqu'un hors ligne, c'est qu'elle n'a pas pu se mettre à jour.
  autoUpdater.on("error", (error) => {
    console.error("[updater]", error);
    // La page, elle, ne dit rien non plus : `reduceUpdateStatus` retire la ligne
    // du téléchargement en cours et LAISSE celle d'une version déjà prête.
    publish({ kind: "error" });
  });

  // La détection, avant même que le fichier soit là : c'est le premier des deux
  // états que la barre latérale montre. Rien à cliquer à ce moment-là — mais on
  // voit qu'il se passe quelque chose, et l'attente cesse d'être un silence.
  autoUpdater.on("update-available", (info) => {
    publish({ kind: "available", version: info.version });
  });

  // ⚠ `checkForUpdates()` signale DEUX FOIS : l'événement `error` ci-dessus, ET
  // une promesse rejetée. S'abonner à l'un ne dispense pas d'attraper l'autre —
  // un `void` laissait une `UnhandledPromiseRejectionWarning` à chaque
  // vérification hors ligne, et Node se réserve de les rendre fatales. Mesuré
  // dans l'app empaquetée, pas déduit.
  const check = () => autoUpdater.checkForUpdates().catch(() => {});

  void check();
  setInterval(check, CHECK_INTERVAL_MS);
}

/** La version déjà proposée, pour ne pas la reproposer à chaque tour. */
let promptedVersion: string | null = null;

/**
 * « minddy 0.9.5 est prêt » — la proposition, et le redémarrage s'il est accepté.
 *
 * La boîte s'attache à la fenêtre quand elle est VISIBLE, et flotte seule sinon :
 * une feuille modale posée sur une fenêtre cachée est une app qui ne répond plus
 * à rien, sans que rien ne soit affiché.
 *
 * ⚠ `setImmediate` avant `quitAndInstall` : appelé depuis le gestionnaire de
 * `update-downloaded`, il quitte l'app pendant qu'electron-updater est encore en
 * train de dérouler ses propres écouteurs. Le tour de boucle suivant lui laisse
 * finir — c'est la précaution que documente electron-updater, et elle ne coûte
 * rien.
 *
 * Rien à faire du refus : `autoInstallOnAppQuit` reste vrai, la mise à jour est
 * déjà sur le disque, elle se posera au prochain ⌘Q.
 */
async function promptInstall(version: string): Promise<void> {
  const copy = updatePromptCopy(version);
  const window = ownerWindow();
  const { response } = await (window && window.isVisible()
    ? dialog.showMessageBox(window, copy)
    : dialog.showMessageBox(copy));
  if (updatePromptChoice(response) !== "install") return;
  setImmediate(() => autoUpdater.quitAndInstall());
}

/**
 * La vérification DEMANDÉE, depuis le menu — la seule qui a le droit de répondre
 * « vous êtes à jour ». C'est toute la différence avec celle du dessus : ici
 * quelqu'un a posé la question, donc le silence serait une panne.
 */
export async function checkForUpdatesFromMenu(): Promise<void> {
  if (!app.isPackaged) {
    await dialog.showMessageBox({
      type: "info",
      message: "Updates only work in the installed app.",
      detail: "This window was launched from the repository.",
    });
    return;
  }

  try {
    // Une version déjà téléchargée et REPORTÉE est le cas qu'on rattrape ici :
    // quelqu'un qui rouvre ce menu après avoir dit « plus tard » vient
    // précisément redemander le bouton d'installation. `checkForUpdates` ne
    // relancerait rien — le fichier est là — et répondrait donc « à jour », ce
    // qui est faux et sans issue.
    if (status.state === "ready") {
      await promptInstall(status.version);
      return;
    }

    const result = await autoUpdater.checkForUpdates();
    // `updateInfo.version` est toujours renseigné ; c'est la comparaison avec la
    // version courante qui dit s'il se passe quelque chose. `downloadPromise`
    // n'existe que quand une mise à jour a réellement été retenue.
    if (result?.downloadPromise) {
      await dialog.showMessageBox({
        type: "info",
        message: `minddy ${result.updateInfo.version} is downloading.`,
        detail:
          "minddy will offer to install it as soon as the download is done.",
      });
      return;
    }
    await dialog.showMessageBox({
      type: "info",
      message: `minddy ${app.getVersion()} is up to date.`,
    });
  } catch (error) {
    await dialog.showMessageBox({
      type: "warning",
      message: "Could not check for updates.",
      detail: error instanceof Error ? error.message : String(error),
    });
  }
}
