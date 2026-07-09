import "server-only";

/**
 * Billing gate for Smart Assign. No plan system exists yet, so everyone is
 * entitled — this helper is the single check point where a future plan lookup
 * plugs in. Called when the owner enables the toggle AND at runtime before an
 * assignment run, so a plan downgrade silently disables execution without any
 * data migration.
 */
export async function canUseSmartAssign(_ownerId: string): Promise<boolean> {
  return true;
}
