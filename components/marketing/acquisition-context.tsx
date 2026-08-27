"use client";

import { useEffect } from "react";
import { useLocale } from "next-intl";
import { usePathname } from "next/navigation";
import { useAnalytics } from "@/lib/use-analytics";

/** Preserve the first localized public page for signup and activation funnels. */
export function AcquisitionContext() {
  const locale = useLocale();
  const pathname = usePathname();
  const { setAcquisitionContext } = useAnalytics();

  useEffect(() => {
    setAcquisitionContext(locale, pathname);
  }, [locale, pathname, setAcquisitionContext]);

  return null;
}
