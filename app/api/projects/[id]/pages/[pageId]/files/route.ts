import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";

import { getAuthedUser } from "@/lib/server/api-auth";
import { getProjectAccess } from "@/lib/server/project-access";
import { getServiceClient } from "@/lib/supabase-service";
import { MAX_PAGE_FILE_BYTES, pageFileUrl } from "@/lib/page-files";
import { createPageFile, PageFileError } from "@/lib/server/page-files";
import { rateLimitRefusal } from "@/lib/server/session-rate-limit";

type RouteContext = { params: Promise<{ id: string; pageId: string }> };

/**
 * POST /api/projects/[id]/pages/[pageId]/files — drop a file into a page
 * (MIN-280). `multipart/form-data`, champ `file`.
 *
 * The submission goes through the SERVER, where that of a ticket resource goes
 * directly from the browser to the bucket. This is not an inconsistency, it is the
 * difference in lifespan between the two: a resource abandoned in one
 * composer leaves a tolerated orphan, while a page file is attached
 * to a DOCUMENT, reread every night by the scanning of the orphans — and a scanning
 * can do nothing against an object for which no line says on which page it is
 * belonged. Here, the object and its line are born in the same call or not of the
 * everything (lib/server/page-files.ts).
 *
 * Access is that of the page: member of the project, and the page must live there. A
 * page to trash refuses — you do not write to a deleted document.
 */
export async function POST(request: NextRequest, { params }: RouteContext) {
  const { id: projectId, pageId } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const t = await getTranslations("ApiErrors");

  if (!(await getProjectAccess(auth.user.id, projectId))) {
    return NextResponse.json({ error: t("projectNotFound") }, { status: 404 });
  }

  // Ten megabytes per call, stored in MEMORY during the request: without
  // bounded flow, one loop is enough to complete the function and the bucket (MIN-348).
  // The guard is placed before reading the multipart body, otherwise it arrives after
  // the expense she had to avoid.
  const refused = rateLimitRefusal(auth.user.id, "page-file-upload", { limit: 20 });
  if (refused) return refused;

  const service = getServiceClient();
  const { data: page } = await service
    .from("pages")
    .select("id")
    .eq("id", pageId)
    .eq("project_id", projectId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!page) {
    return NextResponse.json({ error: t("pageNotFound") }, { status: 404 });
  }

  let file: File | null = null;
  try {
    const form = await request.formData();
    const candidate = form.get("file");
    if (candidate instanceof File) file = candidate;
  } catch {
    return NextResponse.json({ error: t("invalidRequest") }, { status: 400 });
  }
  if (!file) {
    return NextResponse.json({ error: t("invalidRequest") }, { status: 400 });
  }
  // The size is rechecked HERE and not only at the customer: the customer
  // renders the service of an immediate message, the server renders the guarantee.
  if (file.size > MAX_PAGE_FILE_BYTES) {
    return NextResponse.json({ error: t("pageFileTooLarge") }, { status: 413 });
  }
  if (file.size === 0) {
    return NextResponse.json({ error: t("pageFileEmpty") }, { status: 400 });
  }

  try {
    const row = await createPageFile(service, {
      projectId,
      pageId,
      createdBy: auth.user.id,
      fileName: file.name,
      mimeType: file.type,
      data: Buffer.from(await file.arrayBuffer()),
    });
    return NextResponse.json({
      id: row.id,
      // The address that the block will store in the document. It is rendered by the
      // SERVER rather than remanufactured by the client: the day when the form of
      // the URL moves, it moves in one place.
      src: pageFileUrl(projectId, row.id),
      file_name: row.file_name,
      mime_type: row.mime_type,
      size_bytes: row.size_bytes,
    });
  } catch (e) {
    if (e instanceof PageFileError) {
      const key =
        e.status === 413
          ? "pageFileTooLarge"
          : e.status === 400
            ? "pageFileEmpty"
            : e.status === 507
              ? "storageQuotaFull"
              : "databaseError";
      console.error("[api/pages/:id/files] upload failed:", e.message);
      return NextResponse.json({ error: t(key) }, { status: e.status });
    }
    console.error("[api/pages/:id/files] upload failed:", (e as Error).message);
    return NextResponse.json({ error: t("databaseError") }, { status: 500 });
  }
}
