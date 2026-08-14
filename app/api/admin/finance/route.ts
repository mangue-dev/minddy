import { NextResponse, type NextRequest } from "next/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { isAdminUser } from "@/lib/server/admin";
import { getFinanceSummary } from "@/lib/server/finance";

/**
 * Lecture admin de la page Finances (MIN-92) — les coûts IA et les entrées
 * d'argent sur le même axe. Gate identique aux autres endpoints admin
 * (`/api/admin/ai-usage`) : JWT via getClaims + isAdminUser.
 *
 * GET /api/admin/finance
 *   ?days=<n>     fenêtre en jours (défaut 30, borné 1–365)
 *   ?refresh=1    contourne le cache serveur et retape Stripe
 *
 * Stripe est interrogé À CHAQUE chargement, derrière un cache de quelques
 * minutes : pas de table miroir, Stripe reste la seule source de vérité et il
 * n'y a rien à resynchroniser. Le bouton « Actualiser » de l'écran est ce qui
 * pose `refresh=1`.
 */

export async function GET(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  if (!(await isAdminUser(auth.user))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const daysRaw = Number(searchParams.get("days"));
  const days = Number.isFinite(daysRaw)
    ? Math.min(365, Math.max(1, Math.floor(daysRaw)))
    : 30;
  const refresh = searchParams.get("refresh") === "1";

  try {
    const summary = await getFinanceSummary({ days, refresh });
    return NextResponse.json(summary);
  } catch (err) {
    console.error("[admin/finance] failed:", (err as Error).message);
    return NextResponse.json({ error: "Query failed" }, { status: 500 });
  }
}
