import { normalizePageUrl } from "@/lib/page-content-schema";

/**
 * THE EXHAUST projection markdown (MIN-350).
 *
 * Two blocks write something other than ordinary markdown, and both used to do
 * so without escaping:
 *
 * - the leaflet projects HTML (`<summary>…</summary>`), because markdown
 * does not have collapsible and that `<details>` is the only one that GitHub, Notion and
 * Obsidian renders all three (see blocks/details.ts). A summary which
 * contains `<b>` or `</summary>` therefore came out IN the tag, where it is no longer
 *   plain text;
 * - the file block and the image block interpolate their `src` into the destination
 * of a link (`[nom](src)`). A parenthesis closes the link one syllable too
 * early, and the rest of the address falls into text.
 *
 * Neither was an XSS in minddy — the projection is read by Numo,
 * by search and by exports, never rendered in HTML by the application.
 * But an exported markdown is made to be rendered ELSEWHERE, and a round trip
 * who does not return the text given to him is a round trip which loses
 * content, which lib/pages-markdown.ts specifically promises not to do.
 */

/**
 * The text as it can live IN an HTML tag.
 *
 * Symmetrical when reading without anything more: the reading path is
 * markdown-it → HTML → `parseHTML`, and the parser decodes the entities. `&amp;`
 * therefore returns `&`, and `&lt;b&gt;` returns `<b>`, in text.
 */
export function escapeHtmlText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Same, plus the quote: an attribute value is delimited by it. */
export function escapeHtmlAttribute(value: string): string {
  return escapeHtmlText(value).replace(/"/g, "&quot;");
}

/**
 * The address as it can appear in a Markdown link destination, or `null` when
 * no link should be written at all.
 *
 * `null` covers two cases: an empty address, and an address whose protocol is rejected
 * ({@link normalizePageUrl}). A `javascript:` placed in a body before this
 * guard — or entered through a path that bypassed it — must not reappear as a
 * clickable link in exported Markdown.
 *
 * Parentheses are escaped the same way prosemirror-markdown escapes them:
 * they close the destination. Whitespace has already been removed during
 * normalization — an address does not contain it.
 */
export function markdownLinkDestination(src: unknown): string | null {
  const url = normalizePageUrl(src);
  if (!url) return null;
  return url.replace(/[()]/g, "\\$&");
}
