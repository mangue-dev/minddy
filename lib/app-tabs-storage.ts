const PREFIX = "minddy.app-tabs.";
export const appTabsStorageKey = (owner: string) => `${PREFIX}${owner}`;
export function clearAppTabsWindowState() {
  if (typeof window === "undefined") return;
  try {
    for (const key of Object.keys(window.sessionStorage)) {
      if (key.startsWith(PREFIX)) window.sessionStorage.removeItem(key);
    }
  } catch { /* Storage is optional. */ }
}
