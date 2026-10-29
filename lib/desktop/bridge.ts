/**
 * The bridge between page and desktop app (MIN-291) — the ENTIRE surface.
 *
 * The renderer loads remote code: it must only be able to call what is
 * exposed here, namely, by `contextBridge`. Hence the rule that this file
 * is essential: **it can be read in thirty seconds**. A closed list, no member who returns
 * a Node object, none that TAKES a file path, none that executes what
 * que ce soit.
 *
 * ⚠ The asymmetry of the last rule is the core of the local file (MIN-359), and
 * it is deliberate: `localRepo` **makes** a path, so that a screen can
 * tell which folder is attached. No member **accepts** one. A path
 * can therefore enter the app only through a system panel, that is to say through a
 * human gesture — remote code cannot designate `~/.ssh` by writing a
 * chain.
 *
 * The implementation lives in desktop/src/preload.ts and has no right to
 * expose more; this guy is what both sides read again.
 */

import type { DesktopAuthLink } from "@/lib/desktop/auth-link";
import type {
  LocalModelDiscoveryInput,
  LocalModelDiscoveryResult,
} from "@/lib/desktop/local-models";
import type { LocalRepoState } from "@/lib/desktop/local-repo";
import type {
  RepositorySkill,
  RepositorySkillSummary,
} from "@/lib/repository-skills";
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
   * Opens a URL in the system browser. This is where the trick goes
   * authentication, and it is the main process which refuses everything that is not
   * not `http(s)` — the renderer does not decide what we give to `open`.
   */
  openExternal(url: string): void;
  /** Open minddy's immutable Microsoft Store product page on Windows. */
  openWindowsStoreUpdate?(): void;
  /** Follow package update availability reported by Microsoft Store. */
  onWindowsStoreUpdateStatus?(handler: (available: boolean) => void): () => void;
  /**
   * The return of the authentication round (`minddy://auth?…`). Makes his
   * unsubscribe. The link received BEFORE the subscription is replayed upon subscription:
   * a click on the email link can launch the app, and the main process then
   * its deep link long before React was built.
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
   * REQUEST that the macOS buttons (close/minimize/full screen) be
   * shown or hidden.
   *
   * They live IN the sidebar, in place of the brand — not in a
   * band of theirs, which would push the whole column down and betray the
   * sewing. Folded back to the rail, its 56 px no longer hold them: we remove them,
   * rather than letting them spill over into navigation. The window remains
   * can be closed using the keyboard (⌘W, ⌘Q) and via the menu.
   *
   * It is a REQUEST and not an order, and the main process refuses it in one case
   * which matters: **in full screen it never hides anything**, otherwise we
   * would take away the mouse's only way out. What the buttons do
   * vraiment revient par `onWindowButtons`.
   */
  setWindowButtonsVisible(visible: boolean): void;
  /**
   * What the buttons REALLY do — the only thing the focus on
   * page has the right to rely. Returns unsubscribe, and replays the status
   * current subscription.
   *
   * Two entries, only one known to the page: the sidebar asks, and
   * the full screen decides without it. A layout that follows the request
   * rather than the result leaves a hole in place of the buttons as soon as we
   * goes full screen — it did.
   */
  onWindowButtons(handler: (visible: boolean) => void): () => void;
  /**
   * Returns the window to the front. Clicking on a native notification is
   * delivered to RENDERER (it was he who issued it) and does not wake up anything on its own:
   * without this member, clicking on the banner would navigate to a window remaining
   * behind the browser.
   */
  focus(): void;
  /**
   * Where is the shell update (MIN-353). Returns his unsubscription,
   * and replays the current state at subscription — otherwise a page mounted after the
   * download (that is to say all, once the window is reloaded)
   * would never know that a version is waiting for him.
   *
   * The values ​​and their rules are in `lib/desktop/update-status.ts`.
   */
  onUpdateStatus(handler: (status: DesktopUpdateStatus) => void): () => void;
  /**
   * REQUEST the installation of the downloaded update.
   *
   * It's not an order, and the nuance is the whole point of the member: the hand
   * process reopens the native box — “Install and Relaunch” / “Later” — at
   * instead of relaunching the app under the fingers of the person who has just clicked. The page
   * announces and reminds; it is the system which asks for the last yes, and it
   * only knows if the file is still there.
   *
   * No effect when nothing is ready.
   */
  installUpdate(): void;
  /**
   * The file for THIS machine attached to a project (MIN-359), **revalidated at
   * each appeal** against the deposit that the project has linked.
   *
   * A retained path proves nothing — the folder may have been moved, the disk
   * dismantled, the deposit re-linked elsewhere. Answer “attached” on the basis of
   * settings file would send a run to a folder that no longer exists,
   * and the failure would only appear on the first lap, on the machine, without logs.
   *
   * `fullName` is the `owner/repo` of the project: it is the page which knows it (the
   * main process does not have a session), and it is she who decides against what
   * we validate. This is not a security border — the file comes from a
   * human gesture in a system panel — but a safeguard against inattention.
   * `null` for a project with no linked repository: the folder is validated as a
   * plain git repository, without remote comparison.
   */
  localRepo(input: {
    projectId: string;
    fullName: string | null;
    aliases?: string[];
  }): Promise<LocalRepoState>;
  /**
   * Open the system panel and attach the chosen folder to this project.
   *
   * **This is the ONLY way a file path enters the app.**
   * A refused file (not a deposit, not the correct one) is not filed: the appeal returns
   * the verdict so that the screen says it, and the previous attachment remains in
   * place. A rollback returns the state to current, as if nothing had happened.
   */
  chooseLocalRepo(input: {
    projectId: string;
    fullName: string | null;
    aliases?: string[];
  }): Promise<LocalRepoState>;
  /** Forget the folder attached to this project. Returns the following state. */
  forgetLocalRepo(input: { projectId: string }): Promise<LocalRepoState>;
  /** The branches already present in the attached repository. */
  localRepoBranches?(input: {
    projectId: string;
    fullName: string | null;
    aliases?: string[];
  }): Promise<string[]>;
  /** Metadata-only Agent Skills found in the attached local checkout. */
  localRepoSkills?(input: {
    projectId: string;
    fullName: string | null;
    aliases?: string[];
  }): Promise<RepositorySkillSummary[]>;
  /** Full Markdown for one skill already discovered in the attached checkout. */
  localRepoSkill?(input: {
    projectId: string;
    fullName: string | null;
    aliases?: string[];
    path: string;
  }): Promise<RepositorySkill | null>;
  /**
   * Reads models exposed by Ollama or an OpenAI-compatible endpoint on the
   * local loop. The main process refuses any URL that does not point to
   * loopback, and never returns anything other than template ids.
   */
  discoverLocalModels(input: LocalModelDiscoveryInput): Promise<LocalModelDiscoveryResult>;
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
