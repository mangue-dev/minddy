import type { Metadata } from "next";
import { FullCatalogMessages } from "@/components/full-catalog-messages";
import { AppProviders } from "./app-providers";

/**
 * Segment of the authenticated app. SERVER component, which does nothing else
 * what to carry this `metadata` and climb the client provider tree
 * (`app-providers.tsx`) — a client page cannot export metadata,
 * But that's exactly what was needed here.
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
      <AppProviders>{children}</AppProviders>
    </FullCatalogMessages>
  );
}
