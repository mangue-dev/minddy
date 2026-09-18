"use client";

import dynamic from "next/dynamic";

/**
 * The classic sonner `<Toaster>`, lazily loaded (MIN-100).
 *
 * Mounted ONLY by the layouts of the surfaces that have no bottom-bar status
 * line (MIN-555): the auth screens and the public feedback board `/f/`. The
 * authenticated app replaced the floating toasts with a status line in its
 * bottom chrome (`components/status-line.tsx`), so mounting the toaster there
 * would double every message.
 *
 * `ssr: false` without risk of lag: mounted, the component only returns one
 * empty region as long as no toast exists. And a toast never starts from the first
 * paint — it responds to an action, so well after hydration.
 *
 * A client wrapper is necessary: `next/dynamic` with `ssr: false` is not
 * allowed in a Server Component, and the layouts mounting this are ones.
 */
const Toaster = dynamic(
  () => import("mangue-ui/components/ui/sonner").then((m) => m.Toaster),
  { ssr: false },
);

export function LazyToaster() {
  return <Toaster closeButton />;
}
