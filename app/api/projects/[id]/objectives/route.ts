import { loadProjectObjectives } from "@/lib/server/project-working-set-readers";
import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { createObjective } from "@/lib/server/objectives";

type RouteContext = { params: Promise<{ id: string }> };

/** GET /api/projects/[id]/objectives — the project's objectives. */
export async function GET(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const t = await getTranslations("ApiErrors");
  const result = await loadProjectObjectives(auth, id);
  if (!result.ok) return NextResponse.json({ error: t(result.errorKey) }, { status: result.status });
  return NextResponse.json(result.data);
}

/** POST /api/projects/[id]/objectives — create an objective (any member). */
export async function POST(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const t = await getTranslations("ApiErrors");

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: t("invalidJson") }, { status: 400 });
  }
  const result = await createObjective({
    projectId: id,
    actorId: auth.user.id,
    input: (body ?? {}) as Record<string, unknown>,
  });
  if (!result.ok) {
    const message = result.rawMessage ?? t(result.errorKey ?? "databaseError");
    return NextResponse.json({ error: message }, { status: result.status });
  }
  return NextResponse.json(result.objective, { status: 201 });
}
