const pendingCreations = new Map<string, Promise<unknown>>();

/** Register the server settlement that owns a newly allocated page ID. */
export function trackPageCreation<T>(
  pageId: string,
  settlement: Promise<T>,
): Promise<T> {
  pendingCreations.set(pageId, settlement);
  const clear = () => {
    if (pendingCreations.get(pageId) === settlement) {
      pendingCreations.delete(pageId);
    }
  };
  void settlement.then(clear, clear);
  return settlement;
}

/** Wait for creation before issuing a normal dependent request. */
export async function waitForPageCreation(pageId: string): Promise<void> {
  await pendingCreations.get(pageId);
}

export function isPageCreationPending(pageId: string): boolean {
  return pendingCreations.has(pageId);
}

/**
 * Queue a best-effort unload request after creation. A rejected creation drops
 * the dependent request because there is no server row to update or discard.
 */
export function afterPageCreation(
  pageId: string,
  operation: () => void,
): void {
  const settlement = pendingCreations.get(pageId);
  if (!settlement) {
    operation();
    return;
  }
  void settlement.then(operation).catch(() => {});
}
