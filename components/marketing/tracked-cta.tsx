"use client";

import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { useAnalytics } from "@/lib/use-analytics";
import type { AnalyticsPropsFor } from "@/lib/analytics-events";

type CtaLocation = AnalyticsPropsFor<"landing_cta_clicked">["location"];

/**
 * Public site call-to-action link, tracked (MIN-78).
 *
 * Marketing sections are SERVER components (they read the
 * translations on the server side): they cannot call `useAnalytics()`.
 * This minimal client wrapper ONLY supports clicking — the content remains
 * rendered by the server and goes to `children`, so nothing more switches to
 * on the client side.
 *
 * `location` is the information that matters: knowing which of the five Input points
 * to registration actually converts.
 */
export function TrackedCta({
  location,
  children,
  ...props
}: { location: CtaLocation; children: ReactNode } & ComponentProps<typeof Link>) {
  const { track } = useAnalytics();
  return (
    <Link {...props} onClick={() => track("landing_cta_clicked", { location })}>
      {children}
    </Link>
  );
}
