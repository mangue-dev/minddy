/**
 * Numo's SCOPE: what project he is working on, or `null` in global mode.
 *
 * It is she who decides everything that matters for a round — the toolset, the
 * system prompt, the project where a ticket created without being named lands. Hence
 * the question, which seems trivial but is not: **who chooses it?**
 *
 * Before MIN-353, the URL. A living conversation was thrown away as soon as the
 * route changed projects (`reset()`, then restoring the conversation to the new scope). Writing to Numo from a project then clicking on the home page
 * was enough to make the thread disappear from the screen — intact in base, but no longer
 * anywhere on the screen.
 *
 * Since then, **it's the conversation**: it carries its scope (its `project_id`,
 * frozen at its creation) and keeps it until the end. Navigating only moves the
 * PAGE CONTEXT which accompanies the next message — “this ticket”, the open __
 * tab —, which is precisely what we want to see move.
 *
 * Only two cases give back the hand outside:
 *
 * - **No live conversation.** The route decides, as before: a first
 * message written from a project opens a conversation of this project, and
 * "new conversation" starts from the page where we are.
 * - **An opening which IMPOSES a scope** (`open({ projectId })`) and which
 * contradicts the living conversation. It’s the “Ask Numo” of a painting,
 * of a view, of a return: an explicit gesture, on a specific thing, here. It
 * opens a new thread in the correct scope rather than continuing the old one with
 * a context that does not belong to it. Navigation imposes nothing.
 *
 * And never during a turn: `busy` freezes the range while Numo responds,
 * otherwise the current response would land in a conversation that we have just started
 * replace.
 */

export interface AssistantScopeInput {
  /** The living conversation, or `null` if the panel starts from a blank screen. */
  conversationId: string | null;
  /** The `project_id` of this conversation (`null` = global conversation). */
  conversationProjectId: string | null;
  /** The project of the current route (`null` outside a project). */
  routeProjectId: string | null;
  /**
 * Scope imposed when opening the panel: `undefined` = follow the road,
 * `null` = explicit global mode, `string` = this project.
 */
  overrideProjectId?: string | null;
  /** Numo performs a trick: nothing moves until he gives up his hand. */
  busy?: boolean;
}

export interface AssistantScopeResolution {
  /** The effective reach — that of the next message. */
  scopeProjectId: string | null;
  /**
 * Should lively conversation give way to a new thread? True
 * only on an opening that imposes an incompatible range.
 *
 * Remains true DURING the turn, while `scopeProjectId` has not yet moved:
 * this is what allows the caller to wait for the sending that accompanies
 * opening it instead of sending it to the next conversation (the server
 * would refuse it — a message whose scope contradicts the conversation is a 404).
 */
  startsNewConversation: boolean;
}

export function resolveAssistantScope({
  conversationId,
  conversationProjectId,
  routeProjectId,
  overrideProjectId,
  busy = false,
}: AssistantScopeInput): AssistantScopeResolution {
  const requested =
    overrideProjectId !== undefined ? overrideProjectId : routeProjectId;

  if (!conversationId) {
    return { scopeProjectId: requested, startsNewConversation: false };
  }

  const hijacked =
    overrideProjectId !== undefined &&
    overrideProjectId !== conversationProjectId;

  if (!hijacked) {
    return {
      scopeProjectId: conversationProjectId,
      startsNewConversation: false,
    };
  }

  return {
    // The seesaw waits for the end of the turn: the range remains that of the
    // conversation that responds, otherwise its response would land next to it.
    scopeProjectId: busy ? conversationProjectId : overrideProjectId,
    startsNewConversation: true,
  };
}
