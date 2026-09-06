const pending = new Set<string>();
const key = (pageId: string) => `minddy:database-setup:${pageId}`;

/** Remember setup only for databases created through this browser. */
export function markDatabaseSetup(pageId: string): void {
  pending.add(pageId);
  try {
    localStorage.setItem(key(pageId), "pending");
  } catch {
    /* The current session still offers setup when storage is unavailable. */
  }
}

export function isDatabaseSetupPending(pageId: string): boolean {
  try {
    return (
      pending.has(pageId) || localStorage.getItem(key(pageId)) === "pending"
    );
  } catch {
    return pending.has(pageId);
  }
}

export function dismissDatabaseSetup(pageId: string): void {
  pending.delete(pageId);
  try {
    localStorage.removeItem(key(pageId));
  } catch {
    /* Dismissal still takes effect for the current session. */
  }
}
