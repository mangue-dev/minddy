import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { displayName } from "@/lib/display-name";
import { getUserUsage } from "@/lib/server/usage";
import {
  activeAdminOverride,
  getBillingAccountForUser,
  getResolvedBilling,
  upsertBillingAccount,
} from "@/lib/server/billing-accounts";
import type { BillingPlanId } from "@/lib/billing-plans";
import { giftExpiresAt, isGiftExpired, type GiftDuration } from "@/lib/billing-gift";
import type { AdminAccountSummary, AdminUserRow } from "@/lib/types";

/**
 * Account support for instance administrators (MIN-90, MIN-829). The admin
 * routes and Numo's admin tools share these reads and writes; callers own the
 * admin check. Data minimisation (MIN-637): an account is reached only by its
 * exact address or id, and nothing here reads a profile, activity or project
 * content.
 */

/**
 * How many accounts the instance has. GoTrue counts them for a one-row page
 * (`x-total-count`), so no account is listed to know it.
 */
export async function countAdminAccounts(): Promise<number> {
  const { data, error } = await getServiceClient().auth.admin.listUsers({ page: 1, perPage: 1 });
  if (error) throw new Error(error.message);
  return (data as { total?: number }).total ?? 0;
}

/** Exact lookup for support; an empty or partial search cannot enumerate accounts. */
export async function fetchAdminAccount(params: {
  email?: string;
  userId?: string;
}): Promise<AdminAccountSummary | null> {
  const { data, error } = await getServiceClient().rpc("get_admin_account", {
    p_email: params.email ?? null,
    p_user_id: params.userId ?? null,
  });
  if (error) throw new Error(error.message);
  const row = data?.[0] as {
    user_id: string;
    email: string | null;
    name: string | null;
    email_confirmed: boolean;
  } | undefined;
  if (!row) return null;
  return {
    userId: row.user_id,
    name: displayName({ full_name: row.name, email: row.email }, "—"),
    email: row.email,
    emailConfirmed: row.email_confirmed,
  };
}

/**
 * The billing and budget of ONE account, read only when support opens it.
 * Failures throw: a failed read must never fabricate a free plan or a zero
 * balance.
 */
export async function fetchAdminUserDetails(userId: string): Promise<AdminUserRow | null> {
  const account = await fetchAdminAccount({ userId });
  if (!account) return null;
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const [usage, month] = await Promise.all([
    getUserUsage(userId),
    getServiceClient().rpc("get_user_usage_since", { p_user_id: userId, p_since: monthStart.toISOString() }),
  ]);
  if (month.error) throw new Error("Monthly usage unavailable");
  const billingAccount = usage.billing.account;
  const override = activeAdminOverride(billingAccount);
  const budgetUsd = usage.billing.plan.includedUsageUsd;
  return {
    ...account,
    billing: {
      planId: usage.billing.planId,
      source: usage.billing.source,
      override,
      overrideNote: override ? billingAccount?.admin_override_note ?? null : null,
      overrideExpiresAt: override ? billingAccount?.admin_override_expires_at ?? null : null,
      stripePlanId: billingAccount?.stripe_plan_id ?? null,
      stripeStatus: billingAccount?.stripe_subscription_status ?? null,
    },
    usage: {
      budgetUsd,
      spentUsd: usage.usedUsd,
      spentMonthUsd: Number(month.data?.total_cost) || 0,
      blocked: usage.usedUsd >= budgetUsd,
    },
  };
}

export interface AdminPlanState {
  userId: string;
  planId: BillingPlanId;
  source: AdminUserRow["billing"]["source"];
  stripePlanId: string | null;
  override: BillingPlanId | null;
  note: string | null;
  expiresAt: string | null;
}

async function planStateOf(userId: string): Promise<AdminPlanState> {
  const [billing, account] = await Promise.all([
    getResolvedBilling(userId),
    getBillingAccountForUser(userId),
  ]);
  // An expired override is not shown: it already gives nothing, and showing
  // it would make it look like a gift in progress.
  const override = activeAdminOverride(account);
  return {
    userId,
    planId: billing.planId,
    source: billing.source,
    stripePlanId: account?.stripe_plan_id ?? null,
    override,
    note: override ? (account?.admin_override_note ?? null) : null,
    expiresAt: override ? (account?.admin_override_expires_at ?? null) : null,
  };
}

/**
 * Gives (`planId`) or takes back (`null`) a plan. Only the override fields
 * change; the subscription state remains intact. A `null` duration keeps the
 * current deadline — but only while it is still ahead: a deadline left by a
 * finished gift would make the new one expire the second it is set.
 */
export async function setAdminPlanOverride(input: {
  userId: string;
  planId: BillingPlanId | null;
  duration: GiftDuration | null;
  note: string | null;
}): Promise<AdminPlanState> {
  const current = await getBillingAccountForUser(input.userId);
  const kept = isGiftExpired(current?.admin_override_expires_at)
    ? null
    : (current?.admin_override_expires_at ?? null);
  const expiresAt = !input.planId
    ? null
    : input.duration
      ? giftExpiresAt(input.duration)
      : kept;
  const note = input.note?.trim() ? input.note.trim().slice(0, 500) : null;

  await upsertBillingAccount(input.userId, {
    admin_override_plan_id: input.planId,
    admin_override_note: input.planId ? note : null,
    admin_override_expires_at: expiresAt,
  });
  return planStateOf(input.userId);
}
