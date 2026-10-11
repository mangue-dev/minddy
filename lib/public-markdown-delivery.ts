import { routeByPath, localeForPublicPath, type PublicRoute } from "@/lib/public-routes";
import type { Locale } from "@/i18n/config";

/** Stable text URL for a public site page, including the root landing page. */
export function publicMarkdownPath(pathname: string): string {
  return pathname === "/" ? "/index.md" : `${pathname}.md`;
}

/** Resolve only registered site pages; never reinterpret private or token URLs. */
export function resolvePublicMarkdownDelivery(pathname: string): {
  route: PublicRoute; locale: Locale; pathname: string;
} | null {
  if (!pathname.endsWith(".md")) return null;
  const htmlPath = pathname === "/index.md" || pathname === "/.md" ? "/" : pathname.slice(0, -3);
  const route = routeByPath(htmlPath);
  const locale = localeForPublicPath(htmlPath);
  return route && locale && route.key !== "documentation" ? { route, locale, pathname: htmlPath } : null;
}
