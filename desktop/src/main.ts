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
  type IpcMainEvent,
  type IpcMainInvokeEvent,
} from "electron";

import { parseDesktopAuthLink } from "@/lib/desktop/auth-link";
import { createDesktopAuthLinkDelivery } from "@/lib/desktop/auth-link-delivery";
import {
  DESKTOP_APP_NAME,
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
import { registerDesktopIpc, sendDesktopEvent } from "@/lib/desktop/ipc-main";
import { desktopLaunchFlag } from "@/lib/desktop/launch-state";
import {
  DesktopLocalNotificationRegistry,
  desktopLocalNotificationUrl,
} from "@/lib/desktop/local-notification";
import {
  isLinuxBackgroundLaunch,
  readLinuxBackgroundPreference,
  syncLinuxBackgroundAutostart,
  writeLinuxBackgroundPreference,
  type LinuxBackgroundNotificationState,
} from "@/lib/desktop/linux-background";
import {
  notificationCapabilitiesForPlatform,
  type DesktopNotificationCapabilities,
} from "@/lib/desktop/notification-capabilities";
import { parseDesktopOpenLink } from "@/lib/desktop/open-link";
import { nativePushContent } from "@/lib/desktop/native-push";
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
import { isServerChoiceDocument, serverChoiceUrl } from "@/lib/desktop/server-choice";
import { routeDisposition } from "@/lib/desktop/window-routes";
import { parseWnsHelperChannel } from "@/lib/desktop/wns";
import {
  OPAQUE_WINDOW_BACKGROUND,
  TRANSPARENT_WINDOW_BACKGROUND,
  desktopWindowMaterial,
  windowMaterialForWindow,
  windowMaterialOptions,
  type DesktopWindowMaterialState,
} from "@/lib/desktop/window-material";
import { parseWindowsStoreUpdateProbe } from "@/lib/desktop/windows-store-update";
import {
  desktopWindowFrameOptions,
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
import { buildAppMenu } from "./menu";
import { installEditContextMenu } from "./edit-context-menu";
import { registerServerChoiceScheme, serveServerChoicePage, serverChoiceHandlers } from "./server-choice";
import { navigationHandlers } from "./navigation-handlers";
import { localHandlers } from "./local-handlers";
import { updateHandlers } from "./update-handlers";
import { notificationHandlers, pushHandlers } from "./notification-handlers";
import { windowHandlers } from "./window-handlers";
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
 * minddy's desktop shell (MIN-291), §2 of docs/desktop-electron.md.
 *
 * The main `BrowserWindow` loads the selected minddy origin, so the desktop app
 * and web interface stay identical. The only local screen is the bundled
 * self-hosting page (`minddy-app://welcome/`), which holds no product UI.
 *
 * Decisions live in pure modules of `lib/desktop/`, tested with the
 * repository, because an installed shell is updated far less often than the
 * site. The bridge's channels are answered by the `*-handlers.ts` modules,
 * which receive what they use from here; this file wires them to Electron.
 */

let pendingOpenPath: string | null = null;
let mainWindow: BrowserWindow | null = null;
let localRuntimeGeneration = 0;
const authLinkDelivery = createDesktopAuthLinkDelivery({
  currentRenderer: () => mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed()
    ? mainWindow.webContents.id : null,
  send: (link) => {
    if (mainWindow) sendDesktopEvent(mainWindow.webContents, "minddy:auth-link", link);
  },
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
    if (!window.webContents.isDestroyed()) sendDesktopEvent(window.webContents, "minddy:window-material-state", state);
  }
}
const localNotifications = new DesktopLocalNotificationRegistry();
/** Electron closes windows before `before-quit` during an updater relaunch. */
let quittingForUpdate = false;
let quitting = false;
const backgroundLaunchRequested =
  process.platform === "linux" && isLinuxBackgroundLaunch(process.argv);
let linuxBackgroundEnabled = false;
let linuxAutostartInstalled = false;
let nativeNotificationsAvailable = true;
let windowsStoreUpdateAvailable = false;

const WNS_HELPER_TIMEOUT_MS = 5 * 60 * 1000;
const STORE_UPDATE_HELPER_TIMEOUT_MS = 90 * 1000;
const STORE_UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

let wnsHelperAvailable: boolean | undefined;
function isWnsHelperAvailable(): boolean {
  wnsHelperAvailable ??=
    process.platform === "win32" &&
    app.isPackaged &&
    existsSync(path.join(process.resourcesPath, "wns", "minddy-wns.exe"));
  return wnsHelperAvailable;
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
    if (mainWindow) sendDesktopEvent(mainWindow.webContents, "minddy:windows-store-update-status", available);
  };
  void check();
  setInterval(check, STORE_UPDATE_CHECK_INTERVAL_MS);
}

/**
 * The origin the window shows: minddy Cloud, or the server the person chose.
 *
 * Everything in this file that compares with an origin (the navigation guard,
 * window loads, the microphone permission) reads `origin`, never the
 * constant: otherwise half the app stays on minddy Cloud while the window
 * shows a custom server, and a guard comparing with the wrong origin sends
 * the whole app to the system browser on the first click.
 */
let origin: string = DESKTOP_ORIGIN;
let customServerOrigin: string | null = null;

/**
 * The notification features this shell provides. Each new window's preload
 * receives the same value in its launch state.
 */
function notificationCapabilities(): DesktopNotificationCapabilities {
  return notificationCapabilitiesForPlatform(
    process.platform,
    app.isPackaged,
    nativeNotificationsAvailable,
    isWnsHelperAvailable(),
  );
}

function currentLinuxBackgroundState(): LinuxBackgroundNotificationState | null {
  if (notificationCapabilities().backgroundSession !== "linux") return null;
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
    sendDesktopEvent(mainWindow.webContents, "minddy:linux-background:changed", state);
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

function serverChoiceIpcHandlers() {
  return serverChoiceHandlers<ShellIpcEvent>({
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
 * The "About" panel. The native panel exists anyway (the menu's `about`
 * role); without these options it shows Electron's name and version. The
 * name comes from `app.getName()`, set by `setName` below.
 */
function applyAboutPanel(): void {
  app.setAboutPanelOptions({
    applicationName: app.getName(),
    applicationVersion: app.getVersion(),
    copyright: "© 2026 mangue",
    // `credits` is the only free-form line macOS displays (`website` is a
    // Linux option). It shows the active origin, not the constant: on a custom
    // server it is the only place that names it without opening a menu.
    credits: origin,
  });
}

/**
 * The macOS window buttons sit in the page's title area, except in full
 * screen, where macOS moves them to the top of the screen without telling
 * anyone: the page learns it from here and releases their slot.
 */
let windowButtonsVisible = true;

/**
 * The full-screen state the buttons were last placed for (MIN-311): each
 * native call makes AppKit redraw them synchronously on the UI thread.
 */
let buttonsPlacedForFullScreen: boolean | null = null;

/** `target` is only passed while `createWindow` runs, before `mainWindow` is assigned. */
function applyWindowButtons(target?: BrowserWindow): void {
  const window = target ?? mainWindow;
  if (process.platform !== "darwin" || !window) return;
  const fullScreen = window.isFullScreen();
  if (fullScreen !== buttonsPlacedForFullScreen) {
    buttonsPlacedForFullScreen = fullScreen;
    // Never hidden in full screen: macOS slides them in with the menu bar, and
    // they are the mouse's only way out of it.
    window.setWindowButtonVisibility(true);
    // Showing them recreates the standard buttons in their original corner.
    if (!fullScreen) window.setWindowButtonPosition(MACOS_TRAFFIC_LIGHT_POSITION);
  }
  windowButtonsVisible = !fullScreen;
  if (mainWindow) sendDesktopEvent(mainWindow.webContents, "minddy:window-buttons-state", windowButtonsVisible);
}

/**
 * macOS delivers a deep link through `open-url`, often before the window
 * exists: clicking the email link launches the app. The sign-in link is kept
 * until the page subscribes (`minddy:auth-link-ready`).
 */
function receiveDeepLink(raw: string): void {
  // `minddy://open?next=…`: the return from a detour through the browser
  // (Stripe, MIN-293). It needs nothing from the renderer: it changes the
  // page, which only the main process can do. A full load rather than client
  // navigation, as after sign-in: the subscription changed on the server, and
  // a fresh render costs less than reconciling one made with the old plan.
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
 * The navigation guard. Without it, a link to a third-party site opens that
 * site inside minddy, with our preload loaded, that is with the bridge.
 *
 * It answers two questions in order: is this ours? (`navigationDecision`,
 * lib/desktop/nav-guard.ts), then may the window show this page?
 * (`routeDisposition`, lib/desktop/window-routes.ts). The second keeps the
 * app on its only two screens: authentication and the app.
 *
 * Four events are needed, each catching what the others miss:
 *
 * - `will-navigate`: an ordinary link click;
 * - `will-redirect`: server redirects. The feedback board is reached this
 *   way: `/feedback` sets a JWT and redirects to `/f/<token>` without any link
 *   pointing at the board, so without this event the whole public token
 *   surface would enter the window by the back door;
 * - `did-navigate-in-page`: the SPA's navigations, which Next pushes into the
 *   history without loading a document, such as the sign-up screen's links
 *   to the terms and privacy policy;
 * - `setWindowOpenHandler`: `target="_blank"`.
 */
function guardNavigation(window: BrowserWindow): void {
  const guard = (event: { preventDefault: () => void }, url: string) => {
    const decision = navigationDecision(url, origin);
    if (decision !== "allow") {
      event.preventDefault();
      // A third-party site goes to the browser; an unknown scheme goes nowhere.
      if (decision === "external") void openDesktopExternal(url);
      return;
    }
    const disposition = routeDisposition(url);
    if (disposition === "allow") return;
    event.preventDefault();
    // Nobody asks for the landing page, they land on it: bring them back to
    // the entry rather than opening a browser under someone who just clicked
    // the logo.
    if (disposition === "home") goHome(window);
    else void openDesktopExternal(url);
  };

  window.webContents.on("will-navigate", (event, url) => guard(event, url));
  window.webContents.on("will-redirect", (details) => {
    if (details.isMainFrame) guard(details, details.url);
  });

  // This one cannot be canceled: the navigation has already happened when the
  // event arrives. It can only repair, and the only repair that works every
  // time is reloading the entry.
  //
  // Undoing it cleanly was tried twice and failed both times, as measured in
  // the window: `navigationHistory.goBack()` does nothing (`canGoBack()` is
  // `false` right after a `pushState`), and `executeJavaScript("history.back()")`
  // rejects, because the navigation it triggers destroys the execution context
  // awaiting it.
  //
  // So the roles are split: this net guarantees no public page is shown
  // here, and the page itself avoids getting there: the sign-up screen's
  // legal links open the browser themselves (`LegalLink`,
  // components/auth/login-form.tsx) rather than navigating.
  window.webContents.on("did-navigate-in-page", (_event, url, isMainFrame) => {
    if (!isMainFrame) return;
    const disposition = routeDisposition(url);
    if (disposition === "allow") return;
    if (disposition === "external") void openDesktopExternal(url);
    goHome(window);
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    const decision = navigationDecision(url, origin);
    // Even one of our URLs: the app has a single window, so an internal
    // `target="_blank"` goes to the browser like the rest.
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
    // The minimum is a window's, not a site's. A browser goes down to 720x480
    // because it may hold anything; an installed app has one content, and a
    // single board column stretched across the width helps nobody.
    //
    // 960: the sidebar is collapsed (it returns at 1200), but the board still
    // holds two columns (`BOARD_COLUMN_CLASS`, 640 px threshold) and the
    // header keeps its breadcrumbs next to the macOS buttons. 640: Numo's
    // conversation keeps its thread above its composer.
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
      // The three non-negotiable settings (§2): the renderer runs remote code,
      // and must reach only what the preload exposes.
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: false,
      // Keep native macOS rubber-banding disabled alongside the web scroll policy.
      scrollBounce: false,
      // What the bridge must hold before the first render (launch-state.ts).
      additionalArguments: [
        desktopLaunchFlag({
          version: app.getVersion(),
          integratedWindowChrome: integrated || process.platform === "darwin",
          notificationCapabilities: notificationCapabilities(),
          windowMaterial: currentWindowMaterial(),
        }),
      ],
      // On macOS the spell checker calls `NSSpellChecker` on every text
      // change, on the browser process's UI thread.
      // The edit context menu (`edit-context-menu.ts`, MIN-797) offers no
      // suggestions, so only the red underlines would remain. Turning it back
      // on one day asks first to add suggestions to that menu (MIN-322).
      spellcheck: false,
      // The MIN-290 probe measured it: the Supabase WebSocket survives seven
      // minutes in the background with throttling on. Turning it off would
      // spend battery on a problem we do not have.
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
      if (!details.isSameDocument) {
        trace("did-start-navigation", { url: details.url });
        authLinkDelivery.notReady(window.webContents.id);
      }
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

  // Full screen takes the buttons away and leaving it brings them back.
  window.on("enter-full-screen", () => { applyWindowButtons(); applyWindowMaterial(); });
  window.on("leave-full-screen", () => { applyWindowButtons(); applyWindowMaterial(); });
  // A page's own full screen (a video, the editor) arrives by these two events.
  window.on("enter-html-full-screen", () => { applyWindowButtons(); applyWindowMaterial(); });
  window.on("leave-html-full-screen", () => { applyWindowButtons(); applyWindowMaterial(); });
  // The window hides instead of closing (see ⌘W in menu.ts): the app stays
  // alive, so notifications keep coming.
  //
  // `hideWindow`, not `window.hide()`: hiding in full screen without leaving
  // its Space leaves an empty black desktop in front (MIN-353).
  window.on("close", (event) => {
    if (mainWindow !== window) return;
    if (windowCloseAction(quittingForUpdate) === "close") return;
    event.preventDefault();
    hideWindow(window);
  });

  // What the page cannot know (MIN-307): ⌘W and the red button hide the
  // window, so one document goes through dozens of hide/show cycles a day,
  // which is what triggers reconnections. `powerMonitor` reports the most
  // frequent cause of socket drops, of which the page sees only the effect.
  window.on("show", () => trace("window:show"));
  window.on("hide", () => trace("window:hide"));
  window.on("blur", () => trace("window:blur"));
  // Four lines, not a loop: each `powerMonitor` event is a separate overload
  // in Electron's typings, and a union of names satisfies none of them (`tsc`
  // keeps the last overload and rejects everything). A loop would need a cast,
  // which turns off the only check of these names.
  const onSuspend = () => trace("power:suspend");
  const onResume = () => {
    trace("power:resume");
    sendDesktopEvent(window.webContents, "minddy:notification:wake");
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

type ShellIpcEvent = IpcMainEvent | IpcMainInvokeEvent;

/**
 * Every channel of the bridge (lib/desktop/ipc-contract.ts), each answered by
 * one handler module. The contract's sender policy and parser run before
 * every handler.
 */
function registerIpc(): void {
  const openExternal = (url: string) => void openDesktopExternal(url);
  const mainWindowOrNull = () => (mainWindow && !mainWindow.isDestroyed() ? mainWindow : null);
  registerDesktopIpc<ShellIpcEvent>(
    {
      ipcMain,
      mainContents: () => mainWindowOrNull()?.webContents ?? null,
      context: () => ({ origin, localOrigin: LOCAL_SELF_HOST_ORIGIN, customServerOrigin }),
    },
    {
      ...serverChoiceIpcHandlers(),
      ...navigationHandlers<ShellIpcEvent>({
        origin: () => origin,
        openExternal,
        authLinks: authLinkDelivery,
        showServerChoice,
      }),
      ...localHandlers<ShellIpcEvent>({
        runtimeRoot: readLocalRuntimeRoot,
        ownsRuntime: ownsLocalRuntime,
        accountSession: localAccountSession,
        stopRuntime: stopLocalRuntime,
        startRuntime: startLocalRuntime,
        reloadWindow: () => mainWindow?.webContents.reload(),
      }),
      ...updateHandlers<ShellIpcEvent>({
        checkForUpdates: checkForUpdatesManually,
        replayUpdateStatus,
        requestInstall,
        windowsStore: process.platform === "win32" && process.windowsStore === true,
        windowsStoreUpdateAvailable: () => windowsStoreUpdateAvailable,
        openExternal,
      }),
      ...notificationHandlers<ShellIpcEvent>({
        capabilities: notificationCapabilities,
        bannersSupported: () => NativeNotification.isSupported(),
        createBanner: ({ id, title, body }) => new NativeNotification({ id, title, body }),
        banners: localNotifications,
        origin: () => origin,
        revealTarget: revealLocalNotificationTarget,
        setBannersAvailable: setNativeNotificationsAvailable,
        setDockBadge: (text) => app.dock?.setBadge(text),
        setWindowsBadge: (count) => void runWnsHelper(["badge", String(count)]),
        linuxBackgroundState: currentLinuxBackgroundState,
        setLinuxBackground: (enabled) => {
          writeLinuxBackgroundPreference(app.getPath("userData"), enabled);
          linuxBackgroundEnabled = enabled;
          linuxAutostartInstalled = syncLinuxBackgroundAutostart({
            enabled,
            environment: process.env,
            home: os.homedir(),
            execPath: process.execPath,
          });
        },
      }),
      ...pushHandlers<ShellIpcEvent>({
        capabilities: notificationCapabilities,
        allowPush: () => setNativePushAllowed(app.getPath("userData"), true),
        pushAllowed: () => nativePushAllowed(app.getPath("userData")),
        disablePush: (unregister) => disableNativePush(app.getPath("userData"), unregister),
        installationId: () => pushInstallationId(app.getPath("userData")),
        registerApns: () => pushNotifications.registerForAPNSNotifications(),
        unregisterApns: () => pushNotifications.unregisterForAPNSNotifications(),
        requestWnsChannel,
        unregisterWns: () => runWnsHelper(["unregister"]),
        openExternal,
      }),
      ...windowHandlers<ShellIpcEvent>({
        platform: process.platform,
        mainWindow: () => mainWindow,
        integratedFrame: () => mainWindow !== null && integratedFrames.get(mainWindow) === true,
        nativeTheme,
        currentMaterial: currentWindowMaterial,
        materialEnabled: () => windowMaterialEnabled,
        setMaterialEnabled: (enabled) => {
          windowMaterialEnabled = enabled;
          writeWindowMaterialEnabled(enabled);
          applyWindowMaterial();
        },
        senderFullScreen: (sender) => BrowserWindow.fromWebContents(sender)?.isFullScreen() ?? false,
        windowButtonsVisible: () => windowButtonsVisible,
        focus: () => {
          if (mainWindow) revealWindow(mainWindow);
        },
      }),
    },
  );
}

/**
 * What the page may request from the system. Notifications (§3) and the
 * clipboard, which the app uses both ways. Not geolocation or the camera:
 * minddy does not use them, and an unused permission need not be open to
 * remote code.
 *
 * The microphone is not in this list: it arrives under the `media`
 * permission, which also covers the camera, so it is decided separately by
 * `microphoneRequestAllowed` in the handler below.
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
 * Explains the denial and how to fix it, natively: the denial comes from the
 * system, and the page has no way to lift it.
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

// The name comes before everything else: `app.getPath("userData")` derives
// from it, and one line later is already too late (the session and caches
// would land under "Electron"). Changing it once the app is installed would
// turn a rename into a folder migration.
//
// In development the name differs, and not for looks: the single-instance
// lock below lives in `userData`. With the same name, the shell started by
// `npm run desktop:dev` asked for the installed app's lock; whenever that app
// was running, the dev shell exited silently with code 0 and the installed
// app came to the front, so you watched production thinking it was the dev
// shell.
//
// The separate profile costs nothing: cookies are per origin, and a dev
// window on `localhost` would not have the `www.minddy.app` session anyway.
// Sign in once.
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

// Electron test bench only: lets Playwright launch a second shell on a copy
// of the signed-in profile, without taking the lock or touching the data of
// the development window in use. A packaged app always ignores this
// variable, even when its environment sets it.
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

// The bundled server-choice page's origin (MIN-781); must precede `ready`.
registerServerChoiceScheme();

// Single instance: a deep link must reach the app already open, not launch a
// second one without its session or window.

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
    // The suffix is added, not substituted: faking the user agent to get
    // past a sign-in screen is fragile and against the policy it would
    // circumvent (§2). It only tells the server and the UI they are in the app.
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
    // While the app runs, macOS hands the push to the process instead of
    // showing the banner itself, so it is shown natively here. When the app
    // is closed, APNs and macOS show it without any minddy process.
    if (notificationCapabilities().backgroundTransport === "apns") {
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
    // The updater gets the window so its install prompt attaches to it
    // rather than floating alone in the middle of the screen.
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

  // On macOS an app without a window stays alive, as intended: it quits only
  // with ⌘Q. That is what keeps notifications coming, and why they stop once
  // it quits (§3).
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
