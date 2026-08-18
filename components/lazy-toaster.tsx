"use client";

import dynamic from "next/dynamic";

/**
 * The `<Toaster>` to ring, lazily loaded (MIN-100).
 *
 * It is mounted by the root layout, so on ALL pages — including the six
 * public pages, which never display a toast. Sonner and its container
 * weighed 12 KB gzipped in the initial bundle of the landing, in front of the image of the
 * LCP in the download queue.
 *
 * `ssr: false` without risk of lag: mounted, the component only returns one
 * empty region as long as no toast exists. And a toast never starts from the first
 * paint — it responds to an action, so well after hydration.
 *
 * A client wrapper is necessary: `next/dynamic` with `ssr: false` is not
 * allowed in a Server Component, and root layout is one.
 */
const Toaster = dynamic(
  () => import("mangue-ui/components/ui/sonner").then((m) => m.Toaster),
  { ssr: false },
);

export function LazyToaster() {
  return <Toaster />;
}
