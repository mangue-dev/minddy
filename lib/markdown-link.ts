export const MARKDOWN_LINK_CLASS = "markdown-link";

/** The same-origin image endpoint used by every rendered Markdown link. */
export function markdownLinkIconUrl(href: string | undefined): string | null {
  if (!href) return null;
  try {
    const url = new URL(href);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    // Resolve only the site's root. Besides sharing one cached icon between all
    // of its links, this avoids requesting paths that may carry private tokens
    // or trigger application-specific GET behavior merely because text rendered.
    return `/api/markdown-link-icon?url=${encodeURIComponent(url.origin)}`;
  } catch {
    return null;
  }
}

/** CSS attributes shared by React renderers and TipTap's link mark. */
export function markdownLinkPresentation(href: string | undefined) {
  const iconUrl = markdownLinkIconUrl(href);
  return {
    class: MARKDOWN_LINK_CLASS,
    ...(iconUrl
      ? { style: `--markdown-link-icon: url(${JSON.stringify(iconUrl)})` }
      : {}),
  };
}
