import { NextResponse, type NextRequest } from "next/server";
import type { User } from "@supabase/supabase-js";
import { createSupabaseFromRequest } from "@/lib/server/api-auth";
import { toNamed } from "@/lib/server/auth-users";
import { signFeedbackSsoJwt } from "@/lib/feedback/sso-jwt";
import { lookupCustomDomain } from "@/lib/custom-domain-lookup";
import { getAppEnv } from "@/lib/env";

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
 *
 * Latence (MIN-48) : on vise le minimum de sauts. On atterrit DIRECTEMENT sur la
 * route SSO (`/sso?jwt=`) — elle pose le cookie de session puis rebondit vers le
 * board — au lieu de passer par la page board avec `?sso=`, qui n'aurait fait
 * que rediriger vers `/sso` (un aller-retour serverless entier gaspillé).
 * L'entrée publique documentée `/f/<token>?sso=` (clients SSO externes) reste
 * gérée par la page ; ce raccourci ne concerne que notre bouton interne.
 */

// Domaine personnalisé du board minddy (MIN-36, dogfooding). Le proxy réécrit
// `feedback.minddy.app/sso?jwt=<jwt>` → `/f/<token>/sso?jwt=<jwt>` (`/sso` n'est
// pas un pass-prefix custom host, query préservée) : le token est résolu côté
// serveur depuis le host, inutile de l'exposer ici.
const BOARD_HOST = "feedback.minddy.app";

export const dynamic = "force-dynamic";

/**
 * Où mène ce bouton, selon l'environnement qui le sert.
 *
 * `feedback.minddy.app` pointe sur la PRODUCTION, et sur rien d'autre : un
 * domaine personnalisé est un enregistrement DNS, il ignore qu'il existe un
 * localhost et une préversion. Le lien était donc écrit en dur vers ce domaine,
 * et le board de minddy n'était visible qu'en prod — impossible d'ouvrir celui
 * qu'on est justement en train de modifier.
 *
 * Hors production, on sert donc le MÊME board depuis l'origine courante, par
 * son token — celui-là même que le proxy résout depuis le host, lu ici dans la
 * table des domaines plutôt que recopié dans une variable d'environnement de
 * plus. Le poste et les préversions parlent à la base de production : le token
 * est le bon partout.
 *
 * En production, rien ne change : le domaine du board fait foi, c'est son URL
 * canonique et celle que ses visiteurs connaissent.
 */
async function boardBaseUrl(request: NextRequest): Promise<string> {
  if (getAppEnv() === "production") return `https://${BOARD_HOST}`;
  const target = await lookupCustomDomain(BOARD_HOST);
  // Mapping absent (base injoignable, domaine détaché) : le domaine de prod
  // reste un lien qui marche, ce qu'un `/f/undefined` ne serait pas.
  if (target?.kind !== "feedback") return `https://${BOARD_HOST}`;
  return `${request.nextUrl.origin}/f/${target.token}`;
}

export async function GET(request: NextRequest) {
  const secret = process.env.MINDDY_SSO_SECRET;

  // getClaims() plutôt que getUser() : vérification LOCALE (aucun aller-retour
  // réseau vers GoTrue) dès que les clés JWT sont asymétriques (MIN-40), et
  // strict équivalent de getUser() tant qu'on est en HS256 — zéro régression.
  // La session est déjà validée par le middleware (route protégée) ; ici on ne
  // fait que forger un JWT SSO court, re-vérifié en aval sur le board.
  const supabase = createSupabaseFromRequest(request);
  const [{ data }, boardUrl] = await Promise.all([
    supabase.auth.getClaims(),
    boardBaseUrl(request),
  ]);
  const claims = data?.claims;

  // Déconnecté (ou SSO non configuré) → board anonyme, vérification email sur place.
  if (!claims?.sub || !secret) {
    return NextResponse.redirect(boardUrl, 302);
  }

  const named = toNamed({
    id: claims.sub,
    email: typeof claims.email === "string" ? claims.email : undefined,
    user_metadata: claims.user_metadata ?? {},
  } as unknown as User);
  const jwt = signFeedbackSsoJwt(
    { sub: claims.sub, email: named.email, name: named.full_name },
    secret
  );
  // Atterrissage direct sur la route SSO (pose le cookie), pas sur la page board.
  return NextResponse.redirect(`${boardUrl}/sso?jwt=${encodeURIComponent(jwt)}`, 302);
}
