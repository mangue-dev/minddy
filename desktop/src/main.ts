import path from "node:path";
import {
  BrowserWindow,
  Notification as NativeNotification,
  app,
  dialog,
  ipcMain,
  powerMonitor,
  pushNotifications,
  session,
  shell,
  systemPreferences,
  type WebContents,
} from "electron";

import { parseDesktopAuthLink, type DesktopAuthLink } from "@/lib/desktop/auth-link";
import { discoverLocalModels } from "@/lib/desktop/local-models";
import {
  desktopOriginForChannel,
  parseDesktopChannel,
  type DesktopChannel,
} from "@/lib/desktop/channel";
import {
  DESKTOP_APP_NAME,
  DESKTOP_BUNDLE_ID,
  DESKTOP_ENTRY_PATH,
  DESKTOP_ORIGIN,
  DESKTOP_PROTOCOL,
  withDesktopUserAgent,
} from "@/lib/desktop/config";
import { deviceIdForUserData } from "@/lib/desktop/device-id";
import { microphoneRequestAllowed } from "@/lib/desktop/media-guard";
import { navigationDecision } from "@/lib/desktop/nav-guard";
import { parseDesktopOpenLink } from "@/lib/desktop/open-link";
import {
  nativeNotificationSettingsUrl,
  nativePushContent,
} from "@/lib/desktop/native-push";
import { quitDecision, quitPrompt } from "@/lib/desktop/quit-guard";
import {
  carrySessionCookies,
  staleSessionCookies,
} from "@/lib/desktop/session-carry";
import { routeDisposition } from "@/lib/desktop/window-routes";
import { readDesktopChannel, writeDesktopChannel } from "./channel-store";
import {
  nativePushAllowed,
  pushInstallationId,
  setNativePushAllowed,
} from "./push-installation-store";
import { hideWindow } from "./hide-window";
import {
  prewarmLocalAgent,
  runningTurns,
  startLocalClaimLoop,
  stopAllLocalTurns,
  sweepOrphanTurns,
} from "./launcher";
import {
  attachLocalRepo,
  describeLocalRepo,
  detachLocalRepo,
  localBranches,
} from "./local-repo";
import { buildAppMenu } from "./menu";
import { openServerPicker } from "./server-picker";
import {
  LOCAL_SELF_HOST_ORIGIN,
  readLocalRuntimeRoot,
  startLocalRuntime,
  stopLocalRuntime,
  writeLocalRuntimeRoot,
} from "./local-runtime";
import {
  readDesktopServerOrigin,
  writeDesktopServerOrigin,
} from "./server-store";
import { replayUpdateStatus, requestInstall, startAutoUpdates } from "./updater";
import { trace } from "./trace";

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

/** The auth link received before the page is ready to hear it. */
let pendingAuthLink: DesktopAuthLink | null = null;
let mainWindow: BrowserWindow | null = null;
let stopClaimingLocalRuns: (() => void) | null = null;
/** Only one APNs registration at a time, shared between site mounts. */
let apnsRegistration: Promise<string> | null = null;

/**
 * THE CHANNEL, and the origin that results from it (MIN-352).
 *
 * `DESKTOP_ORIGIN` is no longer a constant for this window: it is the
 * starting point, replaced at startup by what `channel.json` says. Everything
 * that speaks of origin in this file - the navigation guard, the
 * loadings, the micro permission - reads `origin`, never the constant, without
 * which half of the app would remain connected to production while the
 * window displays the preview. A navigation guard that compares to the bad
 * origin returns the entire app to the system browser: this is the kind of fault
 * that is only seen on the first click.
 */
let channel: DesktopChannel = "stable";
let origin: string = DESKTOP_ORIGIN;
let customServerOrigin: string | null = null;

