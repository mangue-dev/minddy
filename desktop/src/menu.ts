import { Menu, app, type BrowserWindow } from "electron";

import { DESKTOP_STABLE_ORIGIN } from "@/lib/desktop/config";
import { hideWindow } from "./hide-window";
import { openDesktopExternal } from "./open-external";
import { checkForUpdatesManually } from "./updater";

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
 * The server items are the exception: if a custom server does not load, the
 * window has no settings screen at all, and the menu is the only way back to
 * minddy Cloud. The menu is REBUILT when the server changes (`rebuildAppMenu`,
 * main.ts) because its labels are set at construction.
 */
export function buildAppMenu(
  window: BrowserWindow,
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
      click: () => void checkForUpdatesManually(),
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
          // The SITE, not the active origin: this link leads to the showcase,
          // which has nothing to do with the server the window is on.
          label: "minddy.app",
          click: () => void openDesktopExternal(DESKTOP_STABLE_ORIGIN),
        },
      ],
    },
  ]);

  Menu.setApplicationMenu(menu);
}
