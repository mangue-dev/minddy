import { matchesModShiftCombo } from "@/lib/keyboard/mod-combo";
import { hasVisibleOpenDialog, isVisibleOverlay } from "@/lib/visible-overlays";

/**
 * ⌘⇧P / Ctrl+Shift+P changes project wherever a project picker is on screen
 * (MIN-900): the "Create in" control of the creation dialogs and the sidebar
 * project switcher. A combo, so it also works while writing.
 */
export const PROJECT_SWITCH_KEY = "p";

type ShortcutEvent = Pick<
  KeyboardEvent,
  "key" | "repeat" | "metaKey" | "ctrlKey" | "shiftKey" | "altKey" | "defaultPrevented"
>;

export function isProjectSwitchShortcut(event: ShortcutEvent): boolean {
  return matchesModShiftCombo(event, PROJECT_SWITCH_KEY);
}

/**
 * Does the sidebar switcher behind `trigger` take this keystroke?
 *
 * Its own open menu always yields to it, to close. Otherwise an open dialog
 * owns the combo (the creation dialog changes ITS project with it), and so
 * does an earlier handler that already consumed it. A trigger that is not
 * displayed (hidden sidebar, retained background tab) has no menu to anchor,
 * and with two switchers on screen the first one to see the keystroke marks
 * it handled, so the other stands aside.
 */
export function sidebarTakesProjectSwitch(
  event: ShortcutEvent,
  trigger: Element | null,
  menuOpen = false,
): boolean {
  if (event.defaultPrevented || !isProjectSwitchShortcut(event)) return false;
  if (menuOpen) return true;
  if (!trigger || !isVisibleOverlay(trigger)) return false;
  return !hasVisibleOpenDialog();
}
