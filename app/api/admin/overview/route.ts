import { NextResponse, type NextRequest } from "next/server";

import { getAuthedUser } from "@/lib/server/api-auth";
import { isAdminUser } from "@/lib/server/admin";
import { countAdminAccounts } from "@/lib/server/admin-users";
import type { AdminAccountsOverview } from "@/lib/types";

/**
 * The Accounts tab's figure (MIN-829): how many accounts the instance has.
 * Nothing per account leaves this route.
 */
export async function GET(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  if (!(await isAdminUser(auth.user, auth.claims))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const overview: AdminAccountsOverview = { totalAccounts: await countAdminAccounts() };
    return NextResponse.json(overview, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("[admin/overview] query failed:", (error as Error).message);
    return NextResponse.json({ error: "Query failed" }, { status: 500 });
  }
}
