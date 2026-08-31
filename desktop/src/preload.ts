import { contextBridge, ipcRenderer } from "electron";

import type { DesktopAuthLink } from "@/lib/desktop/auth-link";
import type { DesktopBridge } from "@/lib/desktop/bridge";
import type { DesktopChannel } from "@/lib/desktop/channel";
import { notificationCapabilitiesForPlatform } from "@/lib/desktop/notification-capabilities";
import type { DesktopUpdateStatus } from "@/lib/desktop/update-status";

/**
 * THE SURFACE, in full (MIN-291, APNs added in MIN-356).
 *
 * The renderer loads REMOTE code. This file is the only thing he can
 * reach beyond the web, and it must be read in thirty seconds: ten
 * named members, none that render a Node object, none that take a file path,
 * none that execute anything. Everything goes through a message to the main process,
 * which remains free to refuse — `openExternal` in particular does nothing while
 * that the URL did not pass navigation guard.
 *
 * The type is the one that the page compiles against (`lib/desktop/bridge.ts`):
 * the annotation below is what prevents this object from deriving from the contract.
 */

/**
 * The version, read on the renderer command line (MIN-322).
 *
 * It MUST be there before the first render — the bridge is a fixed object, not a
 * promise —, and a preload in `sandbox: true` has no environment to read.
 * It therefore went through a `ipcRenderer.sendSync`, which stops the renderer on
 * round trip time, at startup. `additionalArguments` puts it in
 * `process.argv` (cf. `webPreferences` in main.ts): it is already there when this
 * file executes, without a single round trip.
 *
 * The `sendSync` remains as backup, and it alone: ​​if the flag is missing, a
 * empty version would be displayed in the settings without anything saying so.
 */
const VERSION_FLAG = "--minddy-version=";
const PACKAGED_FLAG = "--minddy-packaged=";
const NATIVE_NOTIFICATIONS_FLAG = "--minddy-native-notifications=";
const WINDOWS_WNS_FLAG = "--minddy-windows-wns=";

function readVersion(): string {
  const flag = process.argv.find((arg) => arg.startsWith(VERSION_FLAG));
  if (flag) return flag.slice(VERSION_FLAG.length);
  return ipcRenderer.sendSync("minddy:version") as string;
}

const packaged = process.argv.some((arg) => arg === `${PACKAGED_FLAG}1`);
const nativeNotificationsAvailable = process.argv.some(
  (arg) => arg === `${NATIVE_NOTIFICATIONS_FLAG}1`
);
const windowsWnsAvailable = process.argv.some(
  (arg) => arg === `${WINDOWS_WNS_FLAG}1`
);
const notificationCapabilities = notificationCapabilitiesForPlatform(
  process.platform,
  packaged,
  nativeNotificationsAvailable,
  windowsWnsAvailable,
);

const nativePushBridge: Partial<DesktopBridge> =
  notificationCapabilities.backgroundTransport !== null
    ? {
        registerForPushNotifications(options) {
          return ipcRenderer.invoke("minddy:push:register", options) as ReturnType<
            NonNullable<DesktopBridge["registerForPushNotifications"]>
          >;
        },
        unregisterForPushNotifications() {
          return ipcRenderer.invoke("minddy:push:unregister") as Promise<void>;
        },
      }
    : {};

const notificationSettingsBridge: Partial<DesktopBridge> =
  notificationCapabilities.settings !== null
    ? {
        openNotificationSettings() {
          ipcRenderer.send("minddy:push:open-settings");
        },
      }
    : {};

