import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { afterOrNow } from "@/lib/server/after-safe";

/**
 * Consumption of a board's SSO token (MIN-345).
 *
 * The token travels in a URL, and a URL copies itself: `Referer`, history,
 * proxy log, screenshot of a support ticket. Without consumption,
 * replaying it reopened a board session under the identity of its victim
 * for the entire token window — ten minutes, but ten minutes during
 * which anyone steals it.
 *
 * The insert IS the lock: the primary key `(board_id, token_id)` refuses
 * the second pass, in a single request and without a race between two competing invocations
 *. A `select` then a `insert` would have let both pass.
 */
export async function consumeSsoToken(params: {
  boardId: string;
  tokenId: string;
  /** `exp` of the token, in seconds — limits the retention of the trace. */
  expiresAt: number;
}): Promise<boolean> {
  const service = getServiceClient();
  const { error } = await service.from("feedback_sso_replays").insert({
    board_id: params.boardId,
    token_id: params.tokenId,
    expires_at: new Date(params.expiresAt * 1000).toISOString(),
  });

  // 23505 = primary key already taken: this token has already been used.
  if (error?.code === "23505") return false;
  if (error) {
    // Base unreachable: we refuse. Letting it go would make the breakdown the means
    // to play again, and there is no harm in refusing an SSO redirection — the
    // visitor lands on the board, where the email verification awaits him.
    console.error("[feedback-sso] replay guard failed:", error.message);
    return false;
  }

  purgeExpired();
  return true;
}

/**
 * Traces whose token is expired anyway. Opportunistic and after the
 * response — but by `afterOrNow`, never detached: a detached promise dies
 * when the invocation freezes, and the table would grow without anything saying so.
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
