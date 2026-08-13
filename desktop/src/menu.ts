import { Menu, app, shell, type BrowserWindow } from "electron";

import { DESKTOP_ORIGIN } from "@/lib/desktop/config";

/**
 * Le menu applicatif (MIN-291).
 *
 * La sonde de MIN-290 a montré que le menu PAR DÉFAUT d'Electron porte
 * 19 accélérateurs, dont deux qu'une app ne doit pas offrir sur une SPA
 * authentifiée : **⌘W ferme la fenêtre** (et il n'y en a qu'une : l'app devient
 * une icône de dock sans porte d'entrée) et **⌘R recharge** (soit, sur une SPA,
 * perdre l'écran en cours pour rien). Les autres — ⌘K, ⌘P, ⌘; — ne sont touchés
 * par aucun accélérateur, donc la palette et le reste passent tels quels.
 *
 * Le menu ne sert donc pas à ajouter : il sert à RETIRER, et à laisser en place
 * l'édition (couper/copier/coller, et surtout ⌘A / ⌘Z, qui sont des rôles natifs
 * sans lesquels rien ne fonctionne dans un champ) et la fenêtre.
 */
export function buildAppMenu(window: BrowserWindow): void {
  const isMac = process.platform === "darwin";

  const menu = Menu.buildFromTemplate([
    ...(isMac
      ? ([
          {
            label: app.name,
            submenu: [
              { role: "about" },
              { type: "separator" },
              { role: "services" },
              { type: "separator" },
              { role: "hide" },
              { role: "hideOthers" },
              { role: "unhide" },
              { type: "separator" },
              { role: "quit" },
            ],
          },
        ] as Electron.MenuItemConstructorOptions[])
      : []),
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
        // Pas de `reload` ni de `forceReload` : ⌘R sur une SPA authentifiée jette
        // l'écran en cours et ne répare rien. Le zoom, lui, est un réglage
        // d'accessibilité, et il reste.
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
          // À la place de ⌘W : la fenêtre est unique, la faire disparaître sans
          // moyen de la rappeler serait une impasse. On la cache, et l'icône du
          // dock la ramène.
          label: "Close Window",
          accelerator: "CmdOrCtrl+W",
          click: () => window.hide(),
        },
      ],
    },
    {
      role: "help",
      submenu: [
        {
          label: "minddy.app",
          click: () => void shell.openExternal(DESKTOP_ORIGIN),
        },
      ],
    },
  ]);

  Menu.setApplicationMenu(menu);
}
