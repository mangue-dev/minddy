/**
 * The bridge between the page and the desktop app (MIN-291): the whole
 * surface the preload exposes on `window.minddy`.
 *
 * The page is remote code, and a deployed page may run in any installed
 * shell: a member some installed shells lack is optional, and the page checks
 * it exists before calling it. No member returns a Node object, takes
 * a file path or runs anything; each one is a message the main process may
 * refuse. Its channels, sender policies and argument parsing are declared in
 * `ipc-contract.ts`; `desktop/src/preload.ts` implements this type.
 */

import type { DesktopAuthLink } from "@/lib/desktop/auth-link";
import type { DesktopLocalNotificationPayload } from "@/lib/desktop/local-notification";
import type { LinuxBackgroundNotificationState } from "@/lib/desktop/linux-background";
import type { DesktopNotificationCapabilities } from "@/lib/desktop/notification-capabilities";
import type { DesktopUpdateStatus } from "@/lib/desktop/update-status";
import type { DesktopWindowMaterialState } from "@/lib/desktop/window-material";
import type {
  InstallMessage,
  LocalInstallProgress,
  LocalPrerequisiteId,
  LocalPrerequisiteResult,
} from "@/lib/desktop/local-installer";
import type { DesktopServerChoiceState } from "@/lib/desktop/server-choice";
import type { LocalAccountSession } from "@/lib/desktop/local-account";

/**
 * The self-hosting page's actions (MIN-781). The main process answers them
 * only from the app's own bundled document, `minddy-app://welcome/`. Like every member,
 * they never take a path: the installation folder is chosen in the native
 * dialog and stays in the main process.
 */
export interface DesktopServerChoiceBridge {
  state(): Promise<DesktopServerChoiceState | null>;
  useCloud(): Promise<void>;
  connect(origin: string): Promise<{ error?: InstallMessage }>;
  useExistingInstallation(): Promise<{ error?: InstallMessage }>;
  prerequisites(): Promise<LocalPrerequisiteResult[]>;
  chooseInstallFolder(): Promise<{ folder?: string; error?: InstallMessage }>;
  install(): Promise<{ error?: InstallMessage }>;
  cancelInstall(): void;
  onInstallProgress(handler: (progress: LocalInstallProgress) => void): () => void;
  openToolDownload(tool: LocalPrerequisiteId): void;
  /** Leave the page for the selected server, cancelling an installation in progress. */
  close(): void;
}

export interface DesktopNativePushRegistration {
  transport: "apns" | "wns";
  endpoint: string;
  installationId: string;
}

