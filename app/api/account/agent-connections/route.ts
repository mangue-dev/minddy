import { NextResponse, type NextRequest } from "next/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { withPrivateNoStore } from "@/lib/server/private-response";
import { nativeConnectionMetadata } from "@/lib/server/agent/native-prototype/connections";

export const runtime = "nodejs";
export const GET = withPrivateNoStore(async (request: NextRequest) => {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  try { return NextResponse.json(await nativeConnectionMetadata(auth.user.id)); }
  catch { return NextResponse.json({ errorCode: "test_failed" }, { status: 400 }); }
});
