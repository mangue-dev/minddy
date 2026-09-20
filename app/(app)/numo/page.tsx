import { Suspense } from "react";
import type { Metadata } from "next";
import { NumoCompatRedirect } from "@/components/assistant/numo-compat-redirect";
import { appPageMetadata } from "@/lib/app-metadata";

// The dedicated Numo page is retired: every conversation lives in the FAB.
// This compat surface catches the links already in circulation (push payloads,
// saved views, bookmarks) so they open the panel instead of dying in a 404.
export function generateMetadata(): Promise<Metadata> {
  return appPageMetadata("agents");
}

export default function NumoRoute() {
  return (
    <Suspense fallback={null}>
      <NumoCompatRedirect retired="numo" />
    </Suspense>
  );
}
