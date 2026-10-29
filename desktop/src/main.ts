import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import {
  BrowserWindow,
  Menu,
  Notification as NativeNotification,
  app,
  autoUpdater as nativeAutoUpdater,
  dialog,
  ipcMain,
  nativeTheme,
  powerMonitor,
  pushNotifications,
  session,
  type WebContents,
} from "electron";

import { parseDesktopAuthLink } from "@/lib/desktop/auth-link";
import { createDesktopAuthLinkDelivery } from "@/lib/desktop/auth-link-delivery";
import { discoverLocalModels } from "@/lib/desktop/local-models";
import {
  DESKTOP_APP_NAME,
  DESKTOP_BUNDLE_ID,
  DESKTOP_ENTRY_PATH,
  DESKTOP_ORIGIN,
  DESKTOP_PROTOCOL,
  desktopProtocolArguments,
  withDesktopUserAgent,
} from "@/lib/desktop/config";
import { windowCloseAction } from "@/lib/desktop/hide-window";
import { desktopTestBackground } from "@/lib/desktop/test-background";
import {
  linuxDesktopPaths,
  prepareLinuxDesktopPaths,
} from "@/lib/desktop/linux-paths";
import { microphoneRequestAllowed } from "@/lib/desktop/media-guard";
import { navigationDecision } from "@/lib/desktop/nav-guard";
import {
  DesktopLocalNotificationRegistry,
  desktopLocalNotificationUrl,
  parseDesktopLocalNotification,
  parseDesktopLocalNotificationId,
} from "@/lib/desktop/local-notification";
import {
  isLinuxBackgroundLaunch,
  readLinuxBackgroundPreference,
  syncLinuxBackgroundAutostart,
  writeLinuxBackgroundPreference,
  type LinuxBackgroundNotificationState,
} from "@/lib/desktop/linux-background";
import { notificationCapabilitiesForPlatform } from "@/lib/desktop/notification-capabilities";
import { parseDesktopOpenLink } from "@/lib/desktop/open-link";
import { WINDOWS_STORE_DEEP_LINK } from "@/lib/desktop/install-prompt";
import {
  nativeNotificationSettingsUrl,
  nativePushContent,
} from "@/lib/desktop/native-push";
import {
  desktopServerUnavailableHtml,
  isDesktopServerUnavailable,
} from "@/lib/desktop/server-unavailable";
import { createRendererRecovery, desktopRendererRecoveryHtml } from "@/lib/desktop/renderer-recovery";
import { createWindowStallRecovery } from "@/lib/desktop/window-stall-recovery";
import { loadLocalRecoveryDocument } from "@/lib/desktop/local-recovery-load";
import { loadDesktopWindow } from "@/lib/desktop/window-load";
import { createLocalStartupSelection } from "@/lib/desktop/local-startup-selection";
import { installMessage, type InstallMessage } from "@/lib/desktop/local-installer";
import { mayReceiveLocalSession } from "@/lib/desktop/local-account";
import { isServerChoiceDocument, serverChoiceUrl } from "@/lib/desktop/server-choice";
import { routeDisposition } from "@/lib/desktop/window-routes";
import { parseWnsHelperChannel } from "@/lib/desktop/wns";
import {
  OPAQUE_WINDOW_BACKGROUND,
  TRANSPARENT_WINDOW_BACKGROUND,
  desktopWindowMaterial,
  windowMaterialFlag,
  windowMaterialForWindow,
  windowMaterialOptions,
  type DesktopWindowMaterialState,
} from "@/lib/desktop/window-material";
import { parseWindowsStoreUpdateProbe } from "@/lib/desktop/windows-store-update";
import {
  desktopWindowFrameOptions,
  desktopTitleBarOverlay,
  desktopDocumentChrome,
  MACOS_TRAFFIC_LIGHT_POSITION,
  rememberableWindowChrome,
  startupIntegratedChrome,
  windowChromeReplacement,
  type RememberedWindowChrome,
} from "@/lib/desktop/window-frame";
import { resetRetiredDesktopChannel } from "./channel-store";
import {
  disableNativePush,
  nativePushAllowed,
  pushInstallationId,
  setNativePushAllowed,
} from "./push-installation-store";
import { hideWindow } from "./hide-window";
import {
  attachLocalRepo,
  describeLocalRepo,
  detachLocalRepo,
  localBranches,
  localSkills,
  localSkill,
} from "./local-repo";
import { buildAppMenu } from "./menu";
import { installEditContextMenu } from "./edit-context-menu";
import { registerServerChoiceIpc, registerServerChoiceScheme, serveServerChoicePage } from "./server-choice";
import { localAccountSession } from "./local-account";
import {
  LOCAL_INSTALL_RELEASE,
  cancelLocalInstall,
  checkLocalPrerequisites,
  chooseInstallFolder,
  installFolder,
  localInstallRunning,
  runLocalInstall,
} from "./local-installer";
import {
  LOCAL_SELF_HOST_ORIGIN,
  ownsLocalRuntime,
  readLocalRuntimeRoot,
  startLocalRuntime,
  stopLocalRuntime,
  validateLocalRuntimeRoot,
  writeLocalRuntimeRoot,
} from "./local-runtime";
import {
  readDesktopServerOrigin,
  writeDesktopServerOrigin,
} from "./server-store";
import { readWindowChrome, writeWindowChrome } from "./window-chrome-store";
import { readWindowMaterialEnabled, writeWindowMaterialEnabled } from "./window-material-store";
import { desktopShellFontDataUrl } from "./shell-font";
import {
  checkForUpdatesManually,
  replayUpdateStatus,
  requestInstall,
  startAutoUpdates,
} from "./updater";
import { trace } from "./trace";
import { openDesktopExternal } from "./open-external";
import { grantDesktopMicrophoneAccess } from "./microphone-access";

/**
 * Minddy's shell (MIN-291) — §2 from docs/desktop-electron.md.
 *
 * The main `BrowserWindow` loads the selected minddy origin, so the desktop app
 * and web interface stay identical. The only local screen is the small server
 * picker owned by the shell; it contains no product UI and exposes only the IPC
 * call that validates and stores an origin.
 *
 * Everything decided here is decided on PURE functions of `lib/desktop/`,
 * tested after the repository: this file is just wiring, and it is
 * deliberate — it lives in users and updates twice a year.
 */

let pendingOpenPath: string | null = null;
let mainWindow: BrowserWindow | null = null;
let localRuntimeGeneration = 0;
const authLinkDelivery = createDesktopAuthLinkDelivery({
  currentRenderer: () => mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed()
    ? mainWindow.webContents.id : null,
  send: (link) => mainWindow?.webContents.send("minddy:auth-link", link),
});
const integratedFrames = new WeakMap<BrowserWindow, boolean>();
const documentChrome = new Map<number, boolean>();
/** The frame the selected origin's last document asked for (Windows and Linux). */
let rememberedChrome: RememberedWindowChrome | null = null;

/** Writes the observation only when it changes: most launches write nothing. */
function rememberWindowChrome(next: RememberedWindowChrome | null): void {
  if (!next) return;
  if (rememberedChrome?.origin === next.origin && rememberedChrome.integrated === next.integrated) return;
  rememberedChrome = next;
  writeWindowChrome(next);
}
/**
 * The blurred material behind the window chrome (MIN-810). Read once before
 * the first window; the preference and the system's reduced-transparency or
 * high-contrast settings then change it live on every window.
 */
let windowMaterialEnabled = true;
function currentWindowMaterial(): DesktopWindowMaterialState {
  return desktopWindowMaterial(process.platform, os.release(), {
    enabled: windowMaterialEnabled,
    reducedTransparency: nativeTheme.prefersReducedTransparency || nativeTheme.shouldUseHighContrastColors,
  });
}
/** The material each window was last painted with (its creation options first). */
const appliedWindowMaterial = new WeakMap<BrowserWindow, DesktopWindowMaterialState["kind"]>();

/**
 * Repaints every window with the material in force and tells their pages. A
 * full-screen window keeps the opaque window (`windowMaterialForWindow`), and
 * gets its material back when it leaves full screen.
 */
