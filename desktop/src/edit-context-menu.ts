import { Menu, type BrowserWindow } from "electron";

import { editContextMenuItems } from "@/lib/desktop/edit-context-menu";

/**
 * Show the native edit menu on right-click in fields and over selected text
 * (MIN-797). The rule is in `lib/desktop/edit-context-menu.ts`, with the reason.
 */
export function installEditContextMenu(window: BrowserWindow): void {
  window.webContents.on("context-menu", (_event, params) => {
    const items = editContextMenuItems(params);
    if (items.length === 0) return;
    Menu.buildFromTemplate(items).popup({ window });
  });
}
