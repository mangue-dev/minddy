import { app, dialog } from "electron";
import { autoUpdater } from "electron-updater";

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

export function startAutoUpdates(): void {
  // Hors app empaquetée il n'y a ni signature ni `app-update.yml` : Squirrel
  // échouerait bruyamment à chaque lancement du dev.
  if (!app.isPackaged) return;

  // On télécharge tout seul, mais on n'IMPOSE rien : l'installation attend le
  // prochain ⌘Q. Redémarrer l'app sous les doigts de quelqu'un qui écrit un
  // ticket est le genre de geste qu'on ne pardonne pas à une app de bureau.
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  // Une erreur de mise à jour n'est pas une erreur de l'app : réseau coupé, flux
  // momentanément absent, Wi-Fi d'hôtel. On la journalise et on retente au
  // prochain tour, sans jamais l'afficher — sinon la seule chose que l'app dit à
  // quelqu'un hors ligne, c'est qu'elle n'a pas pu se mettre à jour.
  autoUpdater.on("error", (error) => {
    console.error("[updater]", error);
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
    const result = await autoUpdater.checkForUpdates();
    // `updateInfo.version` est toujours renseigné ; c'est la comparaison avec la
    // version courante qui dit s'il se passe quelque chose. `downloadPromise`
    // n'existe que quand une mise à jour a réellement été retenue.
    if (result?.downloadPromise) {
      await dialog.showMessageBox({
        type: "info",
        message: `minddy ${result.updateInfo.version} is downloading.`,
        detail: "It will be installed the next time you quit and reopen minddy.",
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
