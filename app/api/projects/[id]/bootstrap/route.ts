import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { createProjectBootstrapStream, parseProjectBootstrapReaders } from "@/lib/server/project-bootstrap";

type RouteContext = { params: Promise<{ id: string }> };

/** GET /api/projects/[id]/bootstrap?readers=objectives,members */
export async function GET(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  // Admission remains a live session/MFA check for every actual HTTP request.
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const t = await getTranslations("ApiErrors");
  const readerParameters = request.nextUrl.searchParams.getAll("readers");
  const readers = readerParameters.length === 1 ? parseProjectBootstrapReaders(readerParameters[0]) : null;
  if (!readers) return NextResponse.json({ error: t("missingParameter") }, { status: 400 });
  return new Response(createProjectBootstrapStream({
    auth, projectId: id, readers, signal: request.signal, translateError: (key) => t(key),
  }), {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
