import { Menu, app, clipboard, shell, type BrowserWindow } from "electron";

import type { DesktopChannel } from "@/lib/desktop/channel";
import { DESKTOP_STABLE_ORIGIN } from "@/lib/desktop/config";
import { hideWindow } from "./hide-window";
import { diagnosticReport } from "./run-log";
import { checkForUpdatesFromMenu } from "./updater";

/**
 * The application menu (MIN-291).
 *
 * The MIN-290 probe showed that Electron's DEFAULT menu carries
 * 19 accelerators, two of which an app should not offer on an authenticated SPA
 * : **⌘W closes the window** (and there is only one: the app becomes
 * a dock icon without an entrance) and **⌘R reloads** (i.e., on a SPA,
 * lose the current screen for nothing). Others — ⌘K, ⌘P, ⌘; — are not touched
 * by any accelerator, so the palette and the rest pass as is.
 *
 * The menu is therefore not used to add: it is used to REMOVE, and to leave in place
 * editing (cut/copy/paste, and especially ⌘A / ⌘Z, which are roles native
 * without which nothing works in a control) and the window.
 *
 * **One exception, and one only: the channel** (MIN-352). The settings screen
 * has the same switch, and that's where we look for it - but this
 * switch is SERVED by the origin it controls. If the preview doesn't load, the window no longer has a settings screen at all, and the menu is the only thing left to get back into production. This is why it
 * exists here, not for convenience.
 *
 * The menu is REBUILT at each toggle (`setChannel`, main.ts): the check mark is
 * set at construction, it is not updated every time. only.
 */
export function buildAppMenu(
  window: BrowserWindow,
  channel: DesktopChannel,
  onChannelChange: (channel: DesktopChannel) => void,
  server: {
    origin: string;
    isCustom: boolean;
    choose: () => void;
    useCloud: () => void;
  },
): void {
  const isMac = process.platform === "darwin";
  const serverMenuItems: Electron.MenuItemConstructorOptions[] = [
    {
      label: server.isCustom
        ? `Server: ${new URL(server.origin).host}`
        : "Server: minddy Cloud",
      enabled: false,
    },
    {
      label: "Connect to a Server…",
      click: server.choose,
    },
    ...(server.isCustom
      ? ([
          {
            label: "Use minddy Cloud",
            click: server.useCloud,
          },
        ] as Electron.MenuItemConstructorOptions[])
      : []),
  ];
  const applicationMenuItems: Electron.MenuItemConstructorOptions[] = [
    ...(isMac ? ([{ role: "about" }] as Electron.MenuItemConstructorOptions[]) : []),
    {
      // This explicitly requested check is the only one allowed to answer that
      // the app is up to date. Background checks remain silent.
      label: "Check for Updates…",
      click: () => void checkForUpdatesFromMenu(),
    },
    {
      label: "Preview Latest Features",
      type: "checkbox",
      checked: channel === "preview",
      click: (item) =>
        onChannelChange(item.checked ? "preview" : "stable"),
      visible: !server.isCustom,
    },
    { type: "separator" },
    ...serverMenuItems,
    ...(isMac
      ? ([
          { type: "separator" },
          { role: "services" },
          { type: "separator" },
          { role: "hide" },
          { role: "hideOthers" },
          { role: "unhide" },
        ] as Electron.MenuItemConstructorOptions[])
      : []),
    { type: "separator" },
    { role: "quit" },
  ];

  const menu = Menu.buildFromTemplate([
    {
      label: app.name,
      submenu: applicationMenuItems,
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "pasteAndMatchStyle" },
        { role: "selectAll" },
      ],
    },
    {
      label: "View",
      submenu: [
        // No `reload` nor `forceReload`: ⌘R on an authenticated SPA throws
        // the current screen and does not repair anything. The zoom is an adjustment
        // accessibility, and it remains.
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    {
      label: "Window",
      submenu: [
        { role: "minimize" },
        { role: "zoom" },
        { type: "separator" },
        {
          // Instead of ⌘W: the window is unique, make it disappear without
          // way to recall it would be a dead end. We hide it, and the icon of
          // dock brings it back. `hideWindow` rather than `hide()`: in full screen it
          // must close the Space first, otherwise it remains black (MIN-353).
          label: "Close Window",
          accelerator: "CmdOrCtrl+W",
          click: () => hideWindow(window),
        },
      ],
    },
    {
      role: "help",
      submenu: [
        {
          /**
 * THE DIAGNOSTIC REPORT (MIN-363), and it goes to the CLIPBOARD.
 *
 * This is the gesture that makes the first support ticket from
 * the local agent soluble: when a turn misses before the harness has spoken,
 * nothing was published on the server side — the process log is the only thing that speaks ([run-log.ts](run-log.ts)).
 *
 * **Never automatically sent.** The report carries a deposit path,
 * therefore a user name and the tree structure of a machine: it's
 * exactly what we don't ship without someone having proofread it.
 * Here, in Help, rather than in the settings: this is where we look for it
 * when the app is going bad, and the menu remains accessible even if the
 * page does not load — the very reason for which channel is there.
 */
          label: "Copy Diagnostic Report",
          click: () => clipboard.writeText(diagnosticReport()),
        },
        { type: "separator" },
        {
          // The SITE, not the active origin: this link leads to the showcase, which has no
          // no channel — and a preview of the landing interests no one.
          label: "minddy.app",
          click: () => void shell.openExternal(DESKTOP_STABLE_ORIGIN),
        },
      ],
    },
  ]);

  Menu.setApplicationMenu(menu);
}
