// Recognizes a link to a page of the app (MIN-777), so a link written in a
// comment, a Numo answer or a document can open the page panel instead of
// navigating. Pure: shared by every link surface and tested without React.

export interface PageLinkTarget {
  projectId: string;
  pageId: string;
}

const PAGE_PATH = /^\/projects\/([^/?#]+)\/pages\/([^/?#]+)\/?$/;

/**
 * The page a link designates, or `null` when it is anything else.
 *
 * Only the bare page address qualifies: a block anchor (`#…`) or a query
 * (`?entry=…`, the database preview) asks for a precise view of the full
 * screen, which keeps navigating. An absolute URL counts only on `origin`,
 * the app's own origin; without one, only a relative path does.
 */
export function pageLinkTarget(
  href: string | null | undefined,
  origin?: string,
): PageLinkTarget | null {
  if (!href) return null;
  let path: string;
  try {
    const url = new URL(href, origin ?? "http://relative.invalid");
    const expected = origin ? new URL(origin).origin : "http://relative.invalid";
    if (url.origin !== expected) return null;
    if (url.search || url.hash) return null;
    path = url.pathname;
  } catch {
    return null;
  }
  const match = PAGE_PATH.exec(path);
  if (!match) return null;
  try {
    const projectId = decodeURIComponent(match[1]);
    const pageId = decodeURIComponent(match[2]);
    if (pageId === "trash") return null;
    return { projectId, pageId };
  } catch {
    return null;
  }
}
