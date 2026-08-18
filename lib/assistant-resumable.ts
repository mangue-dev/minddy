/**
 * “Is there a Numo thread to KEEP UP?” »
 *
 * Only one surface asks the question: the reception. Its composer already does the
 * work of the FAB — start talking to Numo —, and the FAB placed on top of
 * offered nothing more than what the page shows in large size in the middle of
 * the screen. There is therefore only one use: RETURN to a conversation which
 * exists. Without conversation, it is not displayed.
 *
 * Three things can say that there is one, and they do not happen at the same
 * moment:
 *
 * - the LIVE conversation in the provider (`conversationId`), and before even
 * that it carries an id, the messages already on the screen and the current round — a
 * sending from the home opens a thread well before the server has named it;
 * - the POINTER reread when loading the page (`probedConversationId`), which is
 * the only source for a thread from yesterday: the resumption of the panel, it is
 * only played when it is first opened, and on the reception it did not take place;
 * - nothing, and then the FAB is erased.
 *
 * The pointer is only valid UNTIL the panel has not resumed the main
 * (`restored`). Afterwards, it is obsolete by construction: "new
 * conversation" deletes the live thread AND the pointer at the base, but not the
 * reading that we made when loading — relying on it longer
 * would let the FAB promise a thread that the user has just closed.
 */

export interface ResumableConversationInput {
  /** The live conversation of the provider, `null` if the screen is empty. */
  conversationId: string | null;
  /** Messages already on screen (a send precedes the server id). */
  messageCount: number;
  /** Numo produces a round — client flow or server-side generation. */
  busy: boolean;
  /**
 * The open conversation pointer, reread once by the surface that
 * is requesting. `null` = none, or not yet read: if in doubt, do not display
 * rather than turning on the FAB to turn it off a second later.
 */
  probedConversationId: string | null;
  /** The panel has already resumed (or dismissed) the open conversation. */
  restored: boolean;
}

export function hasResumableConversation({
  conversationId,
  messageCount,
  busy,
  probedConversationId,
  restored,
}: ResumableConversationInput): boolean {
  if (conversationId !== null || messageCount > 0 || busy) return true;
  return !restored && probedConversationId !== null;
}
