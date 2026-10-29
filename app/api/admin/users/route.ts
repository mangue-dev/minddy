import { NextResponse, type NextRequest } from "next/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { isAdminUser } from "@/lib/server/admin";
import { fetchAdminAccount, fetchAdminUserDetails } from "@/lib/server/admin-users";

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
    const user = await fetchAdminUserDetails(userId);
    if (!user) {
      return NextResponse.json({ error: "Account not found" }, { status: 404, headers: PRIVATE_HEADERS });
    }
    return NextResponse.json({ user }, { headers: PRIVATE_HEADERS });
  } catch {
    // Failed reads must never fabricate a free plan or a zero balance.
    console.error("[admin/users] account details failed");
    return NextResponse.json({ error: "Query failed" }, { status: 500, headers: PRIVATE_HEADERS });
  }
}
