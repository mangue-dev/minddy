import legacyRoutes from "@/content/documentation/legacy-routes.json";
import { migratedDocumentationHref, resolveDocumentationPath, type DocumentationLegacyRoute } from "@/lib/documentation-core.mjs";

export const DOCUMENTATION_HELP_ORIGIN = "https://minddy.app";

/** Resolve public guide citations, including placeholder URLs in older replies. */
export function resolveDocumentationHelpLink(href: string, appUrl: string) {
  try {
    const target = new URL(href, appUrl);
    if (![new URL(appUrl).origin, DOCUMENTATION_HELP_ORIGIN, "https://minddy.example", "https://minddy.example.com"]
      .includes(target.origin) || target.username || target.password) return null;
    const route = resolveDocumentationPath(target.pathname);
    if (!route) return null;
    const legacy = route.id ? (legacyRoutes as Record<string, DocumentationLegacyRoute>)[route.id] : undefined;
    return {
      articleId: legacy?.article ?? route.id,
      href: route.id && legacy
        ? migratedDocumentationHref(route.id, route.locale, legacy, target.search, target.hash)
          ?? target.pathname + target.search + target.hash
        : target.pathname + target.search + target.hash,
    };
  } catch {
    return null;
  }
}
