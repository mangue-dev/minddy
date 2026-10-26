/**
 * The native edit menu on right-click, where it helps and nowhere else (MIN-797).
 *
 * Electron shows no context menu by default: until the shell listened to
 * `context-menu`, a right-click in a text field did nothing, so pasting with
 * the mouse was impossible in the desktop app. A browser offers its menu
 * everywhere; the shell offers it only in two places:
 *
 * - an **editable field** (input, textarea, the rich text editor): undo, redo,
 *   cut, copy, paste and select all;
 * - a **text selection** outside a field: copy, so a ticket description or a
 *   comment can be copied with the mouse.
 *
 * Everywhere else the right-click shows nothing, as before. The app's own
 * context menus (issue rows, sidebar items) call `preventDefault()` on the DOM
 * event, and Chromium then raises no `context-menu` at all: they keep winning.
 *
 * Spell checking is off (MIN-322), so the menu carries no suggestions.
 *
 * PURE module: the rule is tested here; `desktop/src/edit-context-menu.ts` only
 * turns the items into an Electron `Menu`.
 */

/** What Electron passes as `context-menu` params, reduced to what decides. */
export interface EditContextMenuParams {
  isEditable: boolean;
  selectionText: string;
  editFlags: {
    canUndo: boolean;
    canRedo: boolean;
    canCut: boolean;
    canCopy: boolean;
    canPaste: boolean;
    canSelectAll: boolean;
  };
}

/** A native role, so the OS provides its label, shortcut and behavior. */
export type EditContextMenuRole = "undo" | "redo" | "cut" | "copy" | "paste" | "selectAll";

export type EditContextMenuItem =
  | { role: EditContextMenuRole; enabled: boolean }
  | { type: "separator" };

/** The items to show, or an empty list when the right-click shows nothing. */
export function editContextMenuItems(params: EditContextMenuParams): EditContextMenuItem[] {
  const flags = params.editFlags;
  if (params.isEditable) {
    return [
      { role: "undo", enabled: flags.canUndo },
      { role: "redo", enabled: flags.canRedo },
      { type: "separator" },
      { role: "cut", enabled: flags.canCut },
      { role: "copy", enabled: flags.canCopy },
      { role: "paste", enabled: flags.canPaste },
      { type: "separator" },
      { role: "selectAll", enabled: flags.canSelectAll },
    ];
  }
  if (params.selectionText.trim() !== "") {
    return [{ role: "copy", enabled: flags.canCopy }];
  }
  return [];
}
