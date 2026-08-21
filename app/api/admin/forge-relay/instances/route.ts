import { NextResponse, type NextRequest } from "next/server";

import { getAuthedUser } from "@/lib/server/api-auth";
import { isAdminUser } from "@/lib/server/admin";
import { isManagedForgeEnabled } from "@/lib/managed-services";
import { listRelayInstances, registerRelayInstance } from "@/lib/server/forge-relay/instances";

/**
 * Registration and listing of forge-relay instances (control plane, cloud
 * only). The operator submits the instance's Ed25519 PUBLIC key; the private
 * key never leaves the instance.
 */
export async function GET(request: NextRequest) {
  if (!isManagedForgeEnabled()) {
    return NextResponse.json({ error: "Managed forge relay is not configured" }, { status: 503 });
  }
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  if (!(await isAdminUser(auth.user))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return NextResponse.json({ instances: await listRelayInstances() });
}

export async function POST(request: NextRequest) {
  if (!isManagedForgeEnabled()) {
    return NextResponse.json({ error: "Managed forge relay is not configured" }, { status: 503 });
  }
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  if (!(await isAdminUser(auth.user))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as
    | { name?: unknown; publicKey?: unknown }
    | null;
  const result = await registerRelayInstance({
    name: typeof body?.name === "string" ? body.name : "",
    publicKey: typeof body?.publicKey === "string" ? body.publicKey : "",
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ instance: result.instance }, { status: 201 });
}
