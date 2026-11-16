import type { Metadata } from "next";
import { FullCatalogMessages } from "@/components/full-catalog-messages";
import { LAUNCH_COVER_META } from "@/lib/mobile/bridge";
import { AppProviders } from "./app-providers";
import { ServerSeed } from "./server-seed";

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
 *
 * It also declares `minddy-launch-cover` for the mobile app
 * (lib/mobile/launch-cover.ts, LAUNCH_COVER_META in lib/mobile/bridge.ts).
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
  // The mobile app keeps its launch screen up until the page reports its
  // first content, so the app appears in one step (MIN-1006).
  other: { [LAUNCH_COVER_META.name]: LAUNCH_COVER_META.content },
};

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <FullCatalogMessages>
      {/* Outside the providers and the tab host: delivery reaches a module
          store, whichever view ends up rendering the page (MIN-880). */}
      <ServerSeed />
      <AppProviders>{children}</AppProviders>
    </FullCatalogMessages>
  );
}