function applyWindowMaterial(): void {
  const global = currentWindowMaterial();
  for (const window of BrowserWindow.getAllWindows()) {
    if (window.isDestroyed()) continue;
    const state = windowMaterialForWindow(global, window.isFullScreen());
    const changed = state.kind !== (appliedWindowMaterial.get(window) ?? "none");
    appliedWindowMaterial.set(window, state.kind);
    if (changed) {
      // The material first, the transparent color last: the window never
      // shows the desktop unblurred in between.
      if (process.platform === "darwin") {
        window.setVibrancy(state.kind === "vibrancy" ? "sidebar" : null);
      } else if (process.platform === "win32" && state.supported) {
        window.setBackgroundMaterial(state.kind === "acrylic" ? "acrylic" : "none");
      }
      window.setBackgroundColor(state.kind === "none" ? OPAQUE_WINDOW_BACKGROUND : TRANSPARENT_WINDOW_BACKGROUND);
    }
    if (!window.webContents.isDestroyed()) window.webContents.send("minddy:window-material-state", state);
  }
}
const localNotifications = new DesktopLocalNotificationRegistry();
/** Electron closes windows before `before-quit` during an updater relaunch. */
let quittingForUpdate = false;
let quitting = false;
/** Only one APNs registration at a time, shared between site mounts. */
let apnsRegistration: Promise<string> | null = null;
/** One WNS channel request at a time; each new process still obtains a fresh URI. */
let wnsRegistration: Promise<string | null> | null = null;
const backgroundLaunchRequested =
  process.platform === "linux" && isLinuxBackgroundLaunch(process.argv);
let linuxBackgroundEnabled = false;
let linuxAutostartInstalled = false;
let nativeNotificationsAvailable = true;
let windowsStoreUpdateAvailable = false;

const WNS_HELPER_TIMEOUT_MS = 5 * 60 * 1000;
const STORE_UPDATE_HELPER_TIMEOUT_MS = 90 * 1000;
const STORE_UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

function isWnsHelperAvailable(): boolean {
  return (
    process.platform === "win32" &&
    app.isPackaged &&
    existsSync(path.join(process.resourcesPath, "wns", "minddy-wns.exe"))
  );
}

function runWnsHelper(args: string[]): Promise<string | null> {
  if (!isWnsHelperAvailable()) {
    return Promise.resolve(null);
  }
  const executable = path.join(process.resourcesPath, "wns", "minddy-wns.exe");
  return new Promise((resolve) => {
    execFile(
      executable,
      args,
      { windowsHide: true, timeout: WNS_HELPER_TIMEOUT_MS, maxBuffer: 64 * 1024 },
      (error, stdout) => {
        if (error) {
          console.error("[push/wns] native_helper_failed");
          resolve(null);
          return;
        }
        resolve(stdout);
      },
    );
  });
}

async function requestWnsChannel(): Promise<string | null> {
  return parseWnsHelperChannel(await runWnsHelper(["channel"]));
}

function isWindowsStoreUpdateHelperAvailable(): boolean {
  return (
    process.platform === "win32" &&
    app.isPackaged &&
    process.windowsStore &&
    existsSync(
      path.join(
        process.resourcesPath,
        "store-update",
        "minddy-store-update.exe",
      ),
    )
  );
}

function checkWindowsStoreUpdate(): Promise<boolean | null> {
  if (!isWindowsStoreUpdateHelperAvailable()) return Promise.resolve(null);
  const executable = path.join(
    process.resourcesPath,
    "store-update",
    "minddy-store-update.exe",
  );
  return new Promise((resolve) => {
    execFile(
      executable,
      [],
      {
        windowsHide: true,
        timeout: STORE_UPDATE_HELPER_TIMEOUT_MS,
        maxBuffer: 16 * 1024,
      },
      (error, stdout) => {
        if (error) {
          console.error(
            "[updater/store] native_helper_failed",
          );
          resolve(null);
          return;
        }
        resolve(parseWindowsStoreUpdateProbe(stdout)?.available ?? null);
      },
    );
  });
}

function startWindowsStoreUpdateChecks(): void {
  if (!isWindowsStoreUpdateHelperAvailable()) return;
  const check = async () => {
    const available = await checkWindowsStoreUpdate();
    if (available === null || available === windowsStoreUpdateAvailable) return;
    windowsStoreUpdateAvailable = available;
    mainWindow?.webContents.send(
      "minddy:windows-store-update-status",
      available,
    );
  };
  void check();
  setInterval(check, STORE_UPDATE_CHECK_INTERVAL_MS);
}

/**
 * The origin the window shows: minddy Cloud, or the server the person chose.
 *
 * Everything that speaks of origin in this file - the navigation guard, the
 * loadings, the micro permission - reads `origin`, never the constant, without
 * which half of the app would stay on minddy Cloud while the window displays a
 * custom server. A navigation guard that compares to the wrong origin returns
 * the entire app to the system browser: this is the kind of fault that is only
 * seen on the first click.
 */
let origin: string = DESKTOP_ORIGIN;
let customServerOrigin: string | null = null;

function currentLinuxBackgroundState(): LinuxBackgroundNotificationState | null {
  if (process.platform !== "linux" || !app.isPackaged) return null;
  return {
    enabled: linuxBackgroundEnabled,
    autostartInstalled: linuxAutostartInstalled,
    nativeBannersAvailable: nativeNotificationsAvailable,
  };
}

function setNativeNotificationsAvailable(available: boolean): void {
  if (nativeNotificationsAvailable === available) return;
  nativeNotificationsAvailable = available;
  const state = currentLinuxBackgroundState();
  if (state && mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("minddy:linux-background:changed", state);
  }
}

function rebuildAppMenu(): void {
  if (!mainWindow) return;
  buildAppMenu(mainWindow, {
    origin,
    isCustom: customServerOrigin !== null,
    // Wrapped: a menu click passes the menu item as first argument.
    choose: () => showServerChoice(),
    useCloud: useMinddyCloud,
  });
}

/**
 * Shows the self-hosting choice in the main window: the app's own page at
 * `minddy-app://welcome/`, bundled with the app so it works offline. Opened
 * from **Self-host minddy** under the auth forms, the menu and Settings; the
 * app itself starts on minddy Cloud. The main process only answers the page's
 * bridge calls (`server-choice.ts`).
 */
function showServerChoice(): void {
  if (!mainWindow) return;
  loadDesktopWindow(mainWindow, serverChoiceUrl(origin));
  revealWindow(mainWindow);
}

function registerServerChoice(): void {
  registerServerChoiceIpc({
    contents: () => (mainWindow && !mainWindow.isDestroyed() ? mainWindow.webContents : null),
    state: () => ({
      origin,
      cloudOrigin: DESKTOP_ORIGIN,
      isCustomServer: customServerOrigin !== null,
      installFolder: installFolder(),
      installRunning: localInstallRunning(),
      release: LOCAL_INSTALL_RELEASE,
    }),
    useCloud: useMinddyCloud,
    connect: setCustomServer,
    useExistingInstallation: useLocalMinddy,
    prerequisites: checkLocalPrerequisites,
    chooseInstallFolder: () => (mainWindow ? chooseInstallFolder(mainWindow) : Promise.resolve({})),
    install: async (report) => {
      const result = await runLocalInstall(report);
      if (!result.root) return { error: result.error };
      writeLocalRuntimeRoot(result.root);
      writeDesktopServerOrigin(LOCAL_SELF_HOST_ORIGIN);
      // The app signs its own account in on the way (`minddy:local-account:session`);
      // a release without that keeps its usual sign-up.
      applyServerOrigin(LOCAL_SELF_HOST_ORIGIN, result.managedAccount ? DESKTOP_ENTRY_PATH : "/signup");
      return {};
    },
    cancelInstall: cancelLocalInstall,
    openExternal: (url) => void openDesktopExternal(url),
    close: () => {
      if (!mainWindow) return;
      cancelLocalInstall();
      loadDesktopWindow(mainWindow, `${origin}${DESKTOP_ENTRY_PATH}`);
    },
  });
}