function rebuildAppMenu(): void {
  if (!mainWindow) return;
  buildAppMenu(mainWindow, channel, onChannelChange, {
    origin,
    isCustom: customServerOrigin !== null,
    choose: () => {
      if (!mainWindow) return;
      openServerPicker({
        parent: mainWindow,
        currentOrigin: origin,
        isCustomServer: customServerOrigin !== null,
        onSave: setCustomServer,
        onUseLocal: useLocalMinddy,
        onUseCloud: useMinddyCloud,
      });
    },
    useCloud: useMinddyCloud,
  });
}

function showLocalRuntimeStatus(message: string): void {
  if (!mainWindow) return;
  const html = `<!doctype html><meta charset="utf-8"><meta name="color-scheme" content="light dark"><title>Starting minddy</title><style>body{font:15px -apple-system,BlinkMacSystemFont,sans-serif;display:grid;min-height:100vh;margin:0;place-items:center;background:Canvas;color:CanvasText}p{color:GrayText}</style><main><h1>Starting local minddy…</h1><p>${message}</p></main>`;
  void mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
}

async function useLocalMinddy(): Promise<{ error?: string }> {
  if (!mainWindow) return { error: "The main window is unavailable." };
  const selection = await dialog.showOpenDialog(mainWindow, {
    title: "Choose the minddy folder",
    properties: ["openDirectory"],
    buttonLabel: "Use this folder",
  });
  if (selection.canceled || !selection.filePaths[0]) return { error: "Choose the minddy folder to continue." };
  try {
    const root = writeLocalRuntimeRoot(selection.filePaths[0]);
    showLocalRuntimeStatus("Starting Supabase and the app. The first start can take several minutes.");
    await startLocalRuntime(root);
    writeDesktopServerOrigin(LOCAL_SELF_HOST_ORIGIN);
    applyServerOrigin(LOCAL_SELF_HOST_ORIGIN, "/signup");
    return {};
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not start local minddy." };
  }
}

function applyServerOrigin(next: string | null, entryPath = DESKTOP_ENTRY_PATH): void {
  if (next !== LOCAL_SELF_HOST_ORIGIN) stopLocalRuntime();
  customServerOrigin = next;
  origin = next ?? desktopOriginForChannel(channel);
  trace("server", { origin, custom: next !== null });
  void prewarmLocalAgent(origin);
  applyAboutPanel();
  rebuildAppMenu();
  if (mainWindow) {
    void mainWindow.loadURL(`${origin}${entryPath}`);
    mainWindow.show();
    mainWindow.focus();
  }
}

function setCustomServer(next: string): void {
  writeDesktopServerOrigin(next);
  applyServerOrigin(next, "/signup");
}

function useMinddyCloud(): void {
  writeDesktopServerOrigin(null);
  writeDesktopChannel("stable");
  channel = "stable";
  applyServerOrigin(null);
}

/**
 * Switches the channel: we take the session, we retain, then we reload.
 *
 * A FULL reload, and not a client navigation: we change origin,
 * therefore document, session and bundle. Nothing that was returned is worth
 * nothing anymore.
 *
 * **The session FOLLOWS, since MIN-353.** The cookies remain by origin — it's
 * the shell which copies them from one jar to another, because it has both
 * on hand and that it knows when the switch takes place (lib/desktop/session-carry.ts).
 * Without that, each round trip would fall back on the connection screen.
 *
 * ⚠ **The carryover comes BEFORE loading, and you have to wait for it.** Set the
 * cookies while the new origin load, it's running against it: the
 * request for `/home` can leave without them, the proxy sends it back to `/login`, and
 * we end up with a perfectly valid session on a login screen.
 * Hence the asynchronous function, and the only place in the file that waits something
 * before acting.
 */
