/**
 * Pure builders for the public site's JSON-LD (schema.org).
 *
 * They take absolute URLs instead of reading the site origin, so a test can
 * check a graph without the server-only configuration.
 */

export interface BreadcrumbItem {
  /** Label of this level, as the page names it. */
  name: string;
  /** Absolute URL of this level. */
  url: string;
}

/**
 * The position of a page in the site, from the home page down to the page
 * itself. Google reads it to show a readable trail instead of the raw URL, and
 * needs at least two levels.
 */
export function breadcrumbList(pageUrl: string, trail: readonly BreadcrumbItem[]) {
  return {
    "@type": "BreadcrumbList",
    "@id": `${pageUrl}#breadcrumb`,
    itemListElement: trail.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

/**
 * Serializes a graph for a `<script type="application/ld+json">` element.
 * The strings come from the catalogs and the manual, but a `<` followed by
 * `/script>` would close the element: every `<` becomes its Unicode escape,
 * which `JSON.parse` reads back as the original character.
 */
export function serializeJsonLd(graph: readonly unknown[]): string {
  return JSON.stringify({
    "@context": "https://schema.org",
    "@graph": graph,
  }).replaceAll("<", "\\u003c");
}
