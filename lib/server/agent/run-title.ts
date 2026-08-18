/**
 * What we give to the titrator (`generateShortTitle`) to name a conversation
 * of the agent — and nothing else: the function is pure, it assembles a text.
 *
 * Two pieces, in this order: the TICKET (what we are talking about) then the CONIGNE
 * (what we asked for). A conversation anchored to a ticket needs both —
 * the instruction alone is often an anaphora ("implement this", "look at the
 * middleware") which names nothing, and the title of the ticket alone does not say what we
 * asked when spoken to three times in a row. The titrator decides between the
 * two; here we just ask them side by side.
 *
 * A conversation WITHOUT a ticket (notebook, MIN-84) only has its note, and that is already
 * the mission: it passes as is.
 *
 * `null` = nothing to summarize (neither ticket nor deposit) → the caller skips the call to the
 * model rather than sending it an empty string.
 */
export function agentRunTitleSource({
  issueTitle,
  prompt,
}: {
  issueTitle?: string | null;
  prompt?: string | null;
}): string | null {
  const parts = [issueTitle?.trim(), prompt?.trim()].filter(
    (p): p is string => !!p,
  );
  return parts.length > 0 ? parts.join("\n\n") : null;
}
