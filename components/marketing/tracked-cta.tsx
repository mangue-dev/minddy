"use client";

import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { useAnalytics } from "@/lib/use-analytics";
import type { AnalyticsPropsFor } from "@/lib/analytics-events";

type CtaLocation = AnalyticsPropsFor<"landing_cta_clicked">["location"];

/**
 * Lien d'appel à l'action du site public, tracké (MIN-78).
 *
 * Les sections marketing sont des composants SERVEUR (elles lisent les
 * traductions côté serveur) : elles ne peuvent pas appeler `useAnalytics()`.
 * Ce wrapper client minimal ne prend en charge QUE le clic — le contenu reste
 * rendu par le serveur et passe en `children`, donc rien de plus ne bascule
 * côté client.
 *
 * `location` est l'information qui compte : savoir lequel des cinq points
 * d'entrée vers l'inscription convertit réellement.
 */
export function TrackedCta({
  location,
  children,
  ...props
}: { location: CtaLocation; children: ReactNode } & ComponentProps<typeof Link>) {
  const { track } = useAnalytics();
  return (
    <Link {...props} onClick={() => track("landing_cta_clicked", { location })}>
      {children}
    </Link>
  );
}
