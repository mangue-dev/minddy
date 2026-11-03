"use client";

import { useEffect } from "react";

const SEPARATOR = " · ";

/**
 * "Roadmap · Acme · minddy": the parts that name the view, then the brand
 * that ends the route's own title ("Pages · Acme · minddy"). The brand is an
 * instance setting only the server reads (lib/site.ts).
 */
export function documentTitle(parts: ReadonlyArray<string | null | undefined>, routeTitle: string): string {
  const brand = routeTitle.split(SEPARATOR).at(-1)?.trim();
  return [...parts.filter((part): part is string => !!part?.trim()), ...(brand ? [brand] : [])].join(SEPARATOR);
}

/**
 * Names the browser tab after what a view shows when the route's metadata
 * cannot (WCAG 2.4.2): a page's title is encrypted at rest, so the server
 * titles every page of a project "Pages · Acme". The route's title comes back
 * when the view unmounts or a hidden tab deactivates it. PostHog drops
 * `$title` from its events (lib/analytics-consent.ts).
 */
export function useDocumentTitle(parts: ReadonlyArray<string | null | undefined> | null) {
  const key = parts ? JSON.stringify(parts) : null;
  useEffect(() => {
    if (!key) return;
    const previous = document.title;
    const title = documentTitle(JSON.parse(key) as string[], previous);
    document.title = title;
    return () => {
      if (document.title === title) document.title = previous;
    };
  }, [key]);
}
