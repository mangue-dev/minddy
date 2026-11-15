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
import { buildAppMenu } from "./menu";
import { installEditContextMenu } from "./edit-context-menu";
import { registerServerChoiceScheme, serveServerChoicePage, serverChoiceHandlers } from "./server-choice";
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
 * and web interface stay identical. The only local screen is the bundled
 * self-hosting page (`minddy-app://welcome/`), which holds no product UI.
 *
 * Decisions live in pure modules of `lib/desktop/`, tested with the
 * repository: this file only wires them to Electron, because an installed
 * shell is updated far less often than the site.
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
 * Everything that speaks of origin in this file - the navigation guard, the
 * loadings, the micro permission - reads `origin`, never the constant, without
 * which half of the app would stay on minddy Cloud while the window displays a
 * custom server. A navigation guard that compares to the wrong origin returns
 * the entire app to the system browser: this is the kind of fault that is only
 * seen on the first click.
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
      // What the bridge must hold before the first render (launch-state.ts).
      additionalArguments: [
        desktopLaunchFlag({
          version: app.getVersion(),
          integratedWindowChrome: integrated || process.platform === "darwin",
          notificationCapabilities: notificationCapabilities(),
          windowMaterial: currentWindowMaterial(),
        }),
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
 * Every channel of the bridge (lib/desktop/ipc-contract.ts). The contract's
 * sender policy and parser run before each handler below.
 */
function registerIpc(): void {
  registerDesktopIpc<ShellIpcEvent>(
    {
      ipcMain,
      mainContents: () => (mainWindow && !mainWindow.isDestroyed() ? mainWindow.webContents : null),
      context: () => ({ origin, localOrigin: LOCAL_SELF_HOST_ORIGIN, customServerOrigin }),
    },
    {
      ...serverChoiceIpcHandlers(),

      "minddy:open-external": (_event, url) => {
        // Handing a `file://` URL or another app's scheme to the system is
        // execution: only what the navigation guard lets out leaves.
        if (navigationDecision(url, origin) === "block") return;
        void openDesktopExternal(url);
      },
      // Only the exact "new conversation" link of a known agent app (MIN-951).
      "minddy:open-agent-app": (_event, link) => void openDesktopExternal(link),
      "minddy:windows-store:open": () => {
        if (process.platform !== "win32" || !process.windowsStore) return;
        void openDesktopExternal(WINDOWS_STORE_DEEP_LINK);
      },
      "minddy:windows-store-update-status": {
        ready: ({ sender }) => sendDesktopEvent(sender, "minddy:windows-store-update-status", windowsStoreUpdateAvailable),
      },
      "minddy:auth-link": {
        ready: ({ sender }) => authLinkDelivery.ready(sender.id),
        notReady: ({ sender }) => authLinkDelivery.notReady(sender.id),
      },
      "minddy:server-picker:open": () => showServerChoice(),

      // The local instance's managed account (MIN-781): the password never
      // leaves this process. Only while the launcher this app started is
      // alive: whatever else answers on the local port is not that instance.
      "minddy:local-account:session": () => {
        const root = readLocalRuntimeRoot();
        if (!root || !ownsLocalRuntime(root)) return null;
        return localAccountSession(root);
      },
      // Applies an instance variable changed in the admin dashboard that needs
      // a restart (MIN-847).
      "minddy:local-runtime:restart": async () => {
        const root = readLocalRuntimeRoot();
        if (!root || !ownsLocalRuntime(root)) return false;
        stopLocalRuntime();
        await startLocalRuntime(root);
        mainWindow?.webContents.reload();
        return true;
      },

      "minddy:update:check": () => checkForUpdatesManually(),
      "minddy:update-status": { ready: ({ sender }) => replayUpdateStatus(sender) },
      // Reopens the native dialog, which asks for the last yes (updater.ts).
      "minddy:install-update": () => requestInstall(),

      "minddy:set-badge": (_event, count) => {
        const badge = notificationCapabilities().badge;
        if (badge === "dock") app.dock?.setBadge(count > 0 ? String(count) : "");
        else if (badge === "windows") void runWnsHelper(["badge", String(count)]);
      },
      "minddy:notification:show": (_event, payload) => {
        // Not the page's capabilities: after a failed banner they report none
        // available, and a later banner is what notices the recovery.
        if (!NativeNotification.isSupported()) return;
        const notification = new NativeNotification({ id: payload.id, title: payload.title, body: payload.body });
        if (!localNotifications.track(payload, notification)) return;
        const notificationOrigin = origin;
        notification.on("click", () => {
          if (!localNotifications.dismiss(payload.id, notification)) return;
          revealLocalNotificationTarget(notificationOrigin === origin ? payload.target : null);
        });
        notification.on("show", () => setNativeNotificationsAvailable(true));
        notification.on("close", () => localNotifications.forget(payload.id, notification));
        notification.on("failed", () => {
          if (localNotifications.forget(payload.id, notification)) setNativeNotificationsAvailable(false);
        });
        notification.show();
      },
      "minddy:notification:dismiss": (_event, id) => {
        localNotifications.dismiss(id);
      },

      "minddy:linux-background:get": () => currentLinuxBackgroundState(),
      "minddy:linux-background:set": (_event, enabled) => {
        if (notificationCapabilities().backgroundSession !== "linux") return null;
        writeLinuxBackgroundPreference(app.getPath("userData"), enabled);
        linuxBackgroundEnabled = enabled;
        linuxAutostartInstalled = syncLinuxBackgroundAutostart({
          enabled,
          environment: process.env,
          home: os.homedir(),
          execPath: process.execPath,
        });
        return currentLinuxBackgroundState();
      },
      "minddy:linux-background:changed": {
        ready: ({ sender }) => {
          const state = currentLinuxBackgroundState();
          if (state) sendDesktopEvent(sender, "minddy:linux-background:changed", state);
        },
      },

      "minddy:push:register": async (_event, { activate }) => {
        const transport = notificationCapabilities().backgroundTransport;
        if (transport === null) return null;
        try {
          const userData = app.getPath("userData");
          if (activate) await setNativePushAllowed(userData, true);
          else if (!(await nativePushAllowed(userData))) return null;
          const installationId = await pushInstallationId(userData);
          if (transport === "wns") {
            wnsRegistration ??= requestWnsChannel();
            const channelUri = await wnsRegistration;
            if (!channelUri) wnsRegistration = null;
            return channelUri ? { transport, endpoint: channelUri, installationId } : null;
          }
          apnsRegistration ??= pushNotifications.registerForAPNSNotifications();
          const token = await apnsRegistration;
          return { transport, endpoint: `apns:${token}`, installationId };
        } catch {
          apnsRegistration = null;
          wnsRegistration = null;
          console.error("[push] native_registration_failed");
          return null;
        }
      },
      "minddy:push:unregister": async () => {
        const transport = notificationCapabilities().backgroundTransport;
        if (transport === "apns") {
          apnsRegistration = null;
          await disableNativePush(app.getPath("userData"), () => pushNotifications.unregisterForAPNSNotifications());
        } else if (transport === "wns") {
          wnsRegistration = null;
          await disableNativePush(app.getPath("userData"), () => runWnsHelper(["unregister"]));
        }
      },
      // The main process builds the system destination itself; no URL from
      // the page travels on this channel.
      "minddy:push:open-settings": () => {
        const settings = notificationCapabilities().settings;
        if (settings === "macos") void openDesktopExternal(nativeNotificationSettingsUrl(DESKTOP_BUNDLE_ID));
        else if (settings === "windows") void openDesktopExternal("ms-settings:notifications");
      },
      "minddy:window-chrome": (_event, theme, followsSystem) => {
        if (!mainWindow) return;
        // The native material is tinted by the app's appearance, not the
        // page's: it follows the page's theme, or dark text lands on a dark
        // blur. A page that follows the system leaves the app on the system,
        // so its own `prefers-color-scheme` keeps tracking the OS. Older pages
        // send no second argument and keep the previous behavior.
        if (followsSystem !== undefined) {
          const source = followsSystem ? "system" : theme;
          if (nativeTheme.themeSource !== source) nativeTheme.themeSource = source;
        }
        if (process.platform === "darwin" || !integratedFrames.get(mainWindow)) return;
        mainWindow.setTitleBarOverlay(desktopTitleBarOverlay(process.platform, theme));
      },
      // The device preference (MIN-810).
      "minddy:window-material:set": (_event, enabled) => {
        if (enabled !== windowMaterialEnabled) {
          windowMaterialEnabled = enabled;
          writeWindowMaterialEnabled(enabled);
          applyWindowMaterial();
        }
        return windowMaterialForWindow(currentWindowMaterial(), mainWindow?.isFullScreen() ?? false);
      },
      "minddy:window-material-state": {
        ready: ({ sender }) => {
          const window = BrowserWindow.fromWebContents(sender);
          sendDesktopEvent(sender, "minddy:window-material-state",
            windowMaterialForWindow(currentWindowMaterial(), window?.isFullScreen() ?? false));
        },
      },
      "minddy:window-buttons-state": {
        ready: ({ sender }) => sendDesktopEvent(sender, "minddy:window-buttons-state", windowButtonsVisible),
      },
      "minddy:focus": () => {
        if (mainWindow) revealWindow(mainWindow);
      },

      // Loopback only, and nothing back but model ids (local-models.ts).
      "minddy:local-models:discover": (_event, input) => discoverLocalModels(input),
      // Chromium defers DOM storage commits by several seconds; a forced quit
      // in that window loses an acknowledged local draft.
      "minddy:storage:flush": ({ sender }) => {
        sender.session.flushStorageData();
      },
    },
  );
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
