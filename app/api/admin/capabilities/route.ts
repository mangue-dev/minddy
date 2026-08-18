import { NextResponse, type NextRequest } from "next/server";

import { getAuthedUser } from "@/lib/server/api-auth";
import { isAdminUser } from "@/lib/server/admin";
import { capabilities } from "@/lib/server/capabilities";

/**
 * Operator diagnostics without secrets: classification, status, variable names
 * missing and what to do. The endpoint does not import or probe any SDKs.
 */
export async function GET(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  if (!(await isAdminUser(auth.user))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return NextResponse.json({ capabilities: capabilities() });
}
