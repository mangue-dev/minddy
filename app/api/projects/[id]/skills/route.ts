import { NextResponse, type NextRequest } from "next/server";

import { getAuthedUser } from "@/lib/server/api-auth";
import {
  listProjectRepositorySkills,
  loadProjectRepositorySkills,
} from "@/lib/server/repository-skills";

type RouteContext = { params: Promise<{ id: string }> };

export const maxDuration = 60;

/** List skill metadata, or load one full skill when a validated path is requested. */
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
    const skillPath = request.nextUrl.searchParams.get("path");
    if (skillPath) {
      const loaded = await loadProjectRepositorySkills(id, [skillPath]);
      const skill = loaded?.[0] ?? null;
      return skill
        ? NextResponse.json({ skill })
        : NextResponse.json({ error: "Repository skill not found" }, { status: 404 });
    }
    return NextResponse.json({ skills: await listProjectRepositorySkills(id) });
  } catch (error) {
    console.error("[repository-skills] discovery failed:", (error as Error).message);
    return NextResponse.json(
      { error: "Repository skills could not be loaded" },
      { status: 502 },
    );
  }
}
