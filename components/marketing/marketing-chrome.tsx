"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { routeByPath } from "@/lib/public-routes";

/** Self-hosting guides supply their own documentation header and help surface. */
export function MarketingChrome({ children, navigation, footer }: { children: ReactNode; navigation: ReactNode; footer: ReactNode }) {
  const route = routeByPath(usePathname())?.key;
  if (route === "selfHosting" || route === "selfHostingInstall") return children;
  // Product images on the public pages are pictures, not content to drag or select.
  return <>{navigation}<main className="flex-1 [&_img]:select-none [&_img]:[-webkit-user-drag:none]">{children}</main>{footer}</>;
}
