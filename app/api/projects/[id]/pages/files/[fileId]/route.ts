import { NextResponse, type NextRequest } from "next/server";

import { getAuthedUser } from "@/lib/server/api-auth";
import { getProjectAccess } from "@/lib/server/project-access";
import { getServiceClient } from "@/lib/supabase-service";
import { signedAttachmentUrl } from "@/lib/server/attachments";
import { getPageFilePath } from "@/lib/server/page-files";

type RouteContext = { params: Promise<{ id: string; fileId: string }> };

/**
 * GET /api/projects/[id]/pages/files/[fileId] — la porte de lecture d'un fichier
 * de page (MIN-280). `?download=1` pour l'enregistrer plutôt que l'afficher.
 *
 * C'est CETTE URL qui est rangée dans le document, et c'est pour elle qu'elle
 * doit être stable et sans secret : elle survit des mois dans un corps, elle
 * traverse la projection markdown que lit Numo, et elle sert de `src` à une
 * balise `<img>`. Le fichier privé, lui, est servi par une redirection 302 vers
 * une URL signée de courte durée — exactement le montage de
 * `/api/attachments/file`, avec un identifiant à la place d'un chemin.
 *
 * L'accès se lit sur le PROJET de l'URL, et la ligne doit lui appartenir : sans
 * cette seconde condition, un identifiant de fichier valide ressortirait sous
 * n'importe quel projet dont on est membre.
 *
 * Une page à la corbeille garde ses fichiers lisibles — même parti pris que son
 * activité et ses rétroliens : la corbeille est réversible, et une image qui
 * cesserait de charger avant la purge ferait croire à une perte.
 */
export async function GET(request: NextRequest, { params }: RouteContext) {
  const { id: projectId, fileId } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;

  const notFound = NextResponse.json({ error: "Not found" }, { status: 404 });

  if (!(await getProjectAccess(auth.user.id, projectId))) return notFound;

  const service = getServiceClient();
  const file = await getPageFilePath(service, projectId, fileId);
  if (!file) return notFound;

  const download = request.nextUrl.searchParams.get("download") === "1";
  const url = await signedAttachmentUrl(service, file.storage_path, {
    download: download ? file.file_name : false,
    // Le type de la LIGNE fait foi ici : il a été déduit des octets à l'envoi
    // (lib/server/page-files.ts), l'envoi d'un fichier de page passant par le
    // serveur. Hors allowlist, la signature repartira en « pièce jointe »
    // (MIN-340) — un `.png` qui contient du HTML ne s'ouvre pas.
    mimeType: file.mime_type,
  });
  if (!url) return notFound;

  const response = NextResponse.redirect(url, 302);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
