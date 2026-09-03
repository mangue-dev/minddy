import { NextResponse, type NextRequest } from "next/server";

import { getAuthedUser } from "@/lib/server/api-auth";
import { listProjectRepositorySkills } from "@/lib/server/repository-skills";

type RouteContext = { params: Promise<{ id: string }> };

export const maxDuration = 60;

/** Metadata-only inventory of Agent Skills committed to the linked repository. */
export async function GET(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;

  // RLS is the authorization boundary. Token minting below uses the service
  // client, so an inaccessible project must be rejected before it reaches it.
  const { data: project } = await auth.supabase
    .from("projects")
    .select("id")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  try {
    return NextResponse.json({ skills: await listProjectRepositorySkills(id) });
  } catch (error) {
    console.error("[repository-skills] discovery failed:", (error as Error).message);
    return NextResponse.json(
      { error: "Repository skills could not be loaded" },
      { status: 502 },
    );
  }
}
