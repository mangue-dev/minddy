import { mentionLinks, mentionMarkdown, stripCutMention, type MentionLink } from "@/lib/mention-link";

/** Strip common Markdown syntax so a compact preview reads as plain text. */
export function plainMarkdown(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/[*_~>]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const TOKEN = "\u0000";

/**
 * A compact plain-text preview that keeps typed mentions apart (MIN-734): the
 * caller renders each with what the reader may see of its target, never its
 * stored label, which `plainMarkdown` would print as text.
 */
export function plainMarkdownParts(markdown: string): Array<string | MentionLink> {
  // A mention cut by the caller's slice keeps no label either.
  const md = stripCutMention(markdown);
  const links = mentionLinks(md);
  if (links.length === 0) return [plainMarkdown(md)];
  let protectedText = md;
  links.forEach((link, index) => {
    protectedText = protectedText.replace(mentionMarkdown(link.type, link.id, link.label), `${TOKEN}${index}${TOKEN}`);
  });
  const flat = plainMarkdown(protectedText);
  return flat.split(new RegExp(`${TOKEN}(\\d+)${TOKEN}`)).map((piece, index) =>
    index % 2 === 1 ? links[Number(piece)] : piece).filter((piece) => piece !== "");
}
