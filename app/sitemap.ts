import type { MetadataRoute } from "next";
import { PUBLIC_ROUTES, publicRouteVariants } from "@/lib/public-routes";
import { getChangelogIndex } from "@/lib/server/changelog";
import { SITE_URL } from "@/lib/site";
import { getPublishedDocumentation } from "@/lib/server/documentation";
import { documentationPath } from "@/lib/documentation-core.mjs";
import { locales } from "@/i18n/config";

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
export const revalidate = 60;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const latestRelease = (await getChangelogIndex())[0]?.publishedAt;
  const publicPages = PUBLIC_ROUTES.flatMap((route) => {
    const variants = publicRouteVariants(route);
    const languages = Object.fromEntries(
      variants.map(({ locale, path }) => [locale, `${SITE_URL}${path}`]),
    );
    languages["x-default"] = `${SITE_URL}${route.en}`;

    return variants.map(({ path }) => ({
      url: `${SITE_URL}${path}`,
      lastModified: route.key === "changelog" ? latestRelease ?? route.lastModified : route.lastModified,
      changeFrequency: "monthly" as const,
      priority: route.priority,
      alternates: { languages },
    }));
  });
  const articles = getPublishedDocumentation("en").flatMap(article => {
    const languages = Object.fromEntries(locales.map(locale => [locale, `${SITE_URL}${documentationPath(article.id, locale)}`]));
    languages["x-default"] = `${SITE_URL}${documentationPath(article.id, "en")}`;
    return locales.map(locale => ({ url: `${SITE_URL}${documentationPath(article.id, locale)}`,
      lastModified: getPublishedDocumentation(locale).find(item => item.id === article.id)!.updatedAt,
      changeFrequency: "monthly" as const, priority: 0.7, alternates: { languages } }));
  });
  return [...publicPages, ...articles];
}