function showLocalRuntimeStatus(message: string): void {
  if (!mainWindow) return;
  const html = `<!doctype html><meta charset="utf-8"><meta name="color-scheme" content="light dark"><title>Starting minddy</title><style>body{font:15px system-ui,sans-serif;display:grid;min-height:100vh;margin:0;place-items:center;background:Canvas;color:CanvasText}p{color:GrayText}</style><main><h1>Starting local minddy…</h1><p>${message}</p></main>`;
  loadDesktopWindow(mainWindow, `data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
}

const useLocalMinddy = createLocalStartupSelection(selectLocalMinddy);

async function selectLocalMinddy(): Promise<{ error?: InstallMessage }> {
  if (!mainWindow) return { error: installMessage("localStartFailed") };
  let generation = localRuntimeGeneration;
  const selection = await dialog.showOpenDialog(mainWindow, {
    properties: ["openDirectory"],
  });
  if (selection.canceled || !selection.filePaths[0]) return { error: installMessage("folderRequired") };
  if (generation !== localRuntimeGeneration || quitting) return { error: installMessage("installCanceled") };
  let root: string;
  try {
    root = validateLocalRuntimeRoot(selection.filePaths[0]);
  } catch {
    return { error: installMessage("folderInvalid") };
  }
  generation = ++localRuntimeGeneration;
  // From here the window shows the startup status, not the server choice:
  // a failure comes back as a dialog, then the choice again.
  showLocalRuntimeStatus("Starting Supabase and the app. The first start can take several minutes.");
  try {
    await startLocalRuntime(root);
  } catch (error) {
    if (generation !== localRuntimeGeneration || quitting) return { error: installMessage("installCanceled") };
    const detail = error instanceof Error ? error.message : String(error);
    dialog.showErrorBox("Local minddy could not start", detail);
    showServerChoice();
    return { error: { text: detail } };
  }
  if (generation !== localRuntimeGeneration || quitting) return { error: installMessage("installCanceled") };
  writeLocalRuntimeRoot(root);
  writeDesktopServerOrigin(LOCAL_SELF_HOST_ORIGIN);
  applyServerOrigin(LOCAL_SELF_HOST_ORIGIN, "/signup");
  return {};
}

function applyServerOrigin(next: string | null, entryPath = DESKTOP_ENTRY_PATH): void {
  localRuntimeGeneration++;
  if (next !== LOCAL_SELF_HOST_ORIGIN) stopLocalRuntime();
  customServerOrigin = next;
  const nextOrigin = next ?? DESKTOP_ORIGIN;
  if (nextOrigin !== origin) localNotifications.clear();
  origin = nextOrigin;
  trace("server", { origin, custom: next !== null });
  applyAboutPanel();
  rebuildAppMenu();
  if (mainWindow) {
    loadDesktopWindow(mainWindow, `${origin}${entryPath}`);
    revealWindow(mainWindow);
  }
}

function setCustomServer(next: string): void {
  writeDesktopServerOrigin(next);
  applyServerOrigin(next, "/signup");
}

function useMinddyCloud(): void {
  writeDesktopServerOrigin(null);
  applyServerOrigin(null);
}

/**
 * The “About” window. The native panel exists anyway (`about`
 * role in the menu): without these options it announces the name and version of Electron, which
 * is true and does not inform anyone. The name comes from `app.getName()`, so from
 * `setName` lower — not one more string.
 */
function applyAboutPanel(): void {
  app.setAboutPanelOptions({
    applicationName: app.getName(),
    applicationVersion: app.getVersion(),
    copyright: "© 2026 mangue",
    // `credits` is the only free line that macOS displays; `website` does not
    // does not exist (this is a Linux option). We put the ACTIVE origin there and not the
    // constant: on a custom server, it's the only place that says it without
    // that we have to open a menu.
    credits: origin,
  });
}

/**
 * The macOS buttons: what the PAGE asks for, and what they REALLY do.
 *
 * The page no longer asks to hide them — dialogs, palettes and drawers leave
 * the buttons in place, so `wantsWindowButtons` stays true for the whole
 * session. What remains is FULL SCREEN, which removes them without warning
 * anyone — it's macOS that decides. The layout cannot follow the request: it
 * follows the result, and it is this file which tells it so. Without that,
 * going full screen left a 78 px hole in place of the buttons.
 */
let wantsWindowButtons = true;
let windowButtonsVisible = true;

/**
 * What was actually PLACED on the window, so as not to put it back (MIN-311).
 *
 * `setWindowButtonVisibility` and `setWindowButtonPosition` are not
 * status writes: Electron responds to each with one `RedrawTrafficLights()` —
 * the three `NSButton` placed back in their view and the title bar re-put in
 * page, of the synchronous AppKit on the UI thread of the browser process.
 *
 * ⚠ Deduplication CANNOT live on the page side: the renderer refuses
 * voluntarily to deduplicate because `useWindowButtonsSlot` needs the
 * response from the bridge. It therefore concerns NATIVE calls only — the
 * republication remains unconditional.
 *
 * Delivered to `null` on `did-start-loading`: a new document starts from scratch.
 */
let appliedButtons: string | null = null;

/** `target` is only passed on the very first call — `mainWindow` is only assigned
 * when `createWindow` returns, and the buttons light up before then. */
function applyWindowButtons(target?: BrowserWindow): void {
  const window = target ?? mainWindow;
  // macOS only — elsewhere the buttons belong to the manager
  // windows, and the API does not exist.
  if (process.platform !== "darwin" || !window) return;
  const fullScreen = window.isFullScreen();

  const nativeVisible = fullScreen || wantsWindowButtons;
  const applied = `${fullScreen}:${wantsWindowButtons}`;
  trace("applyWindowButtons", {
    fullScreen,
    wants: wantsWindowButtons,
    reposed: applied !== appliedButtons,
  });
  if (applied !== appliedButtons) {
    appliedButtons = applied;
    // ⚠ IN FULL SCREEN, WE NEVER HIDE THEM. macOS manages them itself: they
    // slide off the screen with the menu bar and return when the
    // pointer goes to top. Hiding them over is removing the ONLY
    // way to exit full screen with the mouse — a window from which you cannot
    // no more going out. Modal holds therefore apply only in windowed mode.
    window.setWindowButtonVisibility(nativeVisible);
    if (!fullScreen && nativeVisible) {
      // Restore the position AFTER having shown them: restoring visibility
      // recreate the standard buttons, and they return to their original corner if
      // we do not reapply the position in the application bar.
      window.setWindowButtonPosition(MACOS_TRAFFIC_LIGHT_POSITION);
    }
  }

  // ALWAYS republish, even when nothing has changed on the native side: this is
  // response that `useWindowButtonsSlot` is waiting for to unfreeze its layout.
  //
  // What we announce on the page is another question than what we show: in
  // fullscreen controls are managed by macOS outside the application bar.
  // The bar releases their slot until the native state reports them back.
  publishWindowButtons(wantsWindowButtons && !fullScreen);
}

/**
 * Tells the page what it is, and remembers it for future subscribers.
 *
 * `to` targets ONE subscriber, for the status replay requested by `…-ready`: without it,
 * the arrival of a late subscriber waters all the `ipcRenderer.on` of the document —
 * including its neighbors, who have not requested anything (MIN-310).
 */
function publishWindowButtons(
  next = windowButtonsVisible,
  to?: WebContents
): void {
  windowButtonsVisible = next;
  trace("publishWindowButtons", { next, targeted: to != null });
  (to ?? mainWindow?.webContents)?.send("minddy:window-buttons-state", next);
}

/**
 * The buttons are placed IN the mark line of the sidebar, in place
 * of the mark: `x` takes the gutter of the bar (`px-2.5`) plus the removal
 * of a line, `y` centers them in the 60 px of this line — the same height
 * as the header and subbar title, the horizontal line that
 * runs through the app. These two numbers and the `padding-left` of `.sidebar-brand-row`
 * (app/globals.css) read together, or not at all.
 */
/**
 * macOS delivers the deep link by `open-url`, and it often does it BEFORE the
 * window exists: clicking on the email link LAUNCHES the app. We therefore keep it, and
 * the renderer comes to get it when he subscribes (`minddy:auth-link-ready`).
 */
function receiveDeepLink(raw: string): void {
  // `minddy://open?next=…` — the return of a detour through the browser (Stripe,
  // MIN-293). It asks NOTHING from the renderer: it changes the page, which only
  // the main process can do it anyway when the window is
  // open. Full loading rather than client navigation, for the same
  // reason for the return of authentication: we are returning from a purchase, the subscription
  // changed on the server side, and a new rendering costs less than reasoning on this
  // which had already been rendered with the old plan.
  const next = parseDesktopOpenLink(raw);
  if (next) {
    pendingOpenPath = next;
    flushOpenLink();
    return;
  }

  const link = parseDesktopAuthLink(raw);
  if (!link) return;
  authLinkDelivery.receive(link);
  const window = mainWindow;
  if (!window) return;
  revealWindow(window);
  flushAuthLink();
}

function flushOpenLink(): void {
  if (!pendingOpenPath || !mainWindow) return;
  const next = pendingOpenPath;
  pendingOpenPath = null;
  revealWindow(mainWindow);
  loadDesktopWindow(mainWindow, `${origin}${next}`);
}

function flushAuthLink(): void {
  authLinkDelivery.flush();
}

function goHome(window: BrowserWindow): void {
  loadDesktopWindow(window, `${origin}${DESKTOP_ENTRY_PATH}`);
}

function revealLocalNotificationTarget(target: string | null): void {
  if (!mainWindow) return;
  const url = desktopLocalNotificationUrl(origin, target);
  if (url) loadDesktopWindow(mainWindow, url);
  revealWindow(mainWindow);
}

/**
 * The navigation guard. Without it, a link to a third-party site opens this site
 * IN minddy, with our `preload` loaded — that is, with the bridge.
 *
 * It answers two separate questions, in this order: **is this at
 * us?** (`navigationDecision`, lib/desktop/nav-guard.ts), then **is this a
 * page that the window has the right to show?** (`routeDisposition`,
 * lib/desktop/window-routes.ts). The second is what keeps the app on its two
 * only screens: authentication and the app.
 *
 * **You have to plug in FOUR events, and each one catches up with what the others don't see.** It's the kind of list that you think is finished in two :
 *
 * - `will-navigate` — ordinary click on a link ;
 * - `will-redirect` — SERVER redirects. This is where we reach the
 * feedback board: `/feedback` places a JWT and returns to `/f/<token>`,
 * without any link having ever pointed to the board. Without this event,
 * the entire public token surface entered the window through the door of
 * behind ;
 * - `did-navigate-in-page` — the navigations of the SPA, which Next pushes into
 * the history without loading any document. This is where the links go through
 * CGU and confidentiality of the registration screen;
 * - `setWindowOpenHandler` — the `target="_blank"`.
 */
function guardNavigation(window: BrowserWindow): void {
  const guard = (event: { preventDefault: () => void }, url: string) => {
    const decision = navigationDecision(url, origin);
    if (decision !== "allow") {
      event.preventDefault();
      // A third-party site goes to the browser; an unknown pattern isn't going anywhere.
      if (decision === "external") void openDesktopExternal(url);
      return;
    }
    const disposition = routeDisposition(url);
    if (disposition === "allow") return;
    event.preventDefault();
    // The landing is not a destination we ask for: we fall there. We bring back
    // so at the entrance rather than launching a browser under the fingers of
    // someone who just clicked the logo.
    if (disposition === "home") goHome(window);
    else void openDesktopExternal(url);
  };

  window.webContents.on("will-navigate", (event, url) => guard(event, url));
  window.webContents.on("will-redirect", (details) => {
    if (details.isMainFrame) guard(details, details.url);
  });

  // ⚠ **This cannot be canceled**: navigation has already taken place when we
  // learns it. It can therefore only REPAIR, and the only repair that works
  // every hit is to reload the input.
  //
  // Undo cleanly was tried twice, and both failed:
  // `navigationHistory.goBack()` ne fait rien (`canGoBack()` rend `false` juste
  // after a `pushState`), and `executeJavaScript("history.back()")` sees its
  // REJECT promise — the navigation it triggers destroys the context
  // execution that was waiting for it. Measured in the window, not deducted.
  //
  // Hence the sharing of roles: this net guarantees that no public page
  // is never displayed here, and **it's the PAGE that avoids getting there** — the
  // legal notices from the registration screen open the browser themselves
  // (`LegalLink`, components/auth/login-form.tsx) rather than navigating.
  window.webContents.on("did-navigate-in-page", (_event, url, isMainFrame) => {
    if (!isMainFrame) return;
    const disposition = routeDisposition(url);
    if (disposition === "allow") return;
    if (disposition === "external") void openDesktopExternal(url);
    goHome(window);
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    const decision = navigationDecision(url, origin);
    // Even a URL from us: we don't make a second window. A
    // internal `target="_blank"` goes to the browser like the rest — the app has a
    // window, and only one.
    if (decision !== "block") void openDesktopExternal(url);
    return { action: "deny" };
  });
}

function createWindow(
  loadInitialOrigin = true,
  showWhenReady = true,
  integrated = false,
): BrowserWindow {
  const window = new BrowserWindow({
    width: 1280,
    height: 860,
    // **The floor is not that of a site, it is that of a WINDOW.** A
    //browser goes down to 720x480 because someone may want to stick there
    // anything ; an installed app has only one content, and the
    // let it reduce to a board column stretched over the entire width
    // doesn't help anyone — it's a size you reach by resizing, not
    // one that we choose.
    //
    // 960: the sidebar is folded (it returns to 1200), but the board is there
    // holds TWO columns (`BOARD_COLUMN_CLASS`, 640 px the threshold) and the header
    // keep its breadcrumbs next to the macOS buttons. 640: the conversation of
    // Numo keeps its thread above its composer.
    minWidth: 960,
    minHeight: 640,
    // macOS integrates its traffic lights into the app header. Windows and Linux
    // keep native title-bar controls while auto-hiding the fallback application
    // menu until the user presses Alt.
    ...desktopWindowFrameOptions(process.platform, integrated),
    // Opaque black, or transparent over the native material (MIN-810).
    ...windowMaterialOptions(currentWindowMaterial().kind),
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      // The three settings which cannot be discussed (§2): the renderer takes care of
      // remote code, it should only reach what the preload exposes.
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: false,
      // Keep native macOS rubber-banding disabled alongside the web scroll policy.
      scrollBounce: false,
      // The version, by the command line rather than by a SYNCHRONOUS IPC
      // (MIN-322): `sendSync` stops the renderer for the round trip, at
      // start — that is, right during the first render. The preload reads
      // `process.argv`, which is already there when it runs.
      additionalArguments: [
        `--minddy-integrated-chrome=${integrated || process.platform === "darwin" ? "1" : "0"}`,
        `--minddy-version=${app.getVersion()}`,
        `--minddy-packaged=${app.isPackaged ? "1" : "0"}`,
        `--minddy-native-notifications=${nativeNotificationsAvailable ? "1" : "0"}`,
        `--minddy-windows-wns=${isWnsHelperAvailable() ? "1" : "0"}`,
        windowMaterialFlag(currentWindowMaterial()),
      ],
      // The spell checker goes through `NSSpellChecker` on macOS, at
      // each text modification, on the UI thread of the browser process.
      // The edit context menu (`edit-context-menu.ts`, MIN-797) offers no
      // suggestions, so only the red underlines would remain. Turning it back
      // on one day asks first to add suggestions to that menu (MIN-322).
      spellcheck: false,
      // The MIN-290 probe measured it: the Supabase WebSocket survives very well
      // at seven minutes in the background with throttling ACTIVE. We don't cut it
      // so not — that would be paying for battery for a problem we don't have.
      backgroundThrottling: true,
    },
  });
  appliedWindowMaterial.set(window, currentWindowMaterial().kind);

  integratedFrames.set(window, integrated);

  guardNavigation(window);
  installEditContextMenu(window);
  const rendererRecovery = createRendererRecovery({
    origin: () => origin,
    unavailable: () => quitting || quittingForUpdate || window.isDestroyed() || window.webContents.isDestroyed(),
    defer: (work) => { setImmediate(work); },
    load: (activeOrigin, url) => {
      const html = desktopRendererRecoveryHtml(activeOrigin, url, desktopShellFontDataUrl(), process.platform);
      return loadLocalRecoveryDocument(window.webContents, `data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    },
    failed: () => {
      console.error("[desktop] renderer_recovery_failed");
      void dialog.showMessageBox(window, {
        type: "error",
        message: "This window could not restart",
        detail: "Quit and reopen minddy to continue. Unsaved changes may be lost.",
        buttons: ["Close"],
      }).catch(() => {});
    },
  });
  const stallRecovery = createWindowStallRecovery({
    origin: () => origin,
    unavailable: () => quitting || quittingForUpdate || window.isDestroyed() || window.webContents.isDestroyed(),
    prompt: async (reason, signal) => {
      const { response } = await dialog.showMessageBox(window, {
        type: "warning", title: "Recover minddy",
        message: reason === "loading" ? "This page is taking longer to load" : "This window is not responding",
        detail: "You can keep waiting or recover this window. Recovering may lose unsaved changes.",
        buttons: ["Wait", "Recover window"], defaultId: 0, cancelId: 0, signal,
      });
      return response === 1;
    },
    recover: (reason) => {
      if (reason === "unresponsive") {
        // A stuck JavaScript thread cannot process reload. The existing crash
        // handler recreates the renderer and loads the local recovery document.
        window.webContents.forcefullyCrashRenderer();
      } else {
        // Loading the local document cancels the pending request. Calling stop
        // first can deliver a late ERR_ABORTED to the replacement load promise.
        rendererRecovery.rendererGone("stalled-load");
      }
    },
  });
  window.webContents.on("did-start-navigation", (details) => {
    if (details.isMainFrame) {
      if (!details.isSameDocument) authLinkDelivery.notReady(window.webContents.id);
      rendererRecovery.navigationStarted(details.url, details.isSameDocument);
      stallRecovery.navigationStarted(details.url, details.isSameDocument);
    }
  });
  window.webContents.on("did-stop-loading", () => stallRecovery.loadingStopped());
  // Leaving the server choice abandons an installation in progress; its
  // success navigates away only once nothing is left to cancel.
  window.webContents.on("did-navigate", (_event, url) => {
    if (!isServerChoiceDocument(url)) cancelLocalInstall();
  });
  window.on("unresponsive", () => stallRecovery.unresponsive());
  window.on("responsive", () => stallRecovery.responsive());
  window.on("closed", () => stallRecovery.stop());
  window.webContents.on("render-process-gone", (_event, details) => {
    authLinkDelivery.notReady(window.webContents.id);
    stallRecovery.stop();
    if (details.reason !== "clean-exit" && !quitting && !quittingForUpdate) {
      // Never include document URLs, account data or page content in diagnostics.
      console.error("[desktop] renderer_process_gone", { reason: details.reason, exitCode: details.exitCode });
    }
    rendererRecovery.rendererGone(details.reason);
  });
  window.webContents.on(
    "did-fail-load",
    (_event, errorCode, errorDescription, validatedUrl, isMainFrame) => {
      if (
        !isDesktopServerUnavailable(
          { errorCode, isMainFrame, validatedUrl },
          origin,
        )
      ) {
        return;
      }
      trace("server-unavailable", {
        errorCode,
        errorDescription,
        origin,
      });
      const html = desktopServerUnavailableHtml(
        origin,
        validatedUrl,
        desktopShellFontDataUrl(),
        process.platform,
      );
      loadDesktopWindow(window,
        `data:text/html;charset=utf-8,${encodeURIComponent(html)}`,
      );
    },
  );
  if (process.platform === "darwin" && showWhenReady) window.once("ready-to-show", () => revealWindow(window, false));
  let shownOnce = false;
  window.on("show", () => { shownOnce = true; });
  window.webContents.on("did-finish-load", () => {
    if (process.platform === "darwin" || mainWindow !== window) return;
    const desired = windowChromeReplacement(documentChrome.get(window.webContents.id), integrated);
    if (desired === null) {
      if (showWhenReady && !shownOnce) revealWindow(window, false);
      return;
    }
    // Frame style is a constructor option. Wait for the document to finish so
    // any rotated auth cookies are committed before loading it in a new window.
    const visible = window.isVisible() || (showWhenReady && !shownOnce);
    const maximized = window.isMaximized();
    const minimized = window.isMinimized();
    const fullScreen = window.isFullScreen();
    const url = window.webContents.getURL();
    const replacement = createWindow(false, visible, desired);
    replacement.setBounds(window.getNormalBounds());
    replacement.once("show", () => {
      if (maximized) replacement.maximize();
      if (fullScreen) replacement.setFullScreen(true);
      if (minimized) replacement.minimize();
    });
    mainWindow = replacement;
    window.destroy();
    loadDesktopWindow(replacement, url);
  });
  const webContentsId = window.webContents.id;
  window.on("closed", () => {
    documentChrome.delete(webContentsId);
    authLinkDelivery.notReady(webContentsId);
  });
  // Keep native menu access independent of the renderer and remote server.
  // A bare Alt opens the full application menu when integrated caption controls
  // prevent the operating system from revealing the auto-hidden menu bar.
  if (process.platform !== "darwin") {
    let bareAlt = false;
    window.webContents.on("before-input-event", (event, input) => {
      if (input.key === "Alt" && input.type === "keyDown") bareAlt = !input.control && !input.meta && !input.shift;
      else if (input.type === "keyDown") bareAlt = false;
      if (input.key === "Alt" && input.type === "keyUp" && bareAlt) {
        bareAlt = false;
        event.preventDefault();
        const menu = Menu.getApplicationMenu();
        if (menu && window) menu.popup({ window, x: 0, y: 44 });
      }
    });
  }

  applyWindowButtons(window);

  // **The request belongs to the PAGE, it dies with it.** A reload,
  // a reconnection, a full navigation: the new document never has anything
  // requested, but the old one had been able to leave a request in progress — a box of
  // dialog opened at the time of reload, for example. Without this discount
  // zero, the buttons remained hidden FOREVER, with no one left to
  // return them. The renderer reaffirms its reasons as soon as it is mounted.
  //
  // ⚠ **`did-start-navigation`, and NOT `did-start-loading`** (MIN-293). This one
  // seems to say “a document is arriving”; he actually says “the spinning wheel of
  // tab rotates", which includes SAME-DOCUMENT navigations — a
  // `pushState`, a `replaceState`, that is to say all navigation of the SPA.
  // Each tab change of the Agents page (`router.replace`) reset
  // so the request to zero and made the buttons, while the sidebar
  // was at the rail and had not released anything. They remained there, definitively:
  // no one, on the page side, had any reason to ask for anything again.
  //
  // `isSameDocument` is exactly the distinction that was missing, and
  // `isMainFrame` discards subframes, which do not replace the page.
  window.webContents.on("did-start-navigation", (details) => {
    if (details.isSameDocument || !details.isMainFrame) return;
    trace("did-start-navigation", { url: details.url });
    wantsWindowButtons = true;
    // The native application cache focuses on the WINDOW, but its reason for being
    // is the request of the page: a new document starts from scratch (MIN-311).
    appliedButtons = null;
    applyWindowButtons(window);
  });

  // Full screen removes the buttons without going through us: the layout
  // must learn it, otherwise she keeps the 78 px she reserved for them. In
  // take them out puts them back in — hence the application in both directions, and the position
  // reposted by `applyWindowButtons`.
  window.on("enter-full-screen", () => { applyWindowButtons(); applyWindowMaterial(); });
  window.on("leave-full-screen", () => { applyWindowButtons(); applyWindowMaterial(); });
  // The full screen requested by the PAGE (a media, a publisher) passes the window
  // in full screen too, but by another couple of events. Both
  // result in the same calculation, which rereads `isFullScreen()`: plug them all in
  // the four costs two lines and avoids discovering the missing half.
  window.on("enter-html-full-screen", () => { applyWindowButtons(); applyWindowMaterial(); });
  window.on("leave-html-full-screen", () => { applyWindowButtons(); applyWindowMaterial(); });
  // The window hides instead of dying (see ⌘W in menu.ts): the app remains
  // alive, so notifications keep coming.
  //
  // ⚠ `hideWindow` and not `window.hide()`: in full screen, hide without being
  // exiting Space leaves a black and empty office in the foreground (MIN-353).
  window.on("close", (event) => {
    if (mainWindow !== window) return;
    if (windowCloseAction(quittingForUpdate) === "close") return;
    event.preventDefault();
    hideWindow(window);
  });

  // What the page cannot know (MIN-307): ⌘W and the red light HIDE
  // the window, the same document therefore experiences dozens of cycles per day, and
  // this is what triggers the restarts. `powerMonitor` carries the most common cause
  // frequent socket outages, of which the page only sees the consequence.
  window.on("show", () => trace("window:show"));
  window.on("hide", () => trace("window:hide"));
  window.on("blur", () => trace("window:blur"));
  // Four lines and not a loop, and it doesn't tighten: each event
  // of `powerMonitor` is a distinct literal-named OVERLOAD in typings
  // from Electron. A union does not satisfy any of them — `tsc` retains the
  // last overload and refuse everything. The loop that lived here was breaking
  // `npm --prefix desktop run typecheck`, and the only other outcome would be a cast,
  // that is, turn off the only check that checks these names.
  const onSuspend = () => trace("power:suspend");
  const onResume = () => {
    trace("power:resume");
    window.webContents.send("minddy:notification:wake");
  };
  const onLock = () => trace("power:lock-screen");
  const onUnlock = () => trace("power:unlock-screen");
  powerMonitor.on("suspend", onSuspend);
  powerMonitor.on("resume", onResume);
  powerMonitor.on("lock-screen", onLock);
  powerMonitor.on("unlock-screen", onUnlock);
  window.on("closed", () => {
    powerMonitor.removeListener("suspend", onSuspend);
    powerMonitor.removeListener("resume", onResume);
    powerMonitor.removeListener("lock-screen", onLock);
    powerMonitor.removeListener("unlock-screen", onUnlock);
  });

  if (loadInitialOrigin) loadDesktopWindow(window, `${origin}${DESKTOP_ENTRY_PATH}`);
  return window;
}

function registerIpc(): void {
  const notificationCapabilities = notificationCapabilitiesForPlatform(
    process.platform,
    app.isPackaged,
    nativeNotificationsAvailable,
    isWnsHelperAvailable(),
  );

  ipcMain.on("minddy:version", (event) => {
    event.returnValue = app.getVersion();
  });

  ipcMain.on("minddy:open-external", (_event, url: unknown) => {
    if (typeof url !== "string") return;
    // The renderer does NOT decide what we give to the system: `open` on a
    // `file://` or on a diagram registered by another app, it is
    // execution. Only what the guard agrees to let out comes out.
    if (navigationDecision(url, origin) === "block") return;
    void openDesktopExternal(url);
  });

  ipcMain.on("minddy:windows-store:open", () => {
    if (process.platform !== "win32" || !process.windowsStore) return;
    void openDesktopExternal(WINDOWS_STORE_DEEP_LINK);
  });

  ipcMain.on("minddy:windows-store-update-status-ready", (event) => {
    event.sender.send(
      "minddy:windows-store-update-status",
      windowsStoreUpdateAvailable,
    );
  });

  ipcMain.on("minddy:auth-link-ready", (event) => authLinkDelivery.ready(event.sender.id));
  ipcMain.on("minddy:auth-link-not-ready", (event) => authLinkDelivery.notReady(event.sender.id));

  ipcMain.on("minddy:server-picker:open", (event) => {
    // A shell recovery document or the app's own pages; never a second window.
    if (mainWindow && event.sender === mainWindow.webContents) showServerChoice();
  });
  registerServerChoice();

  // The session of the account the app manages on the local instance it
  // installed (MIN-781). Only that instance's top document, while it is the
  // selected server, receives it; the password never leaves this process.
  ipcMain.handle("minddy:local-account:session", (event) => {
    if (
      !mainWindow ||
      event.sender !== mainWindow.webContents ||
      event.senderFrame !== mainWindow.webContents.mainFrame ||
      !mayReceiveLocalSession(event.senderFrame.url, LOCAL_SELF_HOST_ORIGIN, customServerOrigin)
    ) {
      return null;
    }
    const root = readLocalRuntimeRoot();
    // Only while the launcher this app started is alive: whatever else might
    // answer on the local port is not the instance the app installed.
    if (!root || !ownsLocalRuntime(root)) return null;
    return localAccountSession(root);
  });

  // Restarts the local instance this app runs (MIN-847), so an instance
  // variable changed in the admin dashboard that needs a restart applies.
  // Same sender checks as the local session: only the main frame of the
  // window showing the local instance may ask.
  ipcMain.handle("minddy:local-runtime:restart", async (event) => {
    if (
      !mainWindow ||
      event.sender !== mainWindow.webContents ||
      event.senderFrame !== mainWindow.webContents.mainFrame ||
      !mayReceiveLocalSession(event.senderFrame.url, LOCAL_SELF_HOST_ORIGIN, customServerOrigin)
    ) {
      return false;
    }
    const root = readLocalRuntimeRoot();
    if (!root || !ownsLocalRuntime(root)) return false;
    stopLocalRuntime();
    await startLocalRuntime(root);
    mainWindow?.webContents.reload();
    return true;
  });

  ipcMain.handle("minddy:update:check", () => checkForUpdatesManually());

  ipcMain.on("minddy:set-badge", (_event, count: unknown) => {
    const n = typeof count === "number" && Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
    if (notificationCapabilities.badge === "dock") {
      app.dock?.setBadge(n > 0 ? String(n) : "");
    } else if (notificationCapabilities.badge === "windows") {
      void runWnsHelper(["badge", String(n)]);
    }
  });

  ipcMain.on("minddy:notification:show", (_event, input: unknown) => {
    if (
      !notificationCapabilities.localNativeBanners ||
      !NativeNotification.isSupported()
    ) {
      return;
    }
    const payload = parseDesktopLocalNotification(input);
    if (!payload) return;
    const notification = new NativeNotification({
      id: payload.id,
      title: payload.title,
      body: payload.body,
    });
    if (!localNotifications.track(payload, notification)) return;
    const notificationOrigin = origin;
    notification.on("click", () => {
      if (!localNotifications.dismiss(payload.id, notification)) return;
      revealLocalNotificationTarget(notificationOrigin === origin ? payload.target : null);
    });
    notification.on("show", () => setNativeNotificationsAvailable(true));
    notification.on("close", () => localNotifications.forget(payload.id, notification));
    notification.on("failed", () => {
      if (localNotifications.forget(payload.id, notification)) {
        setNativeNotificationsAvailable(false);
      }
    });
    notification.show();
  });

  ipcMain.on("minddy:notification:dismiss", (_event, input: unknown) => {
    const id = parseDesktopLocalNotificationId(input);
    if (id) localNotifications.dismiss(id);
  });

  ipcMain.handle("minddy:linux-background:get", () =>
    currentLinuxBackgroundState()
  );

  ipcMain.handle("minddy:linux-background:set", (_event, input: unknown) => {
    if (process.platform !== "linux" || !app.isPackaged || typeof input !== "boolean") {
      return null;
    }
    writeLinuxBackgroundPreference(app.getPath("userData"), input);
    linuxBackgroundEnabled = input;
    linuxAutostartInstalled = syncLinuxBackgroundAutostart({
      enabled: input,
      environment: process.env,
      home: os.homedir(),
      execPath: process.execPath,
    });
    return currentLinuxBackgroundState();
  });

  ipcMain.handle("minddy:push:register", async (_event, options: unknown) => {
    if (!app.isPackaged || (process.platform !== "darwin" && process.platform !== "win32")) {
      return null;
    }
    try {
      const userData = app.getPath("userData");
      const activate =
        !!options &&
        typeof options === "object" &&
        (options as { activate?: unknown }).activate === true;
      if (activate) await setNativePushAllowed(userData, true);
      else if (!(await nativePushAllowed(userData))) return null;
      const installationId = await pushInstallationId(userData);
      if (process.platform === "win32") {
        wnsRegistration ??= requestWnsChannel();
        const channelUri = await wnsRegistration;
        if (!channelUri) wnsRegistration = null;
        return channelUri
          ? { transport: "wns" as const, endpoint: channelUri, installationId }
          : null;
      }
      apnsRegistration ??= pushNotifications.registerForAPNSNotifications();
      const token = await apnsRegistration;
      return {
        transport: "apns" as const,
        endpoint: `apns:${token}`,
        installationId,
      };
    } catch {
      apnsRegistration = null;
      wnsRegistration = null;
      console.error("[push] native_registration_failed");
      return null;
    }
  });

  ipcMain.handle("minddy:push:unregister", async () => {
    if (process.platform === "darwin") {
      apnsRegistration = null;
      await disableNativePush(app.getPath("userData"), () => pushNotifications.unregisterForAPNSNotifications());
    } else if (process.platform === "win32") {
      wnsRegistration = null;
      await disableNativePush(app.getPath("userData"), () => runWnsHelper(["unregister"]));
    }
  });

  ipcMain.on("minddy:push:open-settings", () => {
    // No URL from the remote page passes through this channel: the main
    // process constructs the system destination itself and targets this app.
    if (notificationCapabilities.settings === "macos") {
      void openDesktopExternal(nativeNotificationSettingsUrl(DESKTOP_BUNDLE_ID));
    } else if (notificationCapabilities.settings === "windows") {
      void openDesktopExternal("ms-settings:notifications");
    }
  });

  ipcMain.on("minddy:window-buttons", (_event, visible: unknown) => {
    wantsWindowButtons = visible !== false;
    applyWindowButtons();
  });

  ipcMain.on("minddy:window-chrome", (event, theme: unknown, followsSystem: unknown) => {
    if (!mainWindow || event.sender !== mainWindow.webContents) return;
    if (theme !== "light" && theme !== "dark") return;
    // The native material is tinted by the app's appearance, not the page's:
    // it must follow the page's theme or dark text lands on a dark blur. A
    // page that follows the system leaves the app on the system, so its own
    // `prefers-color-scheme` keeps tracking the OS. Older pages send no
    // second argument and keep the previous behavior.
    if (typeof followsSystem === "boolean") {
      const source = followsSystem ? "system" : theme;
      if (nativeTheme.themeSource !== source) nativeTheme.themeSource = source;
    }
    if (process.platform === "darwin" || !integratedFrames.get(mainWindow)) return;
    mainWindow.setTitleBarOverlay(desktopTitleBarOverlay(process.platform, theme));
  });

  // The device preference (MIN-810). Only the app's own pages on the selected
  // origin reach it, and only a boolean is accepted.
  ipcMain.handle("minddy:window-material:set", (event, enabled: unknown) => {
    if (!mainWindow || event.sender !== mainWindow.webContents || typeof enabled !== "boolean") {
      return currentWindowMaterial();
    }
    if (enabled !== windowMaterialEnabled) {
      windowMaterialEnabled = enabled;
      writeWindowMaterialEnabled(enabled);
      applyWindowMaterial();
    }
    return windowMaterialForWindow(currentWindowMaterial(), mainWindow.isFullScreen());
  });
  ipcMain.on("minddy:window-material-ready", (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    event.sender.send("minddy:window-material-state",
      windowMaterialForWindow(currentWindowMaterial(), window?.isFullScreen() ?? false));
  });

  // Status replay, TARGETED at the requesting subscriber (MIN-310).
  ipcMain.on("minddy:window-buttons-ready", (event) =>
    publishWindowButtons(undefined, event.sender)
  );

  // The update, as the sidebar shows it (MIN-353). Replay
  // TARGETED at the subscriber who requests it, as for the macOS buttons: the page has
  // could be mounted long after the download was completed.
  ipcMain.on("minddy:update-status-ready", (event) =>
    replayUpdateStatus(event.sender)
  );

  // A click on the line does NOT restart the app: it reopens the native box, which
  // ask for the last yes (updater.ts).
  ipcMain.on("minddy:install-update", () => requestInstall());

  ipcMain.on("minddy:focus", () => {
    if (!mainWindow) return;
    revealWindow(mainWindow);
  });

  // THE LOCAL PROJECT FILE (MIN-359) — the first three `handle` of the
  // file, and it is the nature of these gestures which imposes it: they MAKE something
  // thing (the state of the folder, read back on disk), where everything else in the bridge
  // is an unanswered command. `send` would require reinventing a correlation
  // to match the response to its request.
  //
  // The renderer never names a folder: it gives a project id and it
  // `owner/repo` to validate against, and the path can only enter through the
  // open system panel here (`attachLocalRepo`).
  ipcMain.handle("minddy:local-repo:read", (_event, input: unknown) => {
    const parsed = localRepoRequest(input);
    if (!parsed) return { status: "none" };
    return describeLocalRepo(
      parsed.projectId,
      parsed.fullName ? { fullName: parsed.fullName, aliases: parsed.aliases } : null,
    );
  });

  ipcMain.handle("minddy:local-repo:choose", async (_event, input: unknown) => {
    const parsed = localRepoRequest(input);
    if (!parsed) return { status: "none" };
    return attachLocalRepo(
      parsed.projectId,
      parsed.fullName ? { fullName: parsed.fullName, aliases: parsed.aliases } : null,
      mainWindow,
    );
  });

  ipcMain.handle("minddy:local-repo:forget", (_event, input: unknown) => {
    const projectId = readString((input as { projectId?: unknown } | null)?.projectId);
    if (!projectId) return { status: "none" };
    return detachLocalRepo(projectId);
  });

  ipcMain.handle("minddy:local-repo:branches", (_event, input: unknown) => {
    const parsed = localRepoRequest(input);
    return parsed
      ? localBranches(
          parsed.projectId,
          parsed.fullName ? { fullName: parsed.fullName, aliases: parsed.aliases } : null,
        )
      : [];
  });

  ipcMain.handle("minddy:local-repo:skills", (_event, input: unknown) => {
    const parsed = localRepoRequest(input);
    return parsed
      ? localSkills(
          parsed.projectId,
          parsed.fullName
            ? { fullName: parsed.fullName, aliases: parsed.aliases }
            : null,
        )
      : [];
  });

  ipcMain.handle("minddy:local-repo:skill", (_event, input: unknown) => {
    const parsed = localRepoRequest(input);
    const skillPath = readString(
      (input as { path?: unknown } | null)?.path,
    );
    return parsed && skillPath
      ? localSkill(
          parsed.projectId,
          parsed.fullName
            ? { fullName: parsed.fullName, aliases: parsed.aliases }
            : null,
          skillPath,
        )
      : null;
  });

  // A remote page does not receive a network proxy through the Electron bridge. She
  // can only request this bounded discovery: `local-models.ts` accepts
  // loopback and the two fixed routes Ollama / OpenAI-compatible, then does not render
  // only model ids.
  ipcMain.handle("minddy:local-models:discover", (_event, input: unknown) =>
    discoverLocalModels(input),
  );

  // Chromium defers DOM storage commits by several seconds; a forced quit in
  // that window loses an acknowledged local draft. The flush takes no input
  // and only touches the caller's own session.
  ipcMain.handle("minddy:storage:flush", (event) => {
    event.sender.session.flushStorageData();
  });

}

function readString(value: unknown): string | null {
  // Both fields are short by nature (a uuid, a `owner/repo`): beyond
  // from the margin, the body is forged and does not deserve to go further.
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed && trimmed.length <= 256 ? trimmed : null;
}

/** What the renderer has the right to send, reduced to this or nothing.
 *
 * `fullName` is optional: a project with no linked repository has no remote
 * identity to validate against, and the attachment still makes sense — the
 * folder is then validated as a plain git repository. */
function localRepoRequest(input: unknown): {
  projectId: string;
  fullName: string | null;
  aliases: string[];
} | null {
  if (typeof input !== "object" || input === null) return null;
  const { projectId, fullName, aliases } = input as {
    projectId?: unknown;
    fullName?: unknown;
    aliases?: unknown;
  };
  const id = readString(projectId);
  if (!id) return null;
  const parsedAliases = Array.isArray(aliases)
    ? aliases.slice(0, 20).flatMap((alias) => {
        const parsed = readString(alias);
        return parsed ? [parsed] : [];
      })
    : [];
  return { projectId: id, fullName: readString(fullName), aliases: parsedAliases };
}

/**
 * What the page has the right to request from the system. Notifications, yes —
 * it's §3. The clipboard too, the app uses it on both sides. The
 * geolocation, the camera: no, minddy does not use them, and a permission
 * that we do not use is a permission that we do not have to leave open to the
 * remote code.
 *
 * The MIC is not in this list and is not there will not be: it arrives under the
 * permission `media`, which also covers the camera, and it therefore decides separately —
 * see `microphoneRequestAllowed` and the manager just below.
 */
const ALLOWED_PERMISSIONS = new Set([
  "notifications",
  "clipboard-read",
  "clipboard-sanitized-write",
  "fullscreen",
]);

/** The macOS settings pane where the microphone goes, when it has been denied. */
const MICROPHONE_SETTINGS_URL =
  "x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone";

/** Only one at a time: the dictation button clicks again. */
let microphoneDialogOpen = false;

/**
 * The denial says, and the gesture that fixes it — natively, because the denial comes
 * from the system and the page has no way of raising it itself.
 */
async function offerMicrophoneSettings(): Promise<void> {
  if (microphoneDialogOpen) return;
  microphoneDialogOpen = true;
  try {
    const options: Electron.MessageBoxOptions = {
      type: "info",
      message: "minddy can’t reach your microphone",
      detail:
        "macOS is blocking it. Open Privacy & Security › Microphone, turn minddy on, then start dictating again.",
      buttons: ["Open System Settings", "Cancel"],
      defaultId: 0,
      cancelId: 1,
    };
    const { response } = mainWindow
      ? await dialog.showMessageBox(mainWindow, options)
      : await dialog.showMessageBox(options);
    if (response === 0) await openDesktopExternal(MICROPHONE_SETTINGS_URL);
  } finally {
    microphoneDialogOpen = false;
  }
}

function hardenSession(): void {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    if (mainWindow && details.webContentsId === mainWindow.webContents.id) {
      const supported = desktopDocumentChrome(details, origin);
      if (supported !== null) documentChrome.set(details.webContentsId, supported);
      if (process.platform !== "darwin") rememberWindowChrome(rememberableWindowChrome(details, origin));
    }
    callback({});
  });
  session.defaultSession.setPermissionRequestHandler(
    (_wc, permission, callback, details) => {
      if (permission === "media") {
        const request = details as Electron.MediaAccessPermissionRequest;
        const allowed = microphoneRequestAllowed(
          {
            securityOrigin: request.securityOrigin,
            requestingUrl: request.requestingUrl,
            mediaTypes: request.mediaTypes,
          },
          origin
        );
        if (!allowed) {
          callback(false);
          return;
        }
        void grantDesktopMicrophoneAccess(offerMicrophoneSettings).then(callback);
        return;
      }
      callback(ALLOWED_PERMISSIONS.has(permission));
    }
  );
}

