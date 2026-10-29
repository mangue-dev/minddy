/**
 * Visibility rules of the admin dashboard (MIN-416, MIN-829): which tabs and
 * sections exist on THIS instance. Pure functions, tested — the components
 * only wire them to the capabilities hook.
 *
 * Convention: a capability state of `null` means "not known yet" (the
 * capabilities query has not resolved) and everything stays visible — no
 * flicker on first paint, and the server re-checks every route anyway.
 */

export type AdminTabId = "accounts" | "costs" | "models" | "instance";

export const ADMIN_TABS: AdminTabId[] = ["accounts", "costs", "models", "instance"];

export const DEFAULT_ADMIN_TAB: AdminTabId = "accounts";

/**
 * Tab values of earlier releases. `finances` is a CONTRACT: the spend-guard
 * push notification still opens `/admin?tab=finances`, so it must land on the
 * cost tracking that replaced it. Overview and Users merged into Accounts.
 */
const LEGACY_TABS: Record<string, AdminTabId> = {
  finances: "costs",
  overview: "accounts",
  users: "accounts",
};

/** The tab a `?tab=` value names today, or `null` when it names none. */
export function resolveAdminTab(value: string | null | undefined): AdminTabId | null {
  if (!value) return null;
  if ((ADMIN_TABS as string[]).includes(value)) return value as AdminTabId;
  return LEGACY_TABS[value] ?? null;
}

/**
 * Tabs present in the rail. The “Costs” screen reads the OpenRouter
 * ledger, so an instance without a linked OpenRouter key has nothing to
 * show there and the tab disappears.
 */
export function visibleAdminTabs(
  managedAiConfigured: boolean | null,
  instanceOverrides = false,
): AdminTabId[] {
  return ADMIN_TABS.filter(
    (tab) =>
      (tab !== "costs" || managedAiConfigured !== false) &&
      // The Instance tab (MIN-847) exists only where the environment file
      // lets the admin dashboard override variables: never on Minddy Cloud.
      (tab !== "instance" || instanceOverrides),
  );
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
