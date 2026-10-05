"use client";

import dynamic from "next/dynamic";

/**
 * The classic sonner `<Toaster>`, lazily loaded (MIN-100).
 *
 * Mounted by auth screens and the public feedback board. The authenticated
 * shell uses `ContentToaster` to anchor notifications to its content pane.
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
