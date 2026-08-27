import type { MetadataRoute } from "next";
import { PUBLIC_ROUTES, publicRouteVariants } from "@/lib/public-routes";
import { SITE_URL } from "@/lib/site";

/**
 * Sitemap for every explicit public locale URL (MIN-88). `/login` and
 * `/signup` are accessible without an account but have no independent public
 * content, so listing them would dilute the index without adding anything.
 *
 * Each entry carries its `alternates.languages`, which Next renders in
 * `<xhtml:link rel="alternate" hreflang="…">`. It is the obligatory counterpart of
 * `hreflang` of `<head>`: declared on one side only, Google signals a “return
 * missing” and ignores the group, leaving variants to compete on the same queries.
 *
 * The route table (and its hand-held `lastModified`) lives in
 * `lib/public-routes.ts`: proxy, metadata and links read it
 * Also. `priority` and `changeFrequency` stay because Bing is looking at them
 * a little more; Google has been ignoring them for a long time.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return PUBLIC_ROUTES.flatMap((route) => {
    const variants = publicRouteVariants(route);
    const languages = Object.fromEntries(
      variants.map(({ locale, path }) => [locale, `${SITE_URL}${path}`]),
    );
    languages["x-default"] = `${SITE_URL}${route.en}`;

    return variants.map(({ path }) => ({
      url: `${SITE_URL}${path}`,
      lastModified: route.lastModified,
      changeFrequency: "monthly" as const,
      priority: route.priority,
      alternates: { languages },
    }));
  });
}
