import { Menu, app, shell, type BrowserWindow } from "electron";

import type { DesktopChannel } from "@/lib/desktop/channel";
import { DESKTOP_STABLE_ORIGIN } from "@/lib/desktop/config";
import { checkForUpdatesFromMenu } from "./updater";

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
 *
 * **Une exception, et une seule : le canal** (MIN-352). L'écran de réglages
 * porte le même interrupteur, et c'est là qu'on le cherche — mais cet
 * interrupteur-là est SERVI par l'origine qu'il commande. Si la preview ne
 * charge pas, la fenêtre n'a plus d'écran de réglages du tout, et le menu est la
 * seule chose qui reste pour revenir en production. C'est pour ce cas-là qu'il
 * existe ici, pas pour le confort.
 *
 * Le menu se RECONSTRUIT à chaque bascule (`setChannel`, main.ts) : la coche est
 * posée à la construction, elle ne se met pas à jour toute seule.
 */
export function buildAppMenu(
  window: BrowserWindow,
  channel: DesktopChannel,
  onChannelChange: (channel: DesktopChannel) => void
): void {
  const isMac = process.platform === "darwin";

  const menu = Menu.buildFromTemplate([
    ...(isMac
      ? ([
          {
            label: app.name,
            submenu: [
              // `about` ouvre le panneau natif, dont le contenu est posé par
              // `app.setAboutPanelOptions` (main.ts). Sans ça, il affiche le nom
              // et la version d'Electron.
              { role: "about" },
              {
                // La vérification DEMANDÉE : c'est la seule qui répond « vous
                // êtes à jour », parce qu'ici quelqu'un a posé la question. Celle
                // qui tourne toute seule, elle, se tait (updater.ts).
                label: "Check for Updates…",
                click: () => void checkForUpdatesFromMenu(),
              },
              {
                // Le canal, en clair : ce n'est pas « une bêta », c'est la même
                // app servie par le dernier commit de `main`. Mêmes données,
                // mêmes comptes — d'où l'absence d'avertissement ici, et la
                // phrase complète dans les réglages, où il y a la place.
                label: "Preview Latest Features",
                type: "checkbox",
                checked: channel === "preview",
                click: (item) =>
                  onChannelChange(item.checked ? "preview" : "stable"),
              },
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
          // Le SITE, pas l'origine active : ce lien mène à la vitrine, qui n'a
          // pas de canal — et une preview de la landing n'intéresse personne.
          label: "minddy.app",
          click: () => void shell.openExternal(DESKTOP_STABLE_ORIGIN),
        },
      ],
    },
  ]);

  Menu.setApplicationMenu(menu);
}
