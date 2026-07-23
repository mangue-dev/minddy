import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

/**
 * robots.txt (MIN-73). Seul le site public est indexable : l'app derrière
 * l'authentification, l'API, les boards de feedback et les vues partagées (dont
 * l'URL EST le secret) restent hors index.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/api/",
        "/auth/",
        "/home",
        "/projects/",
        "/inbox",
        "/all",
        "/settings",
        "/billing",
        "/admin",
        "/agents",
        "/pull-requests",
        "/statistics",
        "/share/",
        "/f/",
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
