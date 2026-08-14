import "server-only";

import type { NextRequest, NextResponse } from "next/server";
import { createSupabaseWithCookieSink, type CookieSink } from "@/lib/server/api-auth";

/**
 * Qui revient d'un callback de forge (MIN-324).
 *
 * Le `state` signé de [link-state.ts](./link-state.ts) dit **où l'on va** — quel
 * projet, quel retour. Il ne dit pas **qui revient**. La signature HMAC empêche
 * d'en FABRIQUER un ; elle n'empêche pas d'en RÉUTILISER un légitime, et c'est
 * toute la différence :
 *
 *  - `/api/git/github/setup` n'avait aucune session à confronter : un utilisateur
 *    ordinaire mintait son propre `state`, énumérait `installation_id` (petits
 *    entiers séquentiels) et se réattribuait les installations des autres ;
 *  - les deux callbacks OAuth enregistraient le jeton sous `state.userId` : un
 *    lien envoyé à une victime déposait le jeton de LA VICTIME dans le compte de
 *    l'attaquant.
 *
 * Seule la session dit qui revient. D'où ce module, partagé par les trois routes.
 *
 * ## Le piège des cookies (MIN-293)
 *
 * Ces callbacks sont des navigations de premier niveau venues de la forge, et le
 * matcher du proxy exclut `/api/` : le handler est donc le PREMIER à ouvrir les
 * cookies de session, avec un jeton d'accès qui peut être expiré. Le lire le
 * renouvelle, GoTrue fait tourner le jeton de rafraîchissement, et jeter le
 * couple neuf DÉCONNECTE l'utilisateur. D'où `createSupabaseWithCookieSink` — et
 * l'obligation de passer **chaque** sortie par `applyCookies`, y compris les
 * redirections d'erreur. Surtout pas `getAuthedUser` : il rend un 401 JSON (une
 * navigation attend une redirection) et lit avec un `setAll` vide.
 */
export interface ForgeCallbackSession {
  /** L'utilisateur connecté DANS CET ONGLET, ou null. */
  userId: string | null;
  applyCookies: CookieSink["applyCookies"];
}

export async function readForgeCallbackSession(
  request: NextRequest,
): Promise<ForgeCallbackSession> {
  const { supabase, applyCookies } = createSupabaseWithCookieSink(request);
  try {
    const { data } = await supabase.auth.getClaims();
    const sub = data?.claims?.sub;
    return { userId: typeof sub === "string" && sub ? sub : null, applyCookies };
  } catch {
    // Supabase injoignable : on ne sait pas qui revient, donc on n'écrit rien.
    // Fail closed — le pire ici serait d'accorder par défaut.
    return { userId: null, applyCookies };
  }
}

/**
 * Le `state` et la session désignent-ils la même personne ?
 *
 * Une absence de session n'autorise RIEN : deux `null` ne « correspondent » pas,
 * ils constatent seulement qu'on ignore qui revient.
 */
export function sessionMatchesState(
  sessionUserId: string | null | undefined,
  stateUserId: string | null | undefined,
): boolean {
  if (!sessionUserId || !stateUserId) return false;
  return sessionUserId === stateUserId;
}
