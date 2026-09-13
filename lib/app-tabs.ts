import { normalizeAppTabLocation } from "./app-tab-location";

export interface AppTab {
  id: string;
  user_id: string;
  href: string;
  custom_name: string | null;
  pinned: boolean;
  position: number;
  revision: number;
  created_at: string;
  updated_at: string;
}
export type AppTabPatch = Partial<Pick<AppTab, "href" | "custom_name" | "pinned">>;
export const APP_TAB_MAX_NAME = 200;
export const isAppTabId = (value: unknown): value is string =>
  typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

export function createHomeTab(userId: string, id = crypto.randomUUID(), position = 0): AppTab {
  const now = new Date().toISOString();
  return { id, user_id: userId, href: "/home", custom_name: null, pinned: false,
    position, revision: 1, created_at: now, updated_at: now };
}

export function sortAppTabs(tabs: readonly AppTab[]): AppTab[] {
  return [...tabs].sort((a, b) => Number(b.pinned) - Number(a.pinned) ||
    a.position - b.position || a.id.localeCompare(b.id));
}

/** Keep valid account rows; malformed destinations remain recoverable at Home. */
export function reconcileAppTabs(tabs: readonly AppTab[], userId: string): AppTab[] {
  const unique = new Map<string, AppTab>();
  for (const tab of tabs) {
    if (!isAppTabId(tab.id) || tab.user_id !== userId || !Number.isSafeInteger(tab.revision) || tab.revision < 1) continue;
    const previous = unique.get(tab.id);
    if (previous && previous.revision >= tab.revision) continue;
    unique.set(tab.id, { ...tab, href: normalizeAppTabLocation(tab.href) ?? "/home" });
  }
  return sortAppTabs([...unique.values()]);
}

/** Closing the last tab is refused. Prefer the next neighbor, then the previous. */
export function selectTabAfterClose(tabs: readonly AppTab[], id: string, activeId: string): string {
  const ordered = sortAppTabs(tabs);
  if (ordered.length <= 1 || id !== activeId) return activeId;
  const index = ordered.findIndex((tab) => tab.id === id);
  return ordered[index + 1]?.id ?? ordered[index - 1]?.id ?? ordered[0].id;
}

export function normalizeAppTabPatch(raw: unknown): AppTabPatch | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const input = raw as Record<string, unknown>;
  const patch: AppTabPatch = {};
  if ("href" in input) {
    const href = normalizeAppTabLocation(input.href);
    if (!href) return null;
    patch.href = href;
  }
  if ("custom_name" in input) {
    if (input.custom_name !== null && typeof input.custom_name !== "string") return null;
    const name = (input.custom_name as string | null)?.trim().replace(/\s+/g, " ") || null;
    // eslint-disable-next-line no-control-regex -- Reject non-printable characters in tab names.
    if (name && (name.length > APP_TAB_MAX_NAME || /[\u0000-\u001f\u007f]/.test(name))) return null;
    patch.custom_name = name;
  }
  if ("pinned" in input) {
    if (typeof input.pinned !== "boolean") return null;
    patch.pinned = input.pinned;
  }
  return Object.keys(patch).length ? patch : null;
}
