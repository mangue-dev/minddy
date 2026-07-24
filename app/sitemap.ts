import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

/**
 * Sitemap (MIN-73) : les six pages publiques, et rien d'autre. `/login` et
 * `/signup` sont accessibles sans compte mais n'ont pas de contenu propre —
 * les lister diluerait l'index sans rien apporter.
 *
 * `lastModified` est le seul des trois champs que Google lit vraiment
 * (`priority` et `changeFrequency` sont ignorés depuis longtemps, Bing les
 * regarde encore un peu) : c'est lui qui déclenche un nouveau passage du
 * crawler. Il est donc tenu à la main, page par page — une date de build
 * remise à jour à chaque déploiement voudrait dire « tout a changé » à chaque
 * fois, et Google apprend vite à ne plus y croire. **À mettre à jour quand le
 * contenu de la page change**, pas à chaque déploiement.
 */
const ROUTES: ReadonlyArray<{
  path: string;
  priority: number;
  /** Dernière modification réelle du contenu, en ISO court. */
  lastModified: string;
}> = [
  { path: "/", priority: 1, lastModified: "2026-07-24" },
  { path: "/pricing", priority: 0.8, lastModified: "2026-07-24" },
  { path: "/legal", priority: 0.3, lastModified: "2026-07-23" },
  { path: "/terms", priority: 0.3, lastModified: "2026-07-23" },
  { path: "/privacy", priority: 0.3, lastModified: "2026-07-24" },
  { path: "/cookies", priority: 0.3, lastModified: "2026-07-23" },
];

export default function sitemap(): MetadataRoute.Sitemap {
  return ROUTES.map(({ path, priority, lastModified }) => ({
    url: `${SITE_URL}${path}`,
    lastModified,
    changeFrequency: "monthly" as const,
    priority,
  }));
}
