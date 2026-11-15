import { contextBridge, ipcRenderer } from "electron";

import type { DesktopBridge } from "@/lib/desktop/bridge";
import { desktopIpcRenderer } from "@/lib/desktop/ipc-renderer";
import { parseDesktopLaunchState } from "@/lib/desktop/launch-state";

/**
 * The `DesktopBridge` (lib/desktop/bridge.ts) the remote page receives. Each
 * member is a message on a channel of lib/desktop/ipc-contract.ts, which the
 * main process checks and may refuse.
 */

const ipc = desktopIpcRenderer(ipcRenderer);
const launch = parseDesktopLaunchState(process.argv);
const capabilities = launch.notificationCapabilities;

const nativePushBridge: Partial<DesktopBridge> =
  capabilities.backgroundTransport !== null
    ? {
        registerForPushNotifications: (options) =>
          ipc.invoke("minddy:push:register", { activate: options?.activate === true }),
        unregisterForPushNotifications: () => ipc.invoke("minddy:push:unregister"),
      }
    : {};

const notificationSettingsBridge: Partial<DesktopBridge> =
  capabilities.settings !== null
    ? { openNotificationSettings: () => ipc.send("minddy:push:open-settings") }
    : {};

const bridge: DesktopBridge = {
  version: launch.version,
  platform: process.platform,
  integratedWindowChrome: launch.integratedWindowChrome,
  setWindowChrome: (theme, followsSystem) => ipc.send("minddy:window-chrome", theme, followsSystem),
  // The theme script marks the document with it before the first paint.
  windowMaterial: launch.windowMaterial ?? undefined,
  setWindowMaterialEnabled: (enabled) => ipc.invoke("minddy:window-material:set", enabled === true),
  onWindowMaterialChange: (handler) => ipc.subscribe("minddy:window-material-state", handler),
  notificationCapabilities: capabilities,
  ...nativePushBridge,
  ...notificationSettingsBridge,

  openServerPicker: () => ipc.send("minddy:server-picker:open"),
  localSession: () => ipc.invoke("minddy:local-account:session"),
  serverChoice: {
    state: () => ipc.invoke("minddy:server-choice:state"),
    useCloud: () => ipc.invoke("minddy:server-choice:cloud"),
    connect: (origin) => ipc.invoke("minddy:server-choice:connect", origin),
    useExistingInstallation: () => ipc.invoke("minddy:server-choice:existing"),
    prerequisites: () => ipc.invoke("minddy:server-choice:prerequisites"),
    chooseInstallFolder: () => ipc.invoke("minddy:server-choice:choose-folder"),
    install: () => ipc.invoke("minddy:server-choice:install"),
    cancelInstall: () => ipc.send("minddy:server-choice:cancel-install"),
    onInstallProgress: (handler) => ipc.subscribe("minddy:server-choice:progress", handler),
    openToolDownload: (tool) => ipc.send("minddy:server-choice:tool-download", tool),
    close: () => ipc.send("minddy:server-choice:close"),
  },

  checkForUpdates: () => ipc.invoke("minddy:update:check"),
  openExternal: (url) => ipc.send("minddy:open-external", url),
  openAgentApp: (link) => ipc.send("minddy:open-agent-app", link),
  openWindowsStoreUpdate: () => ipc.send("minddy:windows-store:open"),
  onWindowsStoreUpdateStatus: (handler) => ipc.subscribe("minddy:windows-store-update-status", handler),
  onAuthLink: (handler) => ipc.subscribe("minddy:auth-link", handler),
  setBadgeCount: (count) => ipc.send("minddy:set-badge", count),
  showLocalNotification: (payload) => ipc.send("minddy:notification:show", payload),
  dismissLocalNotification: (id) => ipc.send("minddy:notification:dismiss", id),
  getLinuxBackgroundNotifications: () => ipc.invoke("minddy:linux-background:get"),
  setLinuxBackgroundNotifications: (enabled) => ipc.invoke("minddy:linux-background:set", enabled),
  onLinuxBackgroundNotificationsChanged: (handler) => ipc.subscribe("minddy:linux-background:changed", handler),
  onNotificationTransportWake: (handler) => ipc.subscribe("minddy:notification:wake", handler),
  onWindowButtons: (handler) => ipc.subscribe("minddy:window-buttons-state", handler),
  focus: () => ipc.send("minddy:focus"),
  onUpdateStatus: (handler) => ipc.subscribe("minddy:update-status", handler),
  installUpdate: () => ipc.send("minddy:install-update"),
  restartLocalInstance: () => ipc.invoke("minddy:local-runtime:restart"),
  flushStorage: () => ipc.invoke("minddy:storage:flush"),
};

/**
 * Members of retired features that pages of earlier minddy releases call
 * without checking they exist (self-hosted servers may still run those
 * releases: deploy/self-hosted/compatibility.json). Without them those pages
 * would throw a TypeError. Pages of 0.10.19 to 0.10.30 call the first four:
 * `localRepo` never settles, so their local folder card, shown once it
 * answers, stays hidden; their composer's "My machine" gets `none` and does
 * nothing, as since local runs left the shell (MIN-721). Pages up to 0.30.1
 * call `discoverLocalModels` for an account with a local provider key; it
 * finds nothing, so they keep the server's empty list (MIN-996).
 */
const retiredMembers = {
  setWindowButtonsVisible: () => {},
  localRepo: () => new Promise<never>(() => {}),
  chooseLocalRepo: async () => ({ status: "none" as const }),
  forgetLocalRepo: async () => ({ status: "none" as const }),
  discoverLocalModels: async () => ({ ok: false as const, reason: "invalid_endpoint" as const }),
};

contextBridge.exposeInMainWorld("minddy", { ...retiredMembers, ...bridge });
