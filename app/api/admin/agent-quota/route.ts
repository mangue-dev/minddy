import { NextResponse, type NextRequest } from "next/server";

import { getAuthedUser } from "@/lib/server/api-auth";
import { isAdminUser } from "@/lib/server/admin";
import { getServiceClient } from "@/lib/supabase-service";
import { getBillingWindow, getUserUsage } from "@/lib/server/usage";
import type { AdminQuotaResetsResponse } from "@/lib/types";

/**
 * Account USAGE BUDGET administration (`/admin` → account detail) .
 * Same gate as other admin endpoints: JWT via getClaims + isAdminUser.
 *
 * Since MIN-72 there is NO LONGER a global ceiling: the limit of each
 * user is the monthly budget of HIS plan (lib/billing-plans.ts), all
 * features confondues.
 *
 * GET ?userId=<uuid> → resets of SA billing period in
 * courses, from the most recent to the oldest.
 * POST { userId } → asks one more: the countdown starts again from
 *                           maintenant.
 * DELETE ?id=<uuid> → removes one; the previous one takes control.
 *
 * They STACK: the table is a register (one line per gesture), and it is the
 * most recent which sets the start of the counted window. Offer a second
 * extension in the month therefore no longer makes the trace of the first disappear —
 * and the account of the period says what has already been given.
 *
 * A reset DOES NOT DELETE ANY cost data: `ai_usage` is a ledger
 * append-only, analysis source. We only move the start of the window
 * counted (see migrations 20260811090000 and 20261105090000).
 */

async function requireAdmin(
  request: NextRequest,
): Promise<{ ok: true; userId: string } | { ok: false; response: NextResponse }> {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return { ok: false, response: auth.response };
  if (!(await isAdminUser(auth.user))) {
    return { ok: false, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { ok: true, userId: auth.user.id };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The complete state of an account's budget AFTER writing, recalculated on the server side.
 *
 * The three verbs return it, and it is intentional: remove a reset
 * REOPEN the window on expenses that were no longer counted — the customer did not
 * no way to guess the new amount, and guessing it would flash a
 * a false number until the next load.
 */
async function quotaStateOf(userId: string): Promise<AdminQuotaResetsResponse> {
  const usage = await getUserUsage(userId);
  const periodStart = getBillingWindow(usage.billing).start;

  const service = getServiceClient();
  const { data, error } = await service
    .from("agent_quota_resets")
    .select("id, reset_at")
    .eq("user_id", userId)
    .gte("reset_at", periodStart)
    .order("reset_at", { ascending: false });
  if (error) throw new Error(error.message);

  const budgetUsd = usage.billing.plan.includedUsageUsd;
  return {
    periodStart,
    resets: ((data ?? []) as Array<{ id: string; reset_at: string }>).map((row) => ({
      id: row.id,
      at: row.reset_at,
    })),
    usage: {
      spentUsd: usage.usedUsd,
      blocked: usage.usedUsd >= budgetUsd,
    },
  };
}

export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin.ok) return admin.response;

  const userId = request.nextUrl.searchParams.get("userId") ?? "";
  if (!UUID_RE.test(userId)) {
    return NextResponse.json({ error: "Invalid userId" }, { status: 400 });
  }

  try {
    return NextResponse.json(await quotaStateOf(userId));
  } catch (err) {
    console.error("[admin/agent-quota] read failed:", (err as Error).message);
    return NextResponse.json({ error: "Query failed" }, { status: 500 });
  }
}

/** POST { userId } — one more reset: the quota starts again from now. */
export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin.ok) return admin.response;

  let body: { userId?: unknown };
  try {
    const parsed: unknown = await request.json();
    // Non-object body (null, string…): refused here rather than crashing further down.
    if (!parsed || typeof parsed !== "object") throw new Error("not an object");
    body = parsed as { userId?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const userId = typeof body.userId === "string" ? body.userId : "";
  if (!UUID_RE.test(userId)) {
    return NextResponse.json({ error: "Invalid userId" }, { status: 400 });
  }

  const service = getServiceClient();
  const resetAt = new Date().toISOString();
  // INSERT, then upsert: each action gets its own row. The old
  // `onConflict: user_id` overwrote the previous one — that's exactly what
  // prevented several from being asked.
  const { error } = await service.from("agent_quota_resets").insert({
    user_id: userId,
    reset_at: resetAt,
    reset_by: admin.userId,
    updated_at: resetAt,
  });
  if (error) {
    console.error("[admin/agent-quota] reset failed:", error.message);
    return NextResponse.json({ error: "Reset failed" }, { status: 500 });
  }

  try {
    return NextResponse.json(await quotaStateOf(userId));
  } catch (err) {
    console.error("[admin/agent-quota] read after reset failed:", (err as Error).message);
    return NextResponse.json({ error: "Query failed" }, { status: 500 });
  }
}

/** DELETE ?id= — removes A reset; the previous one takes control. */
export async function DELETE(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin.ok) return admin.response;

  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const service = getServiceClient();
  // `select` on return: this is the only way to know WHICH account it was from
  // gesture, so which state to recalculate.
  const { data, error } = await service
    .from("agent_quota_resets")
    .delete()
    .eq("id", id)
    .select("user_id")
    .maybeSingle();
  if (error) {
    console.error("[admin/agent-quota] undo reset failed:", error.message);
    return NextResponse.json({ error: "Undo failed" }, { status: 500 });
  }
  const userId = (data as { user_id?: string } | null)?.user_id;
  if (!userId) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    return NextResponse.json(await quotaStateOf(userId));
  } catch (err) {
    console.error("[admin/agent-quota] read after undo failed:", (err as Error).message);
    return NextResponse.json({ error: "Query failed" }, { status: 500 });
  }
}
