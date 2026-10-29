import { NextResponse, type NextRequest } from "next/server";

import { getAuthedUser } from "@/lib/server/api-auth";
import { isAdminUser } from "@/lib/server/admin";
import { capabilities } from "@/lib/server/capabilities";
import { instanceOverridesStatus } from "@/lib/server/instance-variables";

/**
 * Operator diagnostics without secrets: classification, status, variable names
 * missing and what to do. The endpoint does not import or probe any SDKs.
 */
export async function GET(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  if (!(await isAdminUser(auth.user, auth.claims))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return NextResponse.json({
    capabilities: capabilities(),
    // Whether the Instance tab exists (MIN-847): never on Minddy Cloud.
    instanceOverrides: instanceOverridesStatus(),
  });
}
