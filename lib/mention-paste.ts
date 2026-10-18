// A paste that carries typed mentions (MIN-734), split into text and
// mentions so a composer can rebuild its pills with their ids.

import { mentionLinks, mentionMarkdown, parseMentionHref, type MentionLink } from "@/lib/mention-link";

/**
 * A paste split into text and typed mentions (MIN-734): `mention:` anchors of
 * the copied HTML, or `[@Label](mention:type/id)` links of the plain text.
 */
export function pastedMentionPieces(html: string, text: string): Array<string | MentionLink> {
  if (html && html.includes("mention:")) {
    const doc = new DOMParser().parseFromString(html, "text/html");
    if (doc.querySelector('a[href^="mention:"]')) {
      const pieces: Array<string | MentionLink> = [];
      const walk = (node: Node) => {
        if (node.nodeType === Node.TEXT_NODE) {
          pieces.push(node.textContent ?? "");
          return;
        }
        if (!(node instanceof HTMLElement)) return;
        const target = node.tagName === "A" ? parseMentionHref(node.getAttribute("href")) : null;
        if (target) {
          pieces.push({ ...target, label: (node.textContent ?? "").replace(/^@/, "") });
          return;
        }
        const block = /^(P|DIV|LI|H[1-6]|BLOCKQUOTE|PRE)$/.test(node.tagName);
        if (block && pieces.length > 0) pieces.push("\n");
        if (node.tagName === "BR") pieces.push("\n");
        for (const child of node.childNodes) walk(child);
      };
      for (const child of doc.body.childNodes) walk(child);
      return pieces;
    }
  }
  const links = mentionLinks(text);
  if (links.length === 0) return [text];
  const pieces: Array<string | MentionLink> = [];
  let rest = text;
  for (const link of links) {
    const written = mentionMarkdown(link.type, link.id, link.label);
    const at = rest.indexOf(written);
    if (at < 0) continue;
    pieces.push(rest.slice(0, at), link);
    rest = rest.slice(at + written.length);
  }
  pieces.push(rest);
  return pieces;
}
