/**
 * What the page does with a path the mobile shell asks it to open (MIN-907):
 * a tapped notification or a universal link while the product is on screen.
 * The shell used to reload the WebView on it; the page opens it in place
 * instead.
 */
export type OpenPathAction =
  /** The inbox is a sheet over the current page: open it there. */
  | { kind: "inbox" }
  /** Any other page: a client navigation, without a reload. */
  | { kind: "navigate"; href: string };

export function resolveOpenPath(path: string): OpenPathAction | null {
  if (!path.startsWith("/") || path.startsWith("//")) return null;
  let url: URL;
  try {
    url = new URL(path, "https://app.invalid");
  } catch {
    return null;
  }
  if (url.origin !== "https://app.invalid") return null;
  // `/inbox` only redirects to `/home?inbox=1`, which opens the sheet.
  if (url.pathname.replace(/\/+$/, "") === "/inbox" || url.searchParams.get("inbox") === "1") {
    return { kind: "inbox" };
  }
  return { kind: "navigate", href: `${url.pathname}${url.search}${url.hash}` };
}
