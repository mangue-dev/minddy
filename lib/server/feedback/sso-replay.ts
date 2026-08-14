import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { afterOrNow } from "@/lib/server/after-safe";

/**
 * Consommation du jeton SSO d'un board (MIN-345).
 *
 * Le jeton voyage dans une URL, et une URL se recopie : `Referer`, historique,
 * journal de proxy, capture d'écran d'un ticket de support. Sans consommation,
 * la rejouer rouvrait une session de board sous l'identité de sa victime
 * pendant toute la fenêtre du jeton — dix minutes, mais dix minutes pendant
 * lesquelles n'importe qui la vole.
 *
 * L'insert EST le verrou : la clé primaire `(board_id, token_id)` fait le refus
 * du second passage, en une seule requête et sans course entre deux invocations
 * concurrentes. Un `select` puis un `insert` auraient laissé passer les deux.
 */
export async function consumeSsoToken(params: {
  boardId: string;
  tokenId: string;
  /** `exp` du jeton, en secondes — borne la rétention de la trace. */
  expiresAt: number;
}): Promise<boolean> {
  const service = getServiceClient();
  const { error } = await service.from("feedback_sso_replays").insert({
    board_id: params.boardId,
    token_id: params.tokenId,
    expires_at: new Date(params.expiresAt * 1000).toISOString(),
  });

  // 23505 = clé primaire déjà prise : ce jeton a déjà servi.
  if (error?.code === "23505") return false;
  if (error) {
    // Base injoignable : on refuse. Laisser passer ferait de la panne le moyen
    // de rejouer, et il n'y a pas de dégât à refuser une redirection SSO — le
    // visiteur retombe sur le board, où la vérification par email l'attend.
    console.error("[feedback-sso] replay guard failed:", error.message);
    return false;
  }

  purgeExpired();
  return true;
}

/**
 * Les traces dont le jeton est de toute façon périmé. Opportuniste et après la
 * réponse — mais par `afterOrNow`, jamais détachée : une promesse détachée meurt
 * au gel de l'invocation, et la table grossirait sans que rien ne le dise.
 */
function purgeExpired(): void {
  afterOrNow(async () => {
    const { error } = await getServiceClient()
      .from("feedback_sso_replays")
      .delete()
      .lt("expires_at", new Date().toISOString());
    if (error) console.error("[feedback-sso] replay purge failed:", error.message);
  });
}
