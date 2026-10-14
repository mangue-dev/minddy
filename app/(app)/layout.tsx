import type { Metadata } from "next";
import { Suspense } from "react";
import { FullCatalogMessages } from "@/components/full-catalog-messages";
import { RestoredPageWorkingSet } from "@/components/restored-page-working-set";
import { AppProviders } from "./app-providers";

/**
 * Authenticated server layout. The optional restored-Page working set streams
 * independently of the shell and its client providers; it does not block All
 * or turn a slow protected read into an aggregate startup dependency.
 *
 * `noindex, nofollow` on everything behind the authentication (MIN-88).
 * Belt and suspenders: the `Disallow` of robots.txt politely requests not to
 * crawler, the header and this tag prohibit indexing what would have when
 * even been reached — by an external link, a URL pasted somewhere, or a
 * robot that ignores robots.txt. Same rule as `app/(app)/admin/layout.tsx`, which
 * already had it for himself.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <FullCatalogMessages>
      <AppProviders bootstrap={<Suspense fallback={null}><RestoredPageWorkingSet /></Suspense>}>
        {children}
      </AppProviders>
    </FullCatalogMessages>
  );
}