// The name, BEFORE everything else: `app.getPath("userData")` derives from it, and a
// just one line further down it would already be too late — the session, the caches and the
// worktrees of the local agent would fall under “Electron”. Change it once
// once the app is installed in people's homes it would require a folder migration to
// un simple renommage.
//
// ⚠ **In development, the name is CHANGING, and it is not cosmetic.** The lock
// single instance just below lives IN `userData`, which derives from this name:
// with the same name, the shell launched by `npm run desktop:dev` requested the same
// lock that the installed app. When it turns - that is to say always, on
// the station where we develop — the dev shell immediately left, in silence and
// with a code 0, and the installed app just came to the foreground.
// We then think we have launched the shell: we are in fact watching the production.
//
// The separate profile costs nothing: cookies are by ORIGIN, and a window
// of dev pointed to `localhost` would not have the session in any case
// `www.minddy.app`. You have to log in once, and that's it.
app.setName(app.isPackaged ? DESKTOP_APP_NAME : `${DESKTOP_APP_NAME}-dev`);

// Keep all Linux shell state inside the XDG locations selected by the user.
// This must precede every call that reads `userData`, including the instance
// lock and the persisted server selection below.
if (process.platform === "linux") {
  const xdg = linuxDesktopPaths(process.env, os.homedir(), app.getName());
  prepareLinuxDesktopPaths(xdg);
  app.setPath("userData", xdg.userData);
  app.setPath("sessionData", xdg.userData);
  app.commandLine.appendSwitch("disk-cache-dir", xdg.cache);
  app.setAppLogsPath(xdg.logs);
  if (app.isPackaged) {
    linuxBackgroundEnabled = readLinuxBackgroundPreference(xdg.userData);
    try {
      linuxAutostartInstalled = syncLinuxBackgroundAutostart({
        enabled: linuxBackgroundEnabled,
        environment: process.env,
        home: os.homedir(),
        execPath: process.execPath,
      });
    } catch (error) {
      linuxAutostartInstalled = false;
      trace("linux-background:autostart-error", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

// Electron test bench only: allows Playwright to launch a second
// shell with a COPY of the connected profile, without taking the lock or touching
// to data from the development window used by the person. An app
// packaged always ignores this variable, even if its environment carries it.
if (!app.isPackaged && process.env.MINDDY_DESKTOP_TEST_USER_DATA?.trim()) {
  app.setPath("userData", process.env.MINDDY_DESKTOP_TEST_USER_DATA.trim());
  app.setPath("sessionData", process.env.MINDDY_DESKTOP_TEST_USER_DATA.trim());
}

// Electron test bench only: automated runs open their windows without taking
// focus, so a measurement does not pull the person away from their work. See
// lib/desktop/test-background.ts; a packaged app always ignores it.
const testBackground = desktopTestBackground(app.isPackaged, process.env);
if (testBackground && process.platform === "darwin") app.setActivationPolicy("accessory");

/** Show a window, and give it focus unless the test bench runs in the background. */
function revealWindow(window: BrowserWindow, focus = true): void {
  if (testBackground) {
    window.showInactive();
    return;
  }
  window.show();
  if (focus) window.focus();
}

// Single instance: the deep link must reach the app ALREADY opened, not in
// launch a second which would have neither its session nor its window.
// The bundled server-choice page's origin (MIN-781); must precede `ready`.
registerServerChoiceScheme();

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  // Unlike a regular app quit, the updater closes every window before emitting
  // `before-quit`. Remember that intent so the ordinary hide-on-close behavior
  // does not cancel the install-and-relaunch sequence.
  nativeAutoUpdater.on("before-quit-for-update", () => {
    quittingForUpdate = true;
  });

  app.on("second-instance", (_event, argv) => {
    for (const arg of desktopProtocolArguments(argv)) receiveDeepLink(arg);
    if (mainWindow && !isLinuxBackgroundLaunch(argv)) {
      revealWindow(mainWindow);
    }
  });

  // macOS: the link arrives here, and can arrive before `ready`.
  app.on("open-url", (event, url) => {
    event.preventDefault();
    receiveDeepLink(url);
  });

  // Freedesktop and Windows launchers start a stopped app with the protocol URL
  // in argv. Queue it before the window exists so authentication cannot arrive
  // before the renderer subscribes to the main-process bridge.
  if (process.platform !== "darwin") {
    for (const arg of desktopProtocolArguments(process.argv)) receiveDeepLink(arg);
  }

  void app.whenReady().then(() => {
    nativeNotificationsAvailable = NativeNotification.isSupported();
    // The suffix is ​​ADDED, it does not replace: falsify the user agent to
    // passing a login screen is fragile and against policy
    // which we would pretend to circumvent (§2). It is there so that the server and the UI
    // know that we are in the app, nothing more.
    app.userAgentFallback = withDesktopUserAgent(
      app.userAgentFallback,
      app.getVersion()
    );

    // `minddy://`. Apart from packaged apps (dev), Windows and Linux need the
    // binary and project path to know what to restart — and both pass them on
    // the command line, so the dev app really opens.
    //
    // ⚠ macOS is different, and claiming the scheme in dev there is pure
    // harm: Electron marks `path`/`args` as Windows-only, so LaunchServices
    // registers the bare `Electron.app` binary — a bounce later opens a NAKED
    // Electron shell (no app, no session) and the installed app loses its
    // deep-link return. So a dev shell only claims the scheme when explicitly
    // asked to (`MINDDY_DESKTOP_CLAIM_PROTOCOL=1`), and the installed app
    // reclaims the scheme on its next launch either way: the last registered
    // wins.
    if (app.isPackaged && !process.windowsStore) {
      app.setAsDefaultProtocolClient(DESKTOP_PROTOCOL);
    } else if (
      !app.isPackaged &&
      (process.platform !== "darwin" ||
        process.env.MINDDY_DESKTOP_CLAIM_PROTOCOL?.trim() === "1")
    ) {
      app.setAsDefaultProtocolClient(DESKTOP_PROTOCOL, process.execPath, [
        path.resolve(process.argv[1] ?? ""),
      ]);
    }

    // The origin BEFORE the window: there is no second loading to hope for to
    // catch up. Installations that had switched to the retired preview channel
    // come back to stable here (MIN-765).
    if (resetRetiredDesktopChannel()) trace("channel", { reset: "stable" });
    windowMaterialEnabled = readWindowMaterialEnabled();
    // "Reduce transparency" and high contrast win over the preference, live.
    nativeTheme.on("updated", applyWindowMaterial);
    customServerOrigin = readDesktopServerOrigin();
    origin = customServerOrigin ?? DESKTOP_ORIGIN;
    trace("origin", { origin, customServer: customServerOrigin !== null });

    applyAboutPanel();
    hardenSession();
    serveServerChoicePage();
    registerIpc();
    const localSelected = customServerOrigin === LOCAL_SELF_HOST_ORIGIN;
    const localRoot = localSelected ? readLocalRuntimeRoot() : null;
    // Windows and Linux: start with the frame this origin's last document
    // asked for, so its first load is not repeated in a replacement window.
    rememberedChrome = process.platform === "darwin" ? null : readWindowChrome();
    mainWindow = createWindow(
      !localSelected,
      !backgroundLaunchRequested,
      startupIntegratedChrome(process.platform, rememberedChrome, origin),
    );
    if (localRoot) {
      const generation = localRuntimeGeneration;
      showLocalRuntimeStatus("Starting Supabase and the app. The first start can take several minutes.");
      void useLocalMinddy.run(() => startLocalRuntime(localRoot)
        .then(async () => {
          if (generation !== localRuntimeGeneration || quitting) return { error: installMessage("installCanceled") };
          await mainWindow?.loadURL(`${LOCAL_SELF_HOST_ORIGIN}${DESKTOP_ENTRY_PATH}`);
          return {};
        })
        .catch((error): { error?: InstallMessage } => {
          if (!mainWindow || generation !== localRuntimeGeneration || quitting || error?.name === "AbortError") return { error: installMessage("installCanceled") };
          const detail = error instanceof Error ? error.message : String(error);
          dialog.showErrorBox("Local minddy could not start", detail);
          rebuildAppMenu();
          showServerChoice();
          return { error: { text: detail } };
        }));
    } else if (localSelected) {
      showServerChoice();
    }
    // When the app is running, macOS puts the load back on the process instead of displaying
    // the banner itself. We make it native here; when the app is exited,
    // APNs and macOS display it without any minddy process — the heart of the ticket.
    if (
      notificationCapabilitiesForPlatform(process.platform, app.isPackaged)
        .backgroundTransport === "apns"
    ) {
      pushNotifications.on("received-apns-notification", (_event, payload) => {
        const content = nativePushContent(payload);
        if (!content || !NativeNotification.isSupported()) return;
        const notification = new NativeNotification({
          title: content.title,
          body: content.body,
        });
        const notificationOrigin = origin;
        notification.on("click", () => revealLocalNotificationTarget(notificationOrigin === origin ? content.url : null));
        notification.show();
      });
    }
    rebuildAppMenu();
    // The window is passed to the updater so that its installation proposal
    // attaches to it, rather than floating alone in the middle of the screen.
    startAutoUpdates(() => mainWindow);
    startWindowsStoreUpdateChecks();
    flushOpenLink();
    flushAuthLink();

    // macOS: clicking the dock icon of an app without a visible window brings it back.
    app.on("activate", () => {
      if (!mainWindow) return;
      revealWindow(mainWindow);
    });
  });

  // On macOS an app without a window remains alive, and that's what we want: it
  // ONLY closes with ⌘Q. This is also what keeps notifications going —
  // and which explains why they stop when you leave (§3).
  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });

  /** Close the shell and any desktop-managed self-hosted web process. */
  app.on("before-quit", () => {
    quitting = true;
    cancelLocalInstall();
    stopLocalRuntime();
    const window = mainWindow;
    mainWindow = null;
    window?.destroy();
  });
}
