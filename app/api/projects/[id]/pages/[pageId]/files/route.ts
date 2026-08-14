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
 * POST /api/projects/[id]/pages/[pageId]/files — déposer un fichier dans une page
 * (MIN-280). `multipart/form-data`, champ `file`.
 *
 * L'envoi passe par le SERVEUR, là où celui d'une ressource de ticket va
 * directement du navigateur au bucket. Ce n'est pas une incohérence, c'est la
 * différence de durée de vie entre les deux : une ressource abandonnée dans un
 * composeur laisse un orphelin toléré, tandis qu'un fichier de page est rattaché
 * à un DOCUMENT, relu chaque nuit par le balayage des orphelins — et un balayage
 * ne peut rien contre un objet dont aucune ligne ne dit à quelle page il
 * appartenait. Ici, l'objet et sa ligne naissent dans le même appel ou pas du
 * tout (lib/server/page-files.ts).
 *
 * L'accès est celui de la page : membre du projet, et la page doit y vivre. Une
 * page à la corbeille refuse — on n'écrit pas dans un document supprimé.
 */
export async function POST(request: NextRequest, { params }: RouteContext) {
  const { id: projectId, pageId } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const t = await getTranslations("ApiErrors");

  if (!(await getProjectAccess(auth.user.id, projectId))) {
    return NextResponse.json({ error: t("projectNotFound") }, { status: 404 });
  }

  // Dix mégaoctets par appel, ramenés EN MÉMOIRE le temps de la requête : sans
  // débit borné, une boucle suffit à remplir la fonction et le bucket (MIN-348).
  // La garde est posée avant de lire le corps multipart, sinon elle arrive après
  // la dépense qu'elle devait éviter.
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
  // La taille est revérifiée ICI et pas seulement chez le client : le client
  // rend le service d'un message immédiat, le serveur rend la garantie.
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
      // L'adresse que le bloc rangera dans le document. Elle est rendue par le
      // SERVEUR plutôt que refabriquée par le client : le jour où la forme de
      // l'URL bouge, elle bouge à un seul endroit.
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
