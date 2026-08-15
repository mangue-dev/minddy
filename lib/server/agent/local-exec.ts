import "server-only";

import {
  LOCAL_EXEC_MAX_TTL_SECONDS,
  resolveLocalExecSecret,
  signLocalExecToken,
} from "./local-exec-token";
import { bumpLocalExecGen } from "./runs";

/**
 * LE BAIL D'EXÉCUTION LOCALE (MIN-355) — l'émission du jeton, moitié base.
 *
 * Séparé de [local-exec-token.ts](local-exec-token.ts), qui reste PUR : la
 * cryptographie et le contrat de claims se testent sans base, et c'est ce qui
 * permet de les casser dans un test plutôt qu'en production. Ici, il n'y a qu'un
 * geste, et il en fait deux à la fois.
 *
 * ÉMETTRE, C'EST RÉVOQUER. On incrémente la génération AVANT de signer : à la
 * seconde où cette fonction rend, tout jeton émis auparavant pour ce run est
 * refusé par le plan de contrôle. Ce n'est pas un effet de bord, c'est la
 * fonctionnalité — un jeton auto-porteur ne se rappelle pas, et « une machine par
 * run » ne peut donc pas être une règle qu'on demande à quelqu'un de respecter.
 *
 * Corollaire à savoir avant de câbler le renouvellement (MIN-294) : deux machines
 * qui réclament le même run se chassent mutuellement, la dernière servie gagne. Un
 * conflit s'y voit donc tout de suite, au lieu de produire deux harness qui
 * écrivent le même checkpoint chacun de son côté.
 */

/** L'échec est DIT, jamais rendu en jeton vide : l'appelant doit pouvoir choisir
 *  entre « ce run n'est pas local » et « ce déploiement ne sait pas signer ». */
export type IssueLocalExecTokenResult =
  | { ok: true; token: string; gen: number; expiresInSeconds: number }
  | { ok: false; error: "not_configured" | "not_local" };

/**
 * Émet le jeton du prochain tour local d'un run — 15 minutes glissantes.
 *
 * L'appelant est l'APP, qui a la session de l'utilisateur : c'est la seule
 * autorité qui puisse dire qu'une machine a le droit de jouer ce run. Le harness,
 * lui, ne fait que porter ce qu'on lui donne, et redemande quand ça expire.
 */
export async function issueLocalExecToken(
  runId: string,
): Promise<IssueLocalExecTokenResult> {
  const secret = resolveLocalExecSecret();
  if (!secret) {
    // La même conduite que le locataire manquant sur le chemin cloud : un
    // déploiement qui ne sait pas signer ne délivre rien, et il le dit.
    console.error("[agent-local-exec] SUPABASE_SERVICE_ROLE_KEY manquante — aucun jeton local");
    return { ok: false, error: "not_configured" };
  }
  const gen = await bumpLocalExecGen(runId);
  if (gen === null) return { ok: false, error: "not_local" };
  return {
    ok: true,
    token: signLocalExecToken({ runId, gen }, secret),
    gen,
    expiresInSeconds: LOCAL_EXEC_MAX_TTL_SECONDS,
  };
}
