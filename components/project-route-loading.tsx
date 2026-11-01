"use client";

import { usePathname } from "next/navigation";
import { routeLoadingComponent } from "@/components/route-loading-skeleton";

/**
 * The project page's own `loading.tsx`, while the project layout resolves the
 * readable segment on the server (app/(app)/projects/[id]/layout.tsx). The
 * layout streams behind it, so the document and its scripts leave before
 * that read instead of after it (MIN-875).
 */
export function ProjectRouteLoading() {
  const Loading = routeLoadingComponent(usePathname());
  return Loading ? <Loading /> : null;
}
