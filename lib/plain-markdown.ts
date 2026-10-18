import { splitMentionLinks, stripCutMention, type MentionLink } from "@/lib/mention-link";

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
  const pieces = splitMentionLinks(stripCutMention(markdown));
  if (!pieces.some((piece) => typeof piece !== "string")) return [plainMarkdown(pieces.join(""))];
  // Mentions are held out by their position, whatever escapes their label
  // used, then the text around them is flattened as one.
  const links: MentionLink[] = [];
  const protectedText = pieces.map((piece) => {
    if (typeof piece === "string") return piece;
    links.push(piece);
    return `${TOKEN}${links.length - 1}${TOKEN}`;
  }).join("");
  return plainMarkdown(protectedText).split(new RegExp(`${TOKEN}(\\d+)${TOKEN}`)).map((piece, index) =>
    index % 2 === 1 ? links[Number(piece)] : piece).filter((piece) => piece !== "");
}
