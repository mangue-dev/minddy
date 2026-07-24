"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useAnalytics } from "@/lib/use-analytics";
import { projectIdFromPath } from "@/lib/project-id-from-path";

/**
 * Associe les événements analytics au projet courant (MIN-78).
 *
 * PostHog appelle ça un « groupe » : tant que l'association tient, chaque
 * événement porte le projet, ce qui permet de découper entonnoirs et rétention
 * par projet — et de répondre à « ce projet-là est-il vivant ? » plutôt qu'à
 * « cet utilisateur-là l'est-il ? ».
 *
 * Monté une fois dans le layout de l'app, il suit l'URL : `/projects/<id>/…`
 * pose le groupe, tout autre chemin le retire. L'init de PostHog étant différée
 * (≤800 ms), une arrivée directe sur une page projet peut manquer le groupe sur
 * ses tout premiers événements — sans conséquence, les actions mesurées
 * arrivent bien après.
 */
export function AnalyticsProjectGroup() {
  const pathname = usePathname();
  const { group, resetGroups } = useAnalytics();

  useEffect(() => {
    const projectId = projectIdFromPath(pathname ?? "");
    if (projectId) {
      group("project", projectId);
    } else {
      resetGroups();
    }
  }, [pathname, group, resetGroups]);

  return null;
}
