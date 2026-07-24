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
  const { group, resetGroups, setProjectContext } = useAnalytics();

  useEffect(() => {
    const projectId = projectIdFromPath(pathname ?? "");
    // Deux canaux volontairement : la PROPRIÉTÉ `project_id` (gratuite, sur
    // laquelle on peut découper dès aujourd'hui) et le GROUPE PostHog (qui
    // n'apporte ses agrégats qu'avec l'add-on payant, mais ne coûte rien tant
    // qu'on n'y souscrit pas — la facturation démarre à la souscription).
    setProjectContext(projectId);
    if (projectId) {
      group("project", projectId);
    } else {
      resetGroups();
    }
  }, [pathname, group, resetGroups, setProjectContext]);

  return null;
}
