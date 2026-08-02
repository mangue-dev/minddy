import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { checkSessionRateLimit } from "@/lib/server/session-rate-limit";
import { getProjectAccess } from "@/lib/server/project-access";
import { hasUsageBudget } from "@/lib/server/usage";
import { sanitizeDigest, type CsvDigestMember } from "@/lib/import/digest";
import { loadImportContext } from "@/lib/server/import-context";
import { proposeImportMapping } from "@/lib/server/import-mapping-ai";
import type { ImportMember } from "@/lib/import/types";

type RouteContext = { params: Promise<{ id: string }> };

/** Les membres tels que le prompt les numérote — même ordre que `context.members`,
 *  parce que c'est ce rang que le modèle renvoie. */
const digestMembers = (members: ImportMember[]): CsvDigestMember[] =>
  members.map((m, i) => ({
    ref: i + 1,
    name: [m.name, m.email].filter(Boolean).join(" ") || `member ${i + 1}`,
  }));

// Un seul appel modèle, sur un résumé de quelques milliers de tokens.
export const maxDuration = 60;

/**
 * POST /api/projects/[id]/import/plan — propose une correspondance de colonnes
 * pour un CSV en cours de dépôt. Corps : `{ digest }`, le résumé du fichier
 * construit dans le navigateur (`lib/import/digest.ts`), jamais le fichier.
 *
 * Rend `{ mapping }`, une PROPOSITION que l'aperçu fusionne avec ce que la
 * détection par en-têtes avait déjà trouvé, affiche, et laisse corriger. Rien
 * n'est écrit ici : la route ne fait que lire un résumé et appeler un modèle.
 * `mapping: null` quand la passe n'est pas disponible (drapeau coupé, clé
 * absente, budget épuisé, appel raté) — l'import se fait alors comme avant.
 *
 * Réservée au owner, comme l'import lui-même : c'est lui qui paye l'appel.
 */
export async function POST(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  // Une dizaine de fichiers déposés par minute suffit largement, et le geste
  // n'est pas répétable : un fichier déposé = un appel.
  const rl = checkSessionRateLimit(auth.user.id, "project-import-plan", { limit: 10 });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests", retry_after: rl.retryAfter },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
    );
  }
  const t = await getTranslations("ApiErrors");

  const access = await getProjectAccess(auth.user.id, id);
  if (!access) {
    return NextResponse.json({ error: t("projectNotFound") }, { status: 404 });
  }
  if (!access.isOwner) {
    return NextResponse.json({ error: t("importOwnerOnly") }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: t("invalidJson") }, { status: 400 });
  }

  const digest = sanitizeDigest((body as { digest?: unknown } | null)?.digest);
  if (!digest) {
    return NextResponse.json({ error: t("importInvalidCsv") }, { status: 400 });
  }

  // Budget épuisé : pas d'erreur, pas de proposition. L'utilisateur garde son
  // import et son tableau de correspondance, il le remplit à la main.
  if (!(await hasUsageBudget(auth.user.id))) {
    return NextResponse.json({ mapping: null });
  }

  // Les membres et les catégories viennent du SERVEUR, jamais du digest : ce
  // sont eux qui referment la boucle — le modèle répond des rangs de membres,
  // et c'est cette liste-ci qui les retransforme en identifiants.
  const context = await loadImportContext(id, auth.user.id);

  const mapping = await proposeImportMapping({
    digest: { ...digest, members: digestMembers(context.members) },
    members: context.members,
    categories: context.categories,
    userId: auth.user.id,
    projectId: id,
  });

  return NextResponse.json({ mapping });
}
