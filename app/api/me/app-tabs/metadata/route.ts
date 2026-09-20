import { NextResponse, type NextRequest } from "next/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { parseAppTabMetadataLocations, readAppTabMetadata } from "@/lib/server/app-tab-metadata";

/** A bounded read body keeps document identifiers out of oversized query URLs. */
export async function POST(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const body = await request.json().catch(() => null);
  const hrefs = parseAppTabMetadataLocations(body?.hrefs);
  if (!hrefs) return NextResponse.json({ code: "invalid" }, { status: 400 });
  try {
    return NextResponse.json(await readAppTabMetadata(auth.supabase, hrefs));
  } catch {
    return NextResponse.json({ code: "database" }, { status: 500 });
  }
}
