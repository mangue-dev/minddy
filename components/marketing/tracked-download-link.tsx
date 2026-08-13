"use client";

import type { ComponentProps, ReactNode } from "react";
import { useAnalytics } from "@/lib/use-analytics";
import type { AnalyticsPropsFor } from "@/lib/analytics-events";

type DownloadArch = AnalyticsPropsFor<"desktop_download_clicked">["arch"];

/**
 * Le lien qui lance le `.dmg`, tracké (MIN-292).
 *
 * Même forme que `TrackedCta` et pour la même raison : `/download` est une page
 * SERVEUR, elle ne peut pas appeler `useAnalytics()`. Ce wrapper ne prend en
 * charge que le clic ; le libellé et l'icône restent rendus par le serveur et
 * passent en `children`.
 *
 * Un `<a>` et non un `<Link>` : la cible n'est pas une page mais une
 * redirection vers un fichier de cent vingt mégaoctets — un préchargement de
 * route n'aurait aucun sens.
 *
 * Ce clic est l'INTENTION, pas le téléchargement : celui-ci est compté par
 * `desktop_download_started`, côté serveur, dans la route elle-même. L'écart
 * entre les deux est ce qui dit qu'un `.dmg` n'est pas parti.
 */
export function TrackedDownloadLink({
  arch,
  children,
  ...props
}: { arch: DownloadArch; children: ReactNode } & ComponentProps<"a">) {
  const { track } = useAnalytics();
  return (
    <a {...props} onClick={() => track("desktop_download_clicked", { arch })}>
      {children}
    </a>
  );
}
