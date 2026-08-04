import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { checkSessionRateLimit } from "@/lib/server/session-rate-limit";

/**
 * Les brouillons de création de projet (table `project_drafts`, RLS
 * self-manage → client cookie, aucun accès service requis).
 *
 * Cette route est un ENTREPÔT, pas un modèle : `data` est l'état du formulaire
 * du wizard, qui bouge à chaque étape qu'on lui ajoute, et c'est le client qui
 * sait le relire (lib/project-draft.ts le fait défensivement). On ne valide donc
 * ici que ce dont la base a besoin — un id, un nom, une étape courte, un objet —
 * plus un plafond de taille, l'icône y voyageant en data URL.
 */

const MAX_NAME_LENGTH = 200;
const MAX_STEP_LENGTH = 40;
/** Le brouillon complet, sérialisé. Une icône compressée pèse quelques dizaines
 *  de Ko : ce plafond laisse la place, sans laisser passer un presse-papier. */
const MAX_DATA_BYTES = 512 * 1024;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const SELECT = "id, name, step, data, updated_at";

/** GET /api/project-drafts — mes brouillons, du plus récent au plus ancien. */
export async function GET(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const t = await getTranslations("ApiErrors");

  const { data, error } = await auth.supabase
    .from("project_drafts")
    .select(SELECT)
    .order("updated_at", { ascending: false });

  if (error) {
    console.error("[api/project-drafts] list failed:", error.message);
    return NextResponse.json({ error: t("databaseError") }, { status: 500 });
  }
  return NextResponse.json(data);
}

/**
 * PUT /api/project-drafts — pose ou remplace UN brouillon.
 *
 * Un upsert par id, et non un POST puis des PATCH : l'id est celui du futur
 * projet, tiré par le wizard à son ouverture, et le client ne sait pas — n'a pas
 * à savoir — si ce brouillon-là a déjà été écrit une fois.
 */
export async function PUT(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const rl = checkSessionRateLimit(auth.user.id, "project-draft");
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests", retry_after: rl.retryAfter },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
    );
  }
  const t = await getTranslations("ApiErrors");

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: t("invalidJson") }, { status: 400 });
  }
  const input = (body ?? {}) as Record<string, unknown>;

  const id = typeof input.id === "string" && UUID_RE.test(input.id) ? input.id : null;
  const name =
    typeof input.name === "string"
      ? input.name.trim().slice(0, MAX_NAME_LENGTH)
      : "";
  const step =
    typeof input.step === "string" ? input.step.slice(0, MAX_STEP_LENGTH) : "";
  const data =
    input.data && typeof input.data === "object" && !Array.isArray(input.data)
      ? (input.data as Record<string, unknown>)
      : {};

  if (!id) {
    return NextResponse.json({ error: t("invalidJson") }, { status: 400 });
  }
  // Un brouillon sans nom n'a rien à montrer dans la barre latérale : le wizard
  // n'en enregistre pas, et la route ne l'accepte pas non plus.
  if (!name) {
    return NextResponse.json({ error: t("nameRequired") }, { status: 400 });
  }
  if (!step) {
    return NextResponse.json({ error: t("invalidJson") }, { status: 400 });
  }
  if (JSON.stringify(data).length > MAX_DATA_BYTES) {
    return NextResponse.json({ error: t("draftTooLarge") }, { status: 413 });
  }

  // `user_id` explicite : la policy d'insertion l'exige (with check), et c'est
  // aussi ce qui empêche d'écraser le brouillon d'un autre — la policy d'update
  // ne verrait sinon aucune ligne à modifier, et l'upsert en créerait une.
  const { data: row, error } = await auth.supabase
    .from("project_drafts")
    .upsert(
      { id, user_id: auth.user.id, name, step, data },
      { onConflict: "id" }
    )
    .select(SELECT)
    .single();

  if (error) {
    console.error("[api/project-drafts] upsert failed:", error.message);
    return NextResponse.json({ error: t("databaseError") }, { status: 500 });
  }
  return NextResponse.json(row);
}
