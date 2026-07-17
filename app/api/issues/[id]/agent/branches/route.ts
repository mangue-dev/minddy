import { NextResponse, type NextRequest } from "next/server";

import { getAuthedUser } from "@/lib/server/api-auth";
import { resolveRepoCloneTarget } from "@/lib/server/agent/repo-access";
import { forgeFor, isForgeApiError } from "@/lib/server/agent/forge";

/**
 * Branches du dépôt lié au projet de l'issue (picker de branche de base au
 * lancement d'un agent). Servi par l'API du provider via un token frais —
 * `defaultBranch` en tête, le reste dans l'ordre alphabétique.
 */

type RouteContext = { params: Promise<{ id: string }> };

export const maxDuration = 60;

export async function GET(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;

  // RLS : l'appelant doit pouvoir voir l'issue (et son projet avec elle).
  const { data: issue } = await auth.supabase
    .from("issues")
    .select("id, project_id")
    .eq("id", id)
    .maybeSingle();
  if (!issue) return NextResponse.json({ error: "Issue not found" }, { status: 404 });

  try {
    const target = await resolveRepoCloneTarget((issue as { project_id: string }).project_id);
    if (!target) {
      return NextResponse.json({ error: "noRepo", code: "noRepo" }, { status: 409 });
    }
    const names = await forgeFor(target.provider).listBranches({
      token: target.token,
      repoFullName: target.repoFullName,
    });
    // Défaut TOUJOURS en tête, même si le listing paginé l'a manqué (dépôt à
    // centaines de branches) : c'est l'option de repli du picker.
    const rest = names
      .filter((n) => n !== target.defaultBranch)
      .sort((a, b) => a.localeCompare(b));
    return NextResponse.json({
      branches: [target.defaultBranch, ...rest],
      defaultBranch: target.defaultBranch,
    });
  } catch (err) {
    const status = isForgeApiError(err) ? 502 : 500;
    return NextResponse.json({ error: (err as Error).message }, { status });
  }
}
