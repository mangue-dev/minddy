/**
 * "Copy for agent" — what ⌘L and the menu entry ⋯ of a page
 * drop to the clipboard.
 *
 * A page does NOT have a human identifier. A ticket is given to an agent en
 * calling it “MIN-42”; a page, for the MCP, only exists in two
 * UUIDs (see `PAGE_ID`, lib/server/mcp/page-tools.ts) — which no one reads nor
 * retypes. This is the whole reason for this gesture: pasting your URL is not enough,
 * since nothing tells the agent which tool opens it.
 *
 * Hence the two halves of the copied text, and not just one:
 *
 * - the URL, because a link must remain a link — the one who pastes it into a
 * conversation, a commit or a message to a colleague wants to be able to
 * click on it;
 * - the MCP COORDINATES, because an agent does not guess that a path
 * `/projects/<uuid>/pages/<uuid>` is read with `minddy_get_page`. The two
 * ids are rewritten in plaintext rather than left to extract from the URL: a
 * tool argument is not made by splitting a string.
 *
 * And, in the middle, the INSTRUCTION — optional, on the pattern of the prompt
 * custom ticket prompt (`buildIssueCustomPrompt`, lib/issue-prompt.ts):
 * "turns this page into tickets", "read the Security section again". Without
 * it, the text does not ask for anything and only designates the page; it is
 * the agent who will be told what to do with it, in the conversation. With it, the gesture
 * is complete - and this is often the case, since we rarely give a page
 * for the pleasure of giving it.
 *
 * It is repeated VERBATIM, in the language where it was written: it is THE
 * request. The rest is ALWAYS in English, like the ticket prompts: the
 * title of the page leaves as is, but what surrounds it is addressed to a model,
 * not to the user, whatever the language of the interface.
 *
 * The writing tools are NAMED. They are in the agent's list, but
 * this list sometimes loads on demand: quoting them costs a sentence and
 * avoids an "I can only read" round trip.
 */

/** In the absence of a title, the page remains nameable — and in English, like the rest. */
const UNTITLED = "Untitled";

export interface PageAgentPromptInput {
  /** Origin of the app (`window.location.origin`): the URL must return THERE from where
 it was copied — the production domain, but also the development workstation or the desktop app. */
  origin: string;
  projectId: string;
  pageId: string;
  title: string;
  /** What the user wants to see makes this page. Empty = we don't ask
 anything, we only designate the page. */
  instructions?: string;
}

/** The in-app URL of a page, such as its sidebar and breadcrumbs. */
export function pageHref(
  origin: string,
  projectId: string,
  pageId: string
): string {
  return `${origin.replace(/\/+$/, "")}/projects/${projectId}/pages/${pageId}`;
}

export function buildPageAgentPrompt({
  origin,
  projectId,
  pageId,
  title,
  instructions,
}: PageAgentPromptInput): string {
  const name = title.trim() || UNTITLED;
  const asked = instructions?.trim();

  // The body of the page is never inlined: it can be dozens of
  // thousands of tokens, and the agent has the tool to read it — it’s even the only one
  // means that it reads UPDATED rather than in the state it was in when copied.
  const tools = `Read it with the minddy MCP tool \`minddy_get_page\` (project_id "${projectId}", page_id "${pageId}"). Write back with \`minddy_update_page\`, \`minddy_append_to_page\` or \`minddy_edit_page_text\`, and comment with \`minddy_add_page_comment\`.`;

  const head = `minddy page "${name}" — ${pageHref(origin, projectId, pageId)}`;

  if (!asked) return `${head}\n\n${tools}`;

  // “these instructions are the request itself”: the same precaution as on
  // a ticket. Without it, a model takes the instruction for precision and
  // set to do “everything that can be done on a page” on top.
  return `${head}

Here is what I want you to do with this page — these instructions are the request itself, so follow them rather than inventing a broader task:

${asked}

${tools}`;
}