async function setChannel(next: DesktopChannel): Promise<void> {
  if (customServerOrigin) return;
  if (next === channel) return;
  const from = origin;
  const to = desktopOriginForChannel(next);
  await carrySession(from, to);

  writeDesktopChannel(next);
  channel = next;
  origin = to;
  trace("setChannel", { channel: next, origin });
  // The origin decides the harness: we preheat it from the rocker, far from the
  // first local message. The promise is deliberately detached: a channel
  // remains navigable even if its server is temporarily unavailable.
  void prewarmLocalAgent(origin);
  // The two native surfaces which NAME the channel are redone: without that, the check mark
  // of the menu would remain on the one we just left and “About”
  // would announce the old origin until the next launch.
  applyAboutPanel();
  if (mainWindow) {
    rebuildAppMenu();
    goHome(mainWindow);
    mainWindow.show();
    mainWindow.focus();
  }
}

/**
 * What the menu and bridge call it: the toggle, without its promise.
 *
 * Neither has anything to wait for — a `click` of `MenuItem` and a
 * `ipcMain.on` return immediately.
 */
function onChannelChange(next: DesktopChannel): void {
  void setChannel(next).catch((error) => {
    console.error("[channel] switch failed", error);
  });
}

/**
 * Copies the session cookies from the origin you leave to the one you
 * joins. See lib/desktop/session-carry.ts for what travels and why.
 *
 * **A failure should not hold the toggle.** The worst case is the one before:
 * we arrive at the login screen. Preventing changing channels because the
 * jar refused a write, on the other hand, would leave someone stuck on a broken
 * preview — the only case where you absolutely need to be able to revert.
 */
async function carrySession(from: string, to: string): Promise<void> {
  if (from === to) return;
  try {
    const jar = session.defaultSession.cookies;
    const carried = carrySessionCookies(await jar.get({ url: from }), to);
    if (carried.length === 0) {
      // No one is connected to the origin we are leaving: there is nothing to
      // take away, and above all nothing to erase on arrival - the session that is there
      // maybe find is the only one left.
      trace("carrySession", { from, to, carried: 0 });
      return;
    }
    for (const name of staleSessionCookies(await jar.get({ url: to }), carried)) {
      await jar.remove(to, name);
    }
    for (const cookie of carried) await jar.set(cookie);
    trace("carrySession", { from, to, carried: carried.length });
  } catch (error) {
    console.error("[channel] session carry-over failed", error);
  }
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
    // constant: on the preview channel, it's the only place that says it without
    // that we have to open a menu.
    credits: origin,
  });
}

/**
 * The macOS buttons: what the PAGE asks for, and what they REALLY do.
 *
 * Two entries, only one of which is known to the page. The sidebar asks for
 * (it hosts them, and rail mode doesn't have room to hold them); the full
 * screen removes them without warning anyone — it's macOS that decides. The
 * layout therefore cannot follow the request: it follows the result, and
 * it is this file which tells it so. Without that, going full screen left a 78 px hole in place of the buttons.
 */
let wantsWindowButtons = true;
let windowButtonsVisible = true;

