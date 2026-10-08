"use client";

import { useEffect } from "react";
import type { Locale } from "@/i18n/config";
import { migratedDocumentationHref, type DocumentationLegacyRoute } from "@/lib/documentation-core.mjs";

/** URL fragments reach the browser only, so resolve them after rendering the guide. */
export function DocumentationLegacyLocation({ id, locale, route }: {
  id: string; locale: Locale; route: DocumentationLegacyRoute;
}) {
  useEffect(() => {
    const href = migratedDocumentationHref(id, locale, route, window.location.search, window.location.hash);
    if (!href) return;
    window.location.replace(href);
  }, [id, locale, route]);
  return null;
}
