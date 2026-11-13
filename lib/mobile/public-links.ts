/**
 * The public website, opened beside the app rather than in it (MIN-907).
 *
 * The mobile shell keeps every page of its server in its WebView. The public
 * site is one of them: the landing, pricing, the manual, the legal pages. In
 * the app they would read as a website inside the app, and the site's header
 * and footer lead to pricing, which the app must not show (nothing is sold in
 * the app, guideline 3.1.3). A tapped link to the public site opens in
 * Safari's sheet instead (`MinddyShell.openBrowser`), over the app.
 *
 * `lib/public-routes.ts` is the table of that site, with its localized URLs
 * and the manual's; this module only asks it.
 */
import { localeForPublicPath } from "@/lib/public-routes";
import { getMobileBridge } from "@/lib/mobile/bridge";

/** True for a page of the public site on `origin`, the app's own server. */
export function isPublicWebsiteUrl(url: URL, origin: string): boolean {
  if (url.origin !== origin) return false;
  if (url.protocol !== "https:" && url.protocol !== "http:") return false;
  const pathname = url.pathname.length > 1 ? url.pathname.replace(/\/+$/, "") : url.pathname;
  return localeForPublicPath(pathname) !== null;
}

/**
 * In the app, sends taps on links to the public site to Safari's sheet.
 * Returns what removes the listener; does nothing outside the app or in a
 * shell without `openBrowser`, where the link loads as before.
 */
export function openPublicLinksOutside(doc: Document): () => void {
  const shell = getMobileBridge()?.shell;
  if (!shell?.openBrowser) return () => {};
  const openBrowser = shell.openBrowser.bind(shell);
  const onClick = (event: MouseEvent) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const anchor = event.target instanceof Element ? event.target.closest("a[href]") : null;
    if (!(anchor instanceof HTMLAnchorElement) || anchor.hasAttribute("download")) return;
    let url: URL;
    try {
      url = new URL(anchor.href, doc.baseURI);
    } catch {
      return;
    }
    if (!isPublicWebsiteUrl(url, doc.defaultView?.location.origin ?? "")) return;
    event.preventDefault();
    void openBrowser({ url: url.href }).catch(() => {});
  };
  // Capture: Next's links route on the bubbling click.
  doc.addEventListener("click", onClick, true);
  return () => doc.removeEventListener("click", onClick, true);
}
