import { NextResponse, type NextRequest } from "next/server";

import { authorizePrRequest, prAttachmentResponse } from "@/lib/server/agent/pr-actions";
import { checkSessionRateLimit } from "@/lib/server/session-rate-limit";

/**
 * POST /api/pull-requests/[prId]/attachments — héberge un fichier destiné à un
 * commentaire de PR et rend son URL publique (MIN-162).
 *
 * En multipart et non en JSON base64 : le fichier ne fait que traverser, et
 * l'encoder en texte lui coûterait un tiers de poids pour rien.
 *
 * L'upload passe par le serveur (et non en direct-to-storage comme les pièces
 * jointes de ticket) parce que la destination est un bucket PUBLIC : c'est la
 * vérification d'accès à la PR, ici, qui empêche d'en faire un hébergeur de
 * fichiers ouvert. Le détail est dans `prAttachmentResponse`.
 */

type RouteContext = { params: Promise<{ prId: string }> };

export const maxDuration = 60;

export async function POST(request: NextRequest, { params }: RouteContext) {
  const { prId } = await params;

  let file: File | null = null;
  try {
    const form = await request.formData();
    const entry = form.get("file");
    if (entry instanceof File) file = entry;
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }
  if (!file) return NextResponse.json({ error: "File required" }, { status: 400 });

  const auth = await authorizePrRequest(request, prId);
  if (!auth.ok) return auth.response;
  // Même garde que les pièces jointes de ticket : la destination est un bucket
  // PUBLIC de 20 Mo par fichier, et rien d'autre ne borne la boucle qui en
  // téléverse un millier.
  const rl = checkSessionRateLimit(auth.userId, "pr-attachment-create");
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests", retry_after: rl.retryAfter },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
    );
  }
  return prAttachmentResponse(auth.scope, file);
}
