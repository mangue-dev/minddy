import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseFromRequest } from "@/lib/server/api-auth";
import { toNamed } from "@/lib/server/auth-users";
import { signFeedbackSsoJwt } from "@/lib/feedback/sso-jwt";

/**
 * GET /feedback — cible du bouton « Partager un retour » de la sidebar.
 *
 * Pré-identifie l'utilisateur connecté (JWT HS256 court signé avec
 * MINDDY_SSO_SECRET) puis 302 vers le board public de feedback minddy : il y
 * arrive déjà identifié, sans étape de vérification. Déconnecté — ou SSO non
 * configuré côté serveur — on redirige vers le board sans `sso` : la
 * participation demandera une vérification par email sur place.
 *
 * L'URL du board vit ici, côté serveur, jamais dans le bundle client. Le JWT ne
 * sert qu'à la redirection : `exp` = maintenant + 10 min (borné par le signeur).
 */

// Domaine personnalisé du board minddy (MIN-36, dogfooding). Le proxy réécrit
// `feedback.minddy.app/?sso=<jwt>` → `/f/<token>?sso=<jwt>` (query préservée) :
// le token est résolu côté serveur depuis le host, inutile de l'exposer ici.
const BOARD_URL = "https://feedback.minddy.app";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const secret = process.env.MINDDY_SSO_SECRET;

  const supabase = createSupabaseFromRequest(request);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Déconnecté (ou SSO non configuré) → board anonyme, vérification email sur place.
  if (!user || !secret) {
    return NextResponse.redirect(BOARD_URL, 302);
  }

  const named = toNamed(user);
  const jwt = signFeedbackSsoJwt(
    { sub: user.id, email: named.email, name: named.full_name },
    secret
  );
  return NextResponse.redirect(`${BOARD_URL}?sso=${encodeURIComponent(jwt)}`, 302);
}
