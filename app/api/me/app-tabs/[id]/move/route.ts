import { NextResponse, type NextRequest } from "next/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { appTabResultStatus, moveAppTab } from "@/lib/server/app-tabs";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const { id } = await context.params;
  const body = await request.json().catch(() => null);
  const result = await moveAppTab(auth.supabase, { id, revision: body?.revision, beforeId: body?.beforeId });
  return NextResponse.json(result, { status: appTabResultStatus(result) });
}
