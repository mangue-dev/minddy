import { app, dialog, type BrowserWindow } from "electron";
import { autoUpdater } from "electron-updater";

import {
  updatePromptChoice,
  updatePromptCopy,
} from "@/lib/desktop/update-prompt";
import {
  manualDesktopUpdateMessage,
  supportsAutomaticDesktopUpdates,
} from "@/lib/desktop/update-platform";
import {
  IDLE_UPDATE_STATUS,
  reduceUpdateStatus,
  type DesktopUpdateEvent,
  type DesktopUpdateStatus,
} from "@/lib/desktop/update-status";

/**
 * Shell updates (MIN-292) — §5 from docs/desktop-electron.md.
 *
 * **What the app updates is itself, not minddy.** The UI lives on
 * `www.minddy.app` and is delivered by `git push`; here we only replace the binary
 * when the shell changes — twice a year, plus a major Electron every
 * every eight weeks. Hence the pace, which does not have to be tight.
 *
 * **Squirrel.Mac REQUIRES a signed app.** The signature is therefore not only the
 * formality of the first launch: it is what allows the app to be updated afterwards. An unsigned build that tries to still fails on a
 * code check error, without saying anything useful — hence the
 * abort of `startAutoUpdates` outside the packaged app.
 *
 * The feed URL is NOT here. electron-builder copies it into
 * `app-update.yml`, inside the bundle, from the `publish` block of
 * desktop/electron-builder.yml — and `autoUpdater` reads it by itself. A URL
 * written twice is a URL that will diverge.
 */

/**
 * ⚠ **NAMED import, and only at the point of use.** Two traps stand here, and both are ONLY seen in the packaged app:
 *
 * 1. `electron-updater` declares itself `__esModule: true` but **does not export from
 * `default`**. A `import electronUpdater from "electron-updater"` compiles
 * without a word and returns `undefined` at runtime — the main process dies on
 * loading, on a box "A JavaScript error occurred in the main
 * process" and nothing else.
 * 2. `autoUpdater` is a **lazy getter** that constructs a `MacUpdater` on
 * first access, and this constructor calls `app.getVersion()`. Reading it at
 * module level (`const { autoUpdater } = …`) would therefore cause it to execute
 * before Electron is ready. The named import is compiled into an access to
 * property at the place where it is used: it is never triggered before.
 */

/** Six o'clock. A shell that moves twice a year doesn't need anything better. */
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

/** The window to attach the install proposal to, when there is one. */
let ownerWindow: () => BrowserWindow | null = () => null;

/**
 * The state, held HERE and not in the page (MIN-353).
 *
 * The renderer always arrives after the fact - it is reloaded at each reload,
 * at each channel switch - while the shell lives for weeks.
 * It is therefore the only one of the two which can remember that a version is waiting for
 * on disk.
 */
let status: DesktopUpdateStatus = IDLE_UPDATE_STATUS;

/** The current state, for the replay requested by a subscriber who has just arrived. */
export function currentUpdateStatus(): DesktopUpdateStatus {
  return status;
}

/**
 * Reduces the event, and only announces if something has changed.
 *
 * `reduceUpdateStatus` returns the PREVIOUS object when nothing changes (an already ready version re-announced by the six-hour check): equality de
 * reference is therefore exactly the test you need, and it avoids waking up
 * the sidebar every six hours to tell it the same thing again.
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

/** Replay, TARGETED at the subscriber who requests it — same reason as macOS buttons. */
export function replayUpdateStatus(target: Electron.WebContents): void {
  sendStatus(target);
}

/**
 * What the sidebar line triggers.
 *
 * It does NOT restart the app: it reopens the native box, which asks for the
 * last yes. A remote page that would restart the application of one
 * `postMessage` would be a bridge member of a completely different nature than the other nine
 * — and "installing" without confirmation on a single sidebar click is not what we want anyway.
 *
 * No effect if nothing is ready: the file is not there, there is nothing to
 * to propose.
 */
export function requestInstall(): void {
  if (status.state !== "ready") return;
  void promptInstall(status.version);
}

