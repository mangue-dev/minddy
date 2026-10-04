import type { AppTabsSession } from "@/lib/app-tabs-session";

export type NavigationShortcut =
  | { kind: "tab-index"; index: number }
  | { kind: "tab-step"; direction: -1 | 1 }
  | { kind: "sidebar-step"; direction: -1 | 1 };

/** Physical number-row keys work even when Shift produces a symbol or accent. */
export function navigationShortcut(event: KeyboardEvent): NavigationShortcut | null {
  if (event.repeat || event.isComposing || event.altKey || !event.shiftKey ||
      !(event.metaKey || event.ctrlKey)) return null;

  switch (event.key) {
    case "ArrowLeft": return { kind: "tab-step", direction: -1 };
    case "ArrowRight": return { kind: "tab-step", direction: 1 };
    case "ArrowUp": return { kind: "sidebar-step", direction: -1 };
    case "ArrowDown": return { kind: "sidebar-step", direction: 1 };
  }

  // Control+Shift is the advertised number-row chord, including on macOS.
  // Command+Shift remains an alias when the OS lets those events through.
  const digit = /^Digit([0-9])$/.exec(event.code)?.[1] ??
    (/^[0-9]$/.test(event.key) ? event.key : null);
  if (digit === null) return null;
  return { kind: "tab-index", index: digit === "0" ? 9 : Number(digit) - 1 };
}

/** Use the full strip order, including pinned tabs and tabs in the overflow menu. */
export function activateShortcutTab(
  session: AppTabsSession | null,
  shortcut: Exclude<NavigationShortcut, { kind: "sidebar-step" }>,
): boolean {
  if (!session) return false;
  const { tabs, activeId, busy } = session.getSnapshot();
  if (busy || !tabs.length) return false;
  const current = tabs.findIndex((tab) => tab.id === activeId);
  const index = shortcut.kind === "tab-index" ? shortcut.index :
    current < 0 ? (shortcut.direction === 1 ? 0 : tabs.length - 1) :
      (current + shortcut.direction + tabs.length) % tabs.length;
  const tab = tabs[index];
  if (!tab) return false;
  // activate runs editor departure guards and preserves each tab's local state.
  void session.activate(tab.id);
  return true;
}
