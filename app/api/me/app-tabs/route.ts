import { NextResponse, type NextRequest } from "next/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { appTabResultStatus, listAppTabs, mutateAppTab } from "@/lib/server/app-tabs";

export async function GET(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  try {
    return NextResponse.json(await listAppTabs(auth.supabase));
  } catch {
    return NextResponse.json({ code: "database" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ code: "invalid" }, { status: 400 });
  }
  const result = await mutateAppTab(auth.supabase, body.ensure === true ? "ensure" : "create", { id: body.id });
  return NextResponse.json(result, { status: appTabResultStatus(result) });
}