export interface DesktopBridge {
  /** Actual frame mode; older shells do not negotiate this capability. */
  readonly integratedWindowChrome?: boolean;
  /**
   * Match integrated caption controls and the native material's tint to the
   * page theme; absent in older shells. `followsSystem` leaves the app on the
   * system appearance when the page's own setting is "system".
   */
  setWindowChrome?(theme: "light" | "dark", followsSystem?: boolean): void;
  /** The blurred window material when the window was created (MIN-810); absent in older shells. */
  readonly windowMaterial?: DesktopWindowMaterialState;
  /** Saves the device preference and applies it live; resolves with the new state. */
  setWindowMaterialEnabled?(enabled: boolean): Promise<DesktopWindowMaterialState>;
  /** Follows the preference and the system's transparency settings; replays the current state. */
  onWindowMaterialChange?(handler: (state: DesktopWindowMaterialState) => void): () => void;
  /** The version of the shell (`app.getVersion()`), to display it. */
  readonly version: string;
  /**
   * The host platform, used only for platform-specific desktop chrome.
   * Optional because desktop shells released before 0.10.24 do not expose it.
   */
  readonly platform?: NodeJS.Platform;
  /** Open the app's bundled self-hosting page (`minddy-app://welcome/`). */
  openServerPicker?(): void;
  /** Present in shells that let the web page choose the server (MIN-781). */
  serverChoice?: DesktopServerChoiceBridge;
  /**
   * The session of the account the app manages on the minddy it installed on
   * this computer, so that instance needs no sign-in (MIN-781). Null anywhere
   * else: another server, or an installation the app did not create.
   */
  localSession?(): Promise<LocalAccountSession | null>;
  /** Run an explicitly requested shell update check. */
  checkForUpdates?(): Promise<void>;
  /** Explicit notification support. Optional only for older installed shells. */
  readonly notificationCapabilities?: DesktopNotificationCapabilities;
  /**
   * Opens a URL in the system browser, where sign-in happens. The main process
   * refuses anything the navigation guard blocks (`nav-guard.ts`).
   */
  openExternal(url: string): void;
  /**
   * Opens a prompt in the user's coding agent app (MIN-951). The main process
   * accepts only the links `isAgentAppLink` names. Absent in older shells,
   * where the page copies the prompt instead.
   */
  openAgentApp?(link: string): void;
  /** Open minddy's immutable Microsoft Store product page on Windows. */
  openWindowsStoreUpdate?(): void;
  /** Follow package update availability reported by Microsoft Store. */
  onWindowsStoreUpdateStatus?(handler: (available: boolean) => void): () => void;
  /**
   * The end of a sign-in in the browser (`minddy://auth?…`); returns the
   * unsubscriber. A link that arrived before the subscription is replayed: a
   * click on an email link can launch the app long before the page exists.
   */
  onAuthLink(handler: (link: DesktopAuthLink) => void): () => void;
  /** The Dock counter. `0` removes the badge. */
  setBadgeCount(count: number): void;
  /** Ask the main process to show one validated native banner. */
  showLocalNotification?(payload: DesktopLocalNotificationPayload): void;
  /** Close a native banner after its inbox row is read or removed. */
  dismissLocalNotification?(id: string): void;
  /** Read the Linux resident-session and XDG autostart state. */
  getLinuxBackgroundNotifications?(): Promise<LinuxBackgroundNotificationState | null>;
  /** Persist Linux background consent and synchronize its XDG autostart entry. */
  setLinuxBackgroundNotifications?(
    enabled: boolean
  ): Promise<LinuxBackgroundNotificationState | null>;
  /** Follow Linux notification-server failures and recoveries observed by Electron. */
  onLinuxBackgroundNotificationsChanged?(
    handler: (state: LinuxBackgroundNotificationState) => void
  ): () => void;
  /** Wake the renderer's realtime connection after the desktop resumes. */
  onNotificationTransportWake?(handler: () => void): () => void;
  /**
   * Registers the packaged app with its native background transport. Optional
   * so that the deployed site remains compatible with the old shells.
   */
  registerForPushNotifications?(
    options?: { activate?: boolean }
  ): Promise<DesktopNativePushRegistration | null>;
  /** Remove this installation's native registration. */
  unregisterForPushNotifications?(): Promise<void>;
  /** Directly opens minddy's Notifications sheet in System Settings. */
  openNotificationSettings?(): void;
  /**
   * Whether the macOS window buttons sit in the page's title area; returns the
   * unsubscriber and replays the current state. Full screen takes them away
   * without the page asking, so the layout follows this, not a guess.
   */
  onWindowButtons(handler: (visible: boolean) => void): () => void;
  /**
   * Brings the window to the front. A click on a notification the page
   * showed reaches the page, which cannot raise its own window.
   */
  focus(): void;
  /**
   * The shell update's progress (MIN-353, `update-status.ts`); returns the
   * unsubscriber and replays the current state, since a page reloaded after
   * the download would otherwise never learn a version is waiting.
   */
  onUpdateStatus(handler: (status: DesktopUpdateStatus) => void): () => void;
  /**
   * Asks to install the downloaded update: the main process reopens its native
   * “Install and Relaunch” / “Later” dialog rather than relaunching under the
   * person's click. No effect when nothing is ready.
   */
  installUpdate(): void;
  /**
   * Commits this window's DOM storage to disk now. Chromium otherwise defers
   * localStorage commits by several seconds, so a crash or forced quit right
   * after an acknowledged local save loses it. Optional for compatibility with
   * desktop shells released before it existed.
   */
  flushStorage?(): Promise<void>;
  /**
   * Restarts the local instance this desktop app runs (MIN-847); `false` when
   * the window does not show that instance. Optional for desktop shells
   * released before it existed.
   */
  restartLocalInstance?(): Promise<boolean>;
}

declare global {
  interface Window {
    minddy?: DesktopBridge;
  }
}

/** The bridge, or `null` in a browser (and during server rendering). */
export function getDesktopBridge(): DesktopBridge | null {
  if (typeof window === "undefined") return null;
  return window.minddy ?? null;
}

/**
 * Resolve the shell platform while the deployed web app is running in an older
 * desktop build. Those builds predate `DesktopBridge.platform`, but Chromium's
 * platform string still distinguishes the three supported desktop families.
 */
export function desktopBridgePlatform(
  bridge: Pick<DesktopBridge, "platform">,
  browserPlatform: string,
): NodeJS.Platform | null {
  if (bridge.platform) return bridge.platform;
  if (/^mac/i.test(browserPlatform)) return "darwin";
  if (/^win/i.test(browserPlatform)) return "win32";
  if (/linux/i.test(browserPlatform)) return "linux";
  return null;
}

/**
 * Are we running in the desktop app?
 *
 * The presence of the bridge, never the user agent: the suffix `minddy-desktop/…` is
 * there for the server logs, and a user agent fakes itself from the page.
 */
export function isDesktop(): boolean {
  return getDesktopBridge() !== null;
}
