import { NextResponse, type NextRequest } from "next/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { appTabResultStatus, mutateAppTab } from "@/lib/server/app-tabs";

type Context = { params: Promise<{ id: string }> };

async function mutate(request: NextRequest, context: Context, operation: "update" | "close") {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const { id } = await context.params;
  const body = await request.json().catch(() => null);
  const result = await mutateAppTab(auth.supabase, operation, { id, revision: body?.revision, patch: body?.patch });
  return NextResponse.json(result, { status: appTabResultStatus(result) });
}
export const PATCH = (request: NextRequest, context: Context) => mutate(request, context, "update");
export const DELETE = (request: NextRequest, context: Context) => mutate(request, context, "close");
