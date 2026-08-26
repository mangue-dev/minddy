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
import type { DesktopChannel } from "@/lib/desktop/channel";
import type {
  LocalModelDiscoveryInput,
  LocalModelDiscoveryResult,
} from "@/lib/desktop/local-models";
import type { LocalRepoState } from "@/lib/desktop/local-repo";
import type { DesktopUpdateStatus } from "@/lib/desktop/update-status";

export interface DesktopBridge {
  /** The version of the shell (`app.getVersion()`), to display it. */
  readonly version: string;
  /** The host platform, used only for platform-specific desktop chrome. */
  readonly platform: NodeJS.Platform;
  /**
   * Opens a URL in the system browser. This is where the trick goes
   * authentication, and it is the main process which refuses everything that is not
   * not `http(s)` — the renderer does not decide what we give to `open`.
   */
  openExternal(url: string): void;
  /**
   * The return of the authentication round (`minddy://auth?…`). Makes his
   * unsubscribe. The link received BEFORE the subscription is replayed upon subscription:
   * a click on the email link can launch the app, and the main process then
   * its deep link long before React was built.
   */
  onAuthLink(handler: (link: DesktopAuthLink) => void): () => void;
  /** The dock counter. `0` removes the tablet. */
  setBadgeCount(count: number): void;
  /**
   * Registers the signed bundle with APNs and makes its token current. Optional
   * so that the deployed site remains compatible with the old shells.
   */
  registerForPushNotifications?(options?: { activate?: boolean }): Promise<{
    token: string;
    installationId: string;
  } | null>;
  /** Retire l'inscription APNs de cette installation. */
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
   * Change CHANNEL — the version of minddy that the window shows (MIN-352).
   *
   * In writing only, and this is intentional: the page does not have to ask in which
   * channel she is, she reads it on her own origin
   * (`desktopChannelForOrigin`, lib/desktop/channel.ts). A channel copied here
   * would be a second state to keep synchronous with the URL actually loaded.
   *
   * The call does not return control: the main process retains the choice, then
   * reloads the window on the other origin. This document no longer exists afterward.
   */
  setChannel(channel: DesktopChannel): void;
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
  /**
   * Reads models exposed by Ollama or an OpenAI-compatible endpoint on the
   * local loop. The main process refuses any URL that does not point to
   * loopback, and never returns anything other than template ids.
   */
  discoverLocalModels(input: LocalModelDiscoveryInput): Promise<LocalModelDiscoveryResult>;
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
 * Are we running in the desktop app?
 *
 * The presence of the bridge, never the user agent: the suffix `minddy-desktop/…` is
 * there for the server logs, and a user agent fakes itself from the page.
 */
export function isDesktop(): boolean {
  return getDesktopBridge() !== null;
}