const bridge: DesktopBridge = {
  version: readVersion(),
  platform: process.platform,
  notificationCapabilities,
  ...nativePushBridge,
  ...notificationSettingsBridge,

  openServerPicker() {
    ipcRenderer.send("minddy:server-picker:open");
  },

  checkForUpdates() {
    return ipcRenderer.invoke("minddy:update:check") as Promise<void>;
  },

  copyDiagnosticReport() {
    return ipcRenderer.invoke("minddy:diagnostics:copy") as Promise<boolean>;
  },

  openExternal(url: string) {
    ipcRenderer.send("minddy:open-external", url);
  },

  openWindowsStoreUpdate() {
    ipcRenderer.send("minddy:windows-store:open");
  },

  onWindowsStoreUpdateStatus(handler) {
    const listener = (_event: unknown, available: boolean) =>
      handler(available);
    ipcRenderer.on("minddy:windows-store-update-status", listener);
    ipcRenderer.send("minddy:windows-store-update-status-ready");
    return () => {
      ipcRenderer.removeListener(
        "minddy:windows-store-update-status",
        listener,
      );
    };
  },

  onAuthLink(handler: (link: DesktopAuthLink) => void) {
    const listener = (_event: unknown, link: DesktopAuthLink) => handler(link);
    ipcRenderer.on("minddy:auth-link", listener);
    // The link may have arrived BEFORE React is mounted: macOS launches
    // often the app with its `open-url` in your pocket. The main process keeps it and
    // plays this call again — otherwise the very first connection, the one that
    // opens the app, would be the only one not to work.
    ipcRenderer.send("minddy:auth-link-ready");
    return () => {
      ipcRenderer.removeListener("minddy:auth-link", listener);
    };
  },

  setBadgeCount(count: number) {
    ipcRenderer.send("minddy:set-badge", count);
  },

  showLocalNotification(payload) {
    ipcRenderer.send("minddy:notification:show", payload);
  },

  dismissLocalNotification(id) {
    ipcRenderer.send("minddy:notification:dismiss", id);
  },

  getLinuxBackgroundNotifications() {
    return ipcRenderer.invoke("minddy:linux-background:get") as ReturnType<
      NonNullable<DesktopBridge["getLinuxBackgroundNotifications"]>
    >;
  },

  setLinuxBackgroundNotifications(enabled) {
    return ipcRenderer.invoke(
      "minddy:linux-background:set",
      enabled
    ) as ReturnType<
      NonNullable<DesktopBridge["setLinuxBackgroundNotifications"]>
    >;
  },

  onLinuxBackgroundNotificationsChanged(handler) {
    const listener = (
      _event: unknown,
      state: Parameters<typeof handler>[0]
    ) => handler(state);
    ipcRenderer.on("minddy:linux-background:changed", listener);
    return () => {
      ipcRenderer.removeListener("minddy:linux-background:changed", listener);
    };
  },

  onNotificationTransportWake(handler) {
    const listener = () => handler();
    ipcRenderer.on("minddy:notification:wake", listener);
    return () => {
      ipcRenderer.removeListener("minddy:notification:wake", listener);
    };
  },

  setWindowButtonsVisible(visible: boolean) {
    ipcRenderer.send("minddy:window-buttons", visible);
  },

  onWindowButtons(handler: (visible: boolean) => void) {
    const listener = (_event: unknown, visible: boolean) => handler(visible);
    ipcRenderer.on("minddy:window-buttons-state", listener);
    // Same reason as for the deep link: the state exists before the subscription (the
    // window may be full screen upon loading). The main process
    // play again rather than letting the page go on a guess.
    ipcRenderer.send("minddy:window-buttons-ready");
    return () => {
      ipcRenderer.removeListener("minddy:window-buttons-state", listener);
    };
  },

  focus() {
    ipcRenderer.send("minddy:focus");
  },

  setChannel(channel: DesktopChannel) {
    ipcRenderer.send("minddy:set-channel", channel);
  },

  onUpdateStatus(handler: (status: DesktopUpdateStatus) => void) {
    const listener = (_event: unknown, status: DesktopUpdateStatus) =>
      handler(status);
    ipcRenderer.on("minddy:update-status", listener);
    // Same reason as for the macOS buttons: the download was able to complete
    // finish before this page exists — it reloads on each toggle
    // channel, and the shell lives for weeks. The main process replays.
    ipcRenderer.send("minddy:update-status-ready");
    return () => {
      ipcRenderer.removeListener("minddy:update-status", listener);
    };
  },

  installUpdate() {
    ipcRenderer.send("minddy:install-update");
  },

  // THE LOCAL FILE (MIN-359). The only three members who WAIT for a
  // response, hence `invoke` where all the rest `send`: read an attachment,
  // it's rereading the disc, and the page can't display anything before.
  //
  // None take a path: `chooseLocalRepo` opens the system panel, and
  // This is the only place where a path enters the app.
  localRepo(input) {
    return ipcRenderer.invoke("minddy:local-repo:read", input) as Promise<
      Awaited<ReturnType<DesktopBridge["localRepo"]>>
    >;
  },

  chooseLocalRepo(input) {
    return ipcRenderer.invoke("minddy:local-repo:choose", input) as Promise<
      Awaited<ReturnType<DesktopBridge["chooseLocalRepo"]>>
    >;
  },

  forgetLocalRepo(input) {
    return ipcRenderer.invoke("minddy:local-repo:forget", input) as Promise<
      Awaited<ReturnType<DesktopBridge["forgetLocalRepo"]>>
    >;
  },

  localRepoBranches(input) {
    return ipcRenderer.invoke("minddy:local-repo:branches", input) as Promise<
      Awaited<ReturnType<NonNullable<DesktopBridge["localRepoBranches"]>>>
    >;
  },

  localRunDiff(input) {
    return ipcRenderer.invoke("minddy:local-run-diff:read", input) as Promise<
      Awaited<ReturnType<NonNullable<DesktopBridge["localRunDiff"]>>>
    >;
  },

  discoverLocalModels(input) {
    return ipcRenderer.invoke("minddy:local-models:discover", input) as Promise<
      Awaited<ReturnType<DesktopBridge["discoverLocalModels"]>>
    >;
  },

};

contextBridge.exposeInMainWorld("minddy", bridge);