/**
 * What was actually PLACED on the window, so as not to put it back (MIN-311).
 *
 * `setWindowButtonVisibility` and `setWindowButtonPosition` are not
 * status writes: Electron responds to each with one `RedrawTrafficLights()` —
 * the three `NSButton` placed back in their view and the title bar re-put in
 * page, of the synchronous AppKit on the UI thread of the browser process. However, the page
 * often calls: `useHoldWindowButtons("rail", …)` switches each time you hover over
 * the sidebar, and `"modal"` each time you open and close a dialog,
 * palette or drawer.
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
    // no more going out. Rail mode therefore only has control over them in windowed mode.
    window.setWindowButtonVisibility(fullScreen || wantsWindowButtons);
    if (!fullScreen && wantsWindowButtons) {
      // Restore the position AFTER having shown them: restoring visibility
      // recreate the standard buttons, and they return to their original corner if
      // we don't say it again — that is, over the sidebar instead
      // from in its brand line.
      window.setWindowButtonPosition(TRAFFIC_LIGHTS);
    }
  }

  // ALWAYS republish, even when nothing has changed on the native side: this is
  // response that `useWindowButtonsSlot` is waiting for to unfreeze its layout.
  //
  // What we announce on the page is another question than what we show: in
  // full screen buttons exist, but NOT in the brand row — they
  // have passed into the custody of macOS, at the top of the screen. The sidebar
  // must therefore not keep their slot, otherwise it leaves a gap.
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
const TRAFFIC_LIGHTS = { x: 19, y: 22 };

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
    const window = mainWindow;
    if (!window) return;
    window.show();
    window.focus();
    void window.loadURL(`${origin}${next}`);
    return;
  }

  const link = parseDesktopAuthLink(raw);
  if (!link) return;
  pendingAuthLink = link;
  const window = mainWindow;
  if (!window) return;
  window.show();
  window.focus();
  flushAuthLink();
}

function flushAuthLink(): void {
  if (!pendingAuthLink || !mainWindow) return;
  mainWindow.webContents.send("minddy:auth-link", pendingAuthLink);
  pendingAuthLink = null;
}

function goHome(window: BrowserWindow): void {
  void window.loadURL(`${origin}${DESKTOP_ENTRY_PATH}`);
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
      if (decision === "external") void shell.openExternal(url);
      return;
    }
    const disposition = routeDisposition(url);
    if (disposition === "allow") return;
    event.preventDefault();
    // The landing is not a destination we ask for: we fall there. We bring back
    // so at the entrance rather than launching a browser under the fingers of
    // someone who just clicked the logo.
    if (disposition === "home") goHome(window);
    else void shell.openExternal(url);
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
    if (disposition === "external") void shell.openExternal(url);
    goHome(window);
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    const decision = navigationDecision(url, origin);
    // Even a URL from us: we don't make a second window. A
    // internal `target="_blank"` goes to the browser like the rest — the app has a
    // window, and only one.
    if (decision !== "block") void shell.openExternal(url);
    return { action: "deny" };
  });
}

function createWindow(loadInitialOrigin = true): BrowserWindow {
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
    // No title bar: the app already has its own, and a gray band at the
    // above would bring nothing. **Two counterparts, namely rather than
    // discover.** macOS no longer knows where to enter the window, and it's the PAGE
    // who should say it (`-webkit-app-region`, app/globals.css, “app de
    // desk ") ; and the buttons do not exist on their own, they light up when
    // main (`applyWindowButtons`).
    //
    // `titleBarStyle: "hidden"` and NOT `frame: false`. Tried, and discarded: without
    // frame, `trafficLightPosition` no longer counts from the same origin — it
    // there is no longer a title bar to fit under — and the buttons
    // come up to stick in the corner, instead of being centered on the line of
    // marque.
    //
    // The detour was worth making once: we thought for a moment that the line
    // clear one pixel at the top of the window came from the title bar
    // hidden. **It's not ours** — macOS draws it on all
    // windows, it's its border, and there is nothing to correct. Do not reopen.
    titleBarStyle: "hidden",
    trafficLightPosition: TRAFFIC_LIGHTS,
    backgroundColor: "#000000",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      // The three settings which cannot be discussed (§2): the renderer takes care of
      // remote code, it should only reach what the preload exposes.
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: false,
      // The version, by the command line rather than by a SYNCHRONOUS IPC
      // (MIN-322): `sendSync` stops the renderer for the round trip, at
      // start — that is, right during the first render. The preload reads
      // `process.argv`, which is already there when it runs.
      additionalArguments: [`--minddy-version=${app.getVersion()}`],
      // The spell checker goes through `NSSpellChecker` on macOS, at
      // each text modification, on the UI thread of the browser process —
      // and none of its suggestions are reachable: `menu.ts` does not build
      // no context menu and `main.ts` never listens to `context-menu`. He doesn't
      // only the red underlines remained. Turning it back on one day asks
      // first write this menu; that's the other half of the job (MIN-322).
      spellcheck: false,
      // The MIN-290 probe measured it: the Supabase WebSocket survives very well
      // at seven minutes in the background with throttling ACTIVE. We don't cut it
      // so not — that would be paying for battery for a problem we don't have.
      backgroundThrottling: true,
    },
  });

  guardNavigation(window);
  window.once("ready-to-show", () => window.show());
  // A frameless window has no buttons: they light up here, where they belong
  // place in the mark line, before the first display.
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
  window.on("enter-full-screen", () => applyWindowButtons());
  window.on("leave-full-screen", () => applyWindowButtons());
  // The full screen requested by the PAGE (a media, a publisher) passes the window
  // in full screen too, but by another couple of events. Both
  // result in the same calculation, which rereads `isFullScreen()`: plug them all in
  // the four costs two lines and avoids discovering the missing half.
  window.on("enter-html-full-screen", () => applyWindowButtons());
  window.on("leave-html-full-screen", () => applyWindowButtons());
  // The window hides instead of dying (see ⌘W in menu.ts): the app remains
  // alive, so notifications keep coming.
  //
  // ⚠ `hideWindow` and not `window.hide()`: in full screen, hide without being
  // exiting Space leaves a black and empty office in the foreground (MIN-353).
  window.on("close", (event) => {
    if (mainWindow !== window) return;
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
  powerMonitor.on("suspend", () => trace("power:suspend"));
  powerMonitor.on("resume", () => trace("power:resume"));
  powerMonitor.on("lock-screen", () => trace("power:lock-screen"));
  powerMonitor.on("unlock-screen", () => trace("power:unlock-screen"));

  if (loadInitialOrigin) void window.loadURL(`${origin}${DESKTOP_ENTRY_PATH}`);
  return window;
}

function registerIpc(): void {
  ipcMain.on("minddy:version", (event) => {
    event.returnValue = app.getVersion();
  });

  ipcMain.on("minddy:open-external", (_event, url: unknown) => {
    if (typeof url !== "string") return;
    // The renderer does NOT decide what we give to the system: `open` on a
    // `file://` or on a diagram registered by another app, it is
    // execution. Only what the guard agrees to let out comes out.
    if (navigationDecision(url, origin) === "block") return;
    void shell.openExternal(url);
  });

  ipcMain.on("minddy:auth-link-ready", () => flushAuthLink());

  ipcMain.on("minddy:set-badge", (_event, count: unknown) => {
    const n = typeof count === "number" && Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
    app.dock?.setBadge(n > 0 ? String(n) : "");
  });

  ipcMain.handle("minddy:push:register", async (_event, options: unknown) => {
    // The development binary does not carry the APNs heading of minddy and
    // must not make the renderer believe that it has a reachable device.
    if (process.platform !== "darwin" || !app.isPackaged) return null;
    try {
      const userData = app.getPath("userData");
      const activate =
        !!options &&
        typeof options === "object" &&
        (options as { activate?: unknown }).activate === true;
      if (activate) await setNativePushAllowed(userData, true);
      else if (!(await nativePushAllowed(userData))) return null;
      apnsRegistration ??= pushNotifications.registerForAPNSNotifications();
      const token = await apnsRegistration;
      return {
        token,
        installationId: await pushInstallationId(userData),
      };
    } catch (error) {
      apnsRegistration = null;
      console.error("[push] inscription APNs impossible", error);
      return null;
    }
  });

  ipcMain.handle("minddy:push:unregister", async () => {
    if (process.platform === "darwin") {
      pushNotifications.unregisterForAPNSNotifications();
      apnsRegistration = null;
      await setNativePushAllowed(app.getPath("userData"), false);
    }
  });

  ipcMain.on("minddy:push:open-settings", () => {
    if (process.platform !== "darwin") return;
    // No URL from the remote page passes through this channel: the main
    // process constructs the system destination itself and targets this app.
    void shell.openExternal(nativeNotificationSettingsUrl(DESKTOP_BUNDLE_ID));
  });

  ipcMain.on("minddy:window-buttons", (_event, visible: unknown) => {
    wantsWindowButtons = visible !== false;
    applyWindowButtons();
  });

  // Status replay, TARGETED at the requesting subscriber (MIN-310).
  ipcMain.on("minddy:window-buttons-ready", (event) =>
    publishWindowButtons(undefined, event.sender)
  );

  // The channel, requested by the settings screen (MIN-352). The renderer does not
  // that PROPOSE a value: `parseDesktopChannel` returns it to one of the two
  // channels, and anything that is not `"preview"` returns to production.
  ipcMain.on("minddy:set-channel", (_event, next: unknown) => {
    onChannelChange(parseDesktopChannel(next));
  });

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
    mainWindow.show();
    mainWindow.focus();
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
    return describeLocalRepo(parsed.projectId, parsed.fullName ? { fullName: parsed.fullName } : null);
  });

  ipcMain.handle("minddy:local-repo:choose", async (_event, input: unknown) => {
    const parsed = localRepoRequest(input);
    if (!parsed) return { status: "none" };
    return attachLocalRepo(
      parsed.projectId,
      parsed.fullName ? { fullName: parsed.fullName } : null,
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
      ? localBranches(parsed.projectId, parsed.fullName ? { fullName: parsed.fullName } : null)
      : [];
  });

  // A remote page does not receive a network proxy through the Electron bridge. She
  // can only request this bounded discovery: `local-models.ts` accepts
  // loopback and the two fixed routes Ollama / OpenAI-compatible, then does not render
  // only model ids.
  ipcMain.handle("minddy:local-models:discover", (_event, input: unknown) =>
    discoverLocalModels(input),
  );

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
function localRepoRequest(input: unknown): { projectId: string; fullName: string | null } | null {
  if (typeof input !== "object" || input === null) return null;
  const { projectId, fullName } = input as { projectId?: unknown; fullName?: unknown };
  const id = readString(projectId);
  if (!id) return null;
  return { projectId: id, fullName: readString(fullName) };
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

/**
 * Access to the microphone, SYSTEM side — the half that Electron doesn't do.
 *
 * Saying yes to the page is not enough: on macOS, it's TCC who holds the microphone, and
 * it only decides once. Three states, three behaviors:
 *
 * - `not-determined` — no one has asked yet. `askForMediaAccess` opens the
 * system window; it will only open HERE, and only once in the life
 * of the installation. We return the answer.
 * - `granted` — it's already yes, nothing to ask.
 * - `denied` / `restricted` — it's no, and **the system will never ask for it again
 * ever**. Asking again does nothing at all: the only remaining path goes through
 * the Settings, so we open it rather than leaving a silent refusal.
 *
 * Outside of macOS, there is no additional layer: the answer on the page is authoritative.
 */