export function startAutoUpdates(owner: () => BrowserWindow | null): void {
  ownerWindow = owner;

  // Outside of the packaged app there is neither signature nor `app-update.yml`: Squirrel
  // would fail loudly every time the dev launches.
  if (
    !app.isPackaged ||
    !supportsAutomaticDesktopUpdates({
      platform: process.platform,
      appImagePath: process.env.APPIMAGE,
    })
  ) return;

  // We download alone, but we don't IMPOSE anything: the installation is REQUIRED
  // once the download is finished (`update-downloaded` below), and a refusal
  // leave it to the next ⌘Q. Restarting the app under the fingers of someone who
  // writing a ticket is the kind of gesture you can't forgive in a gaming app
  // bureau.
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  // **The net of `autoInstallOnAppQuit` was not enough, and this is the form of
  // the app that says it**: ⌘W the CACHE, the red light too (main.ts). An app of
  // office that you never close, never leave — so never install, and
  // without saying it. The new version remained on the disk for weeks.
  //
  // ⚠ **Only once per version.** `update-downloaded` is only issued at the end
  // of a download, but the check runs every six hours and
  // nothing prevents electron-updater from redownloading after an error
  // resume. Propose the same version every six hours to someone who has
  // saying “later” transforms it into an interruption.
  autoUpdater.on("update-downloaded", (info) => {
    // The state, ALWAYS: it’s what brings the sidebar line to life
    // long after the box has been returned. Only the box is holding back.
    publish({ kind: "downloaded", version: info.version });
    if (promptedVersion === info.version) return;
    promptedVersion = info.version;
    void promptInstall(info.version);
  });

  // An update error is not an app error: network cut, flow
  // temporarily absent, hotel Wi-Fi. We journal it and try again
  // next turn, without ever displaying it — otherwise the only thing the app says to
  // someone offline means it couldn't update.
  autoUpdater.on("error", (error) => {
    console.error("[updater]", error);
    // The page doesn't say anything either: `reduceUpdateStatus` removes the line
    // of the current download and LEAVE that of a version already ready.
    publish({ kind: "error" });
  });

  // Detection, even before the file is there: it is the first of the two
  // states that the sidebar shows. Nothing to click at that moment — but we
  // sees that something is happening, and the wait ceases to be silence.
  autoUpdater.on("update-available", (info) => {
    publish({ kind: "available", version: info.version });
  });

  // ⚠ `checkForUpdates()` reports TWICE: the `error` event above, AND
  // a rejected promise. Subscribing to one does not exempt you from catching the other —
  // a `void` left a `UnhandledPromiseRejectionWarning` for each
  // offline verification, and Node reserves the right to make them fatal. Measure
  // in the packaged app, not inferred.
  const check = () => autoUpdater.checkForUpdates().catch(() => {});

  void check();
  setInterval(check, CHECK_INTERVAL_MS);
}

/** The version already proposed, so as not to repropose it every round. */
let promptedVersion: string | null = null;

/**
 * "minddy 0.9.5 is ready" — the proposal, and the restart if accepted.
 *
 * The box attaches to the window when it is VISIBLE, and floats alone otherwise:
 * a modal sheet placed on a hidden window is an app that no longer responds
 * to nothing, without anything being displayed.
 *
 * ⚠ `setImmediate` before `quitAndInstall`: called from the
 * `update-downloaded` manager, it leaves the app while electron-updater is still in
 *unwinding his own headphones. The next loop lets it
 * finish — this is the precaution that electron-updater documents, and it costs
 * nothing.
 *
 * Nothing to do with the refusal: `autoInstallOnAppQuit` remains true, the update is
 * already on the disk, it will land on the next ⌘Q.
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
 * The REQUESTED verification, from the menu — the only one that has the right to answer
 * “you are up to date”. That's the difference with the one above: here
 * someone asked the question, so silence would be a breakdown.
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

  const manualUpdateMessage = manualDesktopUpdateMessage(process.platform);
  if (
    !supportsAutomaticDesktopUpdates({
      platform: process.platform,
      appImagePath: process.env.APPIMAGE,
    }) &&
    manualUpdateMessage
  ) {
    await dialog.showMessageBox({
      type: "info",
      message: "Updates are managed outside the app.",
      detail: manualUpdateMessage,
    });
    return;
  }

  try {
    // A version already downloaded and POSTPONED is the case that we catch up here:
    // someone who reopens this menu after saying "later" comes
    // specifically ask for the install button again. `checkForUpdates` does not
    // would restart nothing – the file is there – and would therefore respond “up to date”, this
    // which is false and dead end.
    if (status.state === "ready") {
      await promptInstall(status.version);
      return;
    }

    const result = await autoUpdater.checkForUpdates();
    // `updateInfo.version` is always specified; this is the comparison with the
    // version courante qui dit s'il se passe quelque chose. `downloadPromise`
    // only exists when an update has actually been retained.
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
