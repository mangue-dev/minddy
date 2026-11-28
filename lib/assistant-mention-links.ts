import { parseMentionHref, type MentionLink } from "@/lib/mention-link";

/**
 * Numo cites records with typed mentions (`[@Label](mention:type/id)`).
 * Streamdown's sanitizer drops an unknown URL scheme, so each mention travels
 * through it as an in-page address, and the link renderer turns that address
 * back into the pill an editor shows.
 *
 * The sanitizer also clobbers in-page addresses: `#mention:…` reaches the
 * renderer as `#user-content-mention:…`. Both spellings are read back, or the
 * mention would render as a plain link labeled "@".
 */
const PREFIX = "#mention:";
const CLOBBERED_PREFIX = "#user-content-mention:";

const MENTION_LINK =
  /(\[@(?:[^\]\\\n]|\\.){0,256}\])\(mention:([a-z_]{1,16}\/[A-Za-z0-9_.-]{1,64}(?:\?[A-Za-z0-9_.:=&-]{1,300})?)\)/g;

/** The Markdown Streamdown receives: each typed mention as an in-page link. */
export function toAssistantMentionLinks(content: string): string {
  return content.includes("](mention:") ? content.replace(MENTION_LINK, `$1(${PREFIX}$2)`) : content;
}

/** The mention an in-page link stands for, or null for any other link. */
export function assistantMentionTarget(href: unknown): Omit<MentionLink, "label"> | null {
  if (typeof href !== "string") return null;
  const rest = href.startsWith(CLOBBERED_PREFIX)
    ? href.slice(CLOBBERED_PREFIX.length)
    : href.startsWith(PREFIX) ? href.slice(PREFIX.length) : null;
  return rest === null ? null : parseMentionHref(`mention:${rest}`);
}
