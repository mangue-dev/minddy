/**
 * Visibility rules of the admin dashboard (MIN-416): which tabs and sections
 * exist on THIS instance. Pure functions, tested — the components only wire
 * them to the capabilities hook.
 *
 * Convention: a capability state of `null` means "not known yet" (the
 * capabilities query has not resolved) and everything stays visible — no
 * flicker on first paint, and the server re-checks every route anyway.
 */

export type AdminTabId = "overview" | "users" | "finances" | "models";

export const ADMIN_TABS: AdminTabId[] = ["overview", "users", "finances", "models"];

/**
 * Tabs present in the rail. The “Finances” screen reads the OpenRouter
 * ledger, so an instance without a linked OpenRouter key has nothing to
 * show there and the tab disappears.
 */
export function visibleAdminTabs(managedAiConfigured: boolean | null): AdminTabId[] {
  return ADMIN_TABS.filter((tab) => tab !== "finances" || managedAiConfigured !== false);
}

/**
 * Whether the “Gift a plan” section renders for an account. Gifting needs
 * something to gift: Stripe or the paid plans must be configured. An
 * override already in progress always keeps its section — otherwise there
 * would be no way to take it back.
 */
export function giftSectionVisible(
  managedBillingConfigured: boolean | null,
  hasOverride: boolean,
): boolean {
  return managedBillingConfigured !== false || hasOverride;
}