async function grantMicrophoneAccess(): Promise<boolean> {
  if (process.platform !== "darwin") return true;
  const status = systemPreferences.getMediaAccessStatus("microphone");
  if (status === "granted") return true;
  if (status === "not-determined") {
    return systemPreferences.askForMediaAccess("microphone");
  }
  // The window is NOT expected: the permission callback must start again
  // immediately, otherwise the dictation button remains in “start” mode behind it.
  void offerMicrophoneSettings();
  return false;
}

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
    if (response === 0) await shell.openExternal(MICROPHONE_SETTINGS_URL);
  } finally {
    microphoneDialogOpen = false;
  }
}

function hardenSession(): void {
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
        void grantMicrophoneAccess().then(callback);
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

// Electron test bench only: allows Playwright to launch a second
// shell with a COPY of the connected profile, without taking the lock or touching
// to data from the development window used by the person. An app
// packaged always ignores this variable, even if its environment carries it.
if (!app.isPackaged && process.env.MINDDY_DESKTOP_TEST_USER_DATA?.trim()) {
  app.setPath("userData", process.env.MINDDY_DESKTOP_TEST_USER_DATA.trim());
}

// Single instance: the deep link must reach the app ALREADY opened, not in
// launch a second which would have neither its session nor its window.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", (_event, argv) => {
    for (const arg of argv) {
      if (arg.startsWith(`${DESKTOP_PROTOCOL}:`)) receiveDeepLink(arg);
    }
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
  });

  // macOS: the link arrives here, and can arrive before `ready`.
  app.on("open-url", (event, url) => {
    event.preventDefault();
    receiveDeepLink(url);
  });

  void app.whenReady().then(() => {
    // The suffix is ​​ADDED, it does not replace: falsify the user agent to
    // passing a login screen is fragile and against policy
    // which we would pretend to circumvent (§2). It is there so that the server and the UI
    // know that we are in the app, nothing more.
    app.userAgentFallback = withDesktopUserAgent(
      app.userAgentFallback,
      app.getVersion()
    );

    // `minddy://`. Apart from packaged apps (dev), macOS needs binary and
    // project path to know what to restart.
    //
    // ⚠ The scheme is GLOBAL to the system, and the last registered wins: a
    // dev session takes control of the `minddy://` of the installed app, including
    // including its return of payment. This is the price to pay to be able to test
    // a deep link in dev — but if a link opens the wrong window afterwards
    // suddenly, this is where you have to look, not in the link.
    if (app.isPackaged) {
      app.setAsDefaultProtocolClient(DESKTOP_PROTOCOL);
    } else {
      app.setAsDefaultProtocolClient(DESKTOP_PROTOCOL, process.execPath, [
        path.resolve(process.argv[1] ?? ""),
      ]);
    }

    // The channel BEFORE the window: it says which origin to load, and
    // there is no second loading to hope for to catch up.
    channel = readDesktopChannel();
    customServerOrigin = readDesktopServerOrigin();
    origin = customServerOrigin ?? desktopOriginForChannel(channel);
    trace("channel", { channel, origin, customServer: customServerOrigin !== null });

    applyAboutPanel();
    hardenSession();
    registerIpc();
    const localSelected = customServerOrigin === LOCAL_SELF_HOST_ORIGIN;
    const localRoot = localSelected ? readLocalRuntimeRoot() : null;
    mainWindow = createWindow(!localSelected);
    if (localRoot) {
      showLocalRuntimeStatus("Starting Supabase and the app. The first start can take several minutes.");
      void startLocalRuntime(localRoot)
        .then(() => mainWindow?.loadURL(`${LOCAL_SELF_HOST_ORIGIN}${DESKTOP_ENTRY_PATH}`))
        .catch((error) => {
          if (!mainWindow) return;
          dialog.showErrorBox("Local minddy could not start", error instanceof Error ? error.message : String(error));
          rebuildAppMenu();
          openServerPicker({
            parent: mainWindow,
            currentOrigin: LOCAL_SELF_HOST_ORIGIN,
            isCustomServer: true,
            onSave: setCustomServer,
            onUseLocal: useLocalMinddy,
            onUseCloud: useMinddyCloud,
          });
        });
    } else if (localSelected) {
      showLocalRuntimeStatus("Choose the installed minddy folder to start the local instance.");
      openServerPicker({
        parent: mainWindow,
        currentOrigin: LOCAL_SELF_HOST_ORIGIN,
        isCustomServer: true,
        onSave: setCustomServer,
        onUseLocal: useLocalMinddy,
        onUseCloud: useMinddyCloud,
      });
    }
    // When the app is running, macOS puts the load back on the process instead of displaying
    // the banner itself. We make it native here; when the app is exited,
    // APNs and macOS display it without any minddy process — the heart of the ticket.
    pushNotifications.on("received-apns-notification", (_event, payload) => {
      const content = nativePushContent(payload);
      if (!content || !NativeNotification.isSupported()) return;
      const notification = new NativeNotification({
        title: content.title,
        body: content.body,
      });
      notification.on("click", () => {
        if (!mainWindow) return;
        if (content.url) void mainWindow.loadURL(`${origin}${content.url}`);
        mainWindow.show();
        mainWindow.focus();
      });
      notification.show();
    });
    rebuildAppMenu();
    // Possible installation of opencode and harness cache begins
    // while the window is open. No secrets or deposits are affected.
    void prewarmLocalAgent(origin);
    // The clone claims its towers itself. The page can thus be located on a
    // phone or in another browser; it does not trigger any process.
    stopClaimingLocalRuns = startLocalClaimLoop({
      getOrigin: () => origin,
      deviceId: deviceIdForUserData(app.getPath("userData")),
    });
    // The window is passed to the updater so that its installation proposal
    // attaches to it, rather than floating alone in the middle of the screen.
    startAutoUpdates(() => mainWindow);
    flushAuthLink();

    /**
 * ORPHANS FROM A PREVIOUS PLANT (MIN-293).
 *
 * `before-quit` covers the ⌘Q; it does not cover a clean kill of an app, nor a
 * restart of the Mac in the middle of a round. The opencode server survives
 * the death of the harness — 143 MB in memory, the port held, **and the following round
 * which fails on a refused `listen`**, in a place which in no way resembles
 * its cause. The child register is on the disk: we reread it here, once
 *, at startup.
 */
    sweepOrphanTurns();

    // macOS: clicking the dock icon of an app without a visible window brings it back.
    app.on("activate", () => {
      if (!mainWindow) return;
      mainWindow.show();
      mainWindow.focus();
    });
  });

  // On macOS an app without a window remains alive, and that's what we want: it
  // ONLY closes with ⌘Q. This is also what keeps notifications going —
  // and which explains why they stop when you leave (§3).
  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });

  /**
 * ⌘Q: here we close for good. Without that, the window's `close` handler
 * would hide the window instead of letting the app exit.
 *
 * ⚠ **AND SINCE MIN-293, IT ASKED A QUESTION.** This gesture only destroyed one
 * window — the shell is a view of an origin, leaving did not lose anything
 * that a reload would not return. As soon as a turn plays HERE, the same gesture becomes
 * **the main cause of loss of a turn**, and a loss which costs:
 * hours of work behind, a pull request in front.
 *
 * What we are NOT offering, and this is the heart of the decision: "leave in letting
 * spin”. A detached harness would keep a forge token
 * `contents: write` and a template key alive **without any interface for the
 * shutdown**, and a process repaired to `launchd` would lose its process
 * responsible TCC — the macOS authorization window would not open even more.
 * The turn dies with the app, and the box says where the session starts again.
 */
  app.on("before-quit", (event) => {
    const prompt = quitPrompt(runningTurns());
    if (prompt) {
      // ⚠ `showMessageBoxSync`, and this is the only synchronous call to this file.
      // `before-quit` can only be canceled DURING its handler: a box
      // asynchronous would return before the response, the app would have already exited,
      // and the question would only have served to make a window blink.
      const response = mainWindow
        ? dialog.showMessageBoxSync(mainWindow, { type: "warning", ...prompt, buttons: [...prompt.buttons] })
        : dialog.showMessageBoxSync({ type: "warning", ...prompt, buttons: [...prompt.buttons] });
      if (quitDecision(response) === "stay") {
        event.preventDefault();
        trace("before-quit:stay", { running: runningTurns().length });
        return;
      }
    }
    // No more claims, then the towers, then the window: `stopLocalTurn` written
    // the final word in everyone's diary, the only line that distinguishes
    // “someone left” from “the harness crashed” in a report.
    stopClaimingLocalRuns?.();
    stopClaimingLocalRuns = null;
    stopAllLocalTurns();
    stopLocalRuntime();
    const window = mainWindow;
    mainWindow = null;
    window?.destroy();
  });
}
