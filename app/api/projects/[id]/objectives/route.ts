import { loadProjectObjectives } from "@/lib/server/project-working-set-readers";
import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { MAX_OBJECTIVE_DESCRIPTION_LENGTH, createObjective } from "@/lib/server/objectives";
import { takeRichDocumentInput } from "@/lib/server/rich-documents";
import { seedDescriptionDocument } from "@/lib/server/description-collaboration";

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
  // The editor sends its document (MIN-728): the description is derived from
  // it here, never taken from the client.
  const input = { ...((body ?? {}) as Record<string, unknown>) };
  const document = await takeRichDocumentInput(input, {
    document: "description_doc", markdown: "description",
    maxLength: MAX_OBJECTIVE_DESCRIPTION_LENGTH,
  });
  if (!document.ok) {
    return NextResponse.json({ error: t(document.errorKey) }, { status: 400 });
  }
  const result = await createObjective({
    projectId: id,
    actorId: auth.user.id,
    input,
  });
  if (!result.ok) {
    const message = result.rawMessage ?? t(result.errorKey ?? "databaseError");
    return NextResponse.json({ error: message }, { status: result.status });
  }
  await seedDescriptionDocument(
    { kind: "objective", id: result.objective.id as string, projectId: id },
    document.content,
    typeof input.description === "string" ? input.description : ""
  );
  return NextResponse.json(result.objective, { status: 201 });
}
