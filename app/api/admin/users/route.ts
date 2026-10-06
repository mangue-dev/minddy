import { NextResponse, type NextRequest } from "next/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { isAdminUser } from "@/lib/server/admin";
import { getUserUsage } from "@/lib/server/usage";
import { fetchAdminAccount, setUserInternal } from "@/lib/server/admin-users";
import { getServiceClient } from "@/lib/supabase-service";
import { activeAdminOverride } from "@/lib/server/billing-accounts";
import type { AdminUserRow } from "@/lib/types";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PRIVATE_HEADERS = { "Cache-Control": "private, no-store" };

async function requireAdmin(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  if (!(await isAdminUser(auth.user, auth.claims))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}

/** Exact-email support lookup. The address stays out of request URLs and access logs. */
export async function POST(request: NextRequest) {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  let email: string;
  try {
    const body = await request.json();
    email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Enter a complete email address" }, { status: 400 });
  }
  try {
    const account = await fetchAdminAccount({ email });
    return NextResponse.json({ account }, { headers: PRIVATE_HEADERS });
  } catch {
    console.error("[admin/users] account lookup failed");
    return NextResponse.json({ error: "Query failed" }, { status: 500, headers: PRIVATE_HEADERS });
  }
}

/** Read billing and budget only for the account explicitly opened by support. */
export async function GET(request: NextRequest) {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  const userId = request.nextUrl.searchParams.get("userId") ?? "";
  if (!UUID_RE.test(userId)) {
    return NextResponse.json({ error: "Invalid userId" }, { status: 400 });
  }
  try {
    const account = await fetchAdminAccount({ userId });
    if (!account) {
      return NextResponse.json({ error: "Account not found" }, { status: 404, headers: PRIVATE_HEADERS });
    }
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
    const user: AdminUserRow = {
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
    return NextResponse.json({ user }, { headers: PRIVATE_HEADERS });
  } catch {
    // Failed reads must never fabricate a free plan or a zero balance.
    console.error("[admin/users] account details failed");
    return NextResponse.json({ error: "Query failed" }, { status: 500, headers: PRIVATE_HEADERS });
  }
}

/** PATCH { userId, internal } — toggles the “internal account” flag. */
export async function PATCH(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  if (!(await isAdminUser(auth.user, auth.claims))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { userId?: unknown; internal?: unknown };
  try {
    const parsed: unknown = await request.json();
    // Non-object body (null, string…): refused here rather than crashing further down.
    if (!parsed || typeof parsed !== "object") throw new Error("not an object");
    body = parsed as { userId?: unknown; internal?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const userId = typeof body.userId === "string" ? body.userId : "";
  if (!UUID_RE.test(userId)) {
    return NextResponse.json({ error: "Invalid userId" }, { status: 400 });
  }
  if (typeof body.internal !== "boolean") {
    return NextResponse.json({ error: "Invalid internal" }, { status: 400 });
  }

  try {
    await setUserInternal(userId, body.internal);
  } catch (err) {
    console.error("[admin/users] internal toggle failed:", (err as Error).message);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }

  return NextResponse.json({ userId, internal: body.internal });
}
