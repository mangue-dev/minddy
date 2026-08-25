import { NextResponse, type NextRequest } from "next/server";
import { USER_AVATAR_BUCKET } from "@/lib/avatar-source";
import { getServiceClient } from "@/lib/supabase-service";

type RouteContext = { params: Promise<{ userId: string }> };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Redirects a stable, same-origin user avatar URL to its public storage object. */
export async function GET(request: NextRequest, { params }: RouteContext) {
  const { userId } = await params;
  if (!UUID_RE.test(userId)) {
    return NextResponse.json({ error: "Avatar not found" }, { status: 404 });
  }

  const service = getServiceClient();
  const { data } = await service
    .from("user_avatars")
    .select("image_path")
    .eq("user_id", userId)
    .maybeSingle();
  const imagePath = data?.image_path as string | null | undefined;
  if (imagePath !== `users/${userId}.webp`) {
    return NextResponse.json({ error: "Avatar not found" }, { status: 404 });
  }

  const { data: publicObject } = service.storage
    .from(USER_AVATAR_BUCKET)
    .getPublicUrl(imagePath);
  const target = new URL(publicObject.publicUrl);
  const version = request.nextUrl.searchParams.get("v");
  if (version) target.searchParams.set("v", version.slice(0, 80));

  const response = NextResponse.redirect(target, 302);
  response.headers.set("Cache-Control", "public, max-age=3600");
  return response;
}
