"use client";

import { lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import {
  cardShowsLandedRow,
  useSmartFillReveal,
  type SmartFillRevealEntry,
} from "@/lib/smart-fill-reveal";
import type { Issue, IssueCardIssue } from "@/lib/types";

/**
 * A board card's Smart Fill reveal (MIN-1032): what every card carries is
 * this subscription to its own entry, nothing more. A card Smart Fill is not
 * filling renders its body as is; the frame that shows the empty face, the
 * agent beam and the sweep (components/smart-fill-reveal-frame.tsx) is a
 * separate chunk, loaded the first time a creation needs it. Until it has
 * loaded, the empty face shows without its beam.
 *
 * The sweep waits for the card itself: it starts once the live issue the
 * card renders shows the filled row, not on the store's signal, which comes
 * a tick before the query cache delivers that row. Started, it runs to its
 * end whatever arrives meanwhile. A row edited elsewhere in between never
 * matches, so after `CATCH_UP_MS` the sweep starts anyway.
 */

const SmartFillRevealFrame = lazy(() => import("@/components/smart-fill-reveal-frame"));

/** How long a landed card waits for its live row before sweeping anyway. */
const CATCH_UP_MS = 1_000;

export function SmartFillReveal({
  issue,
  renderPlaceholder,
  children,
}: {
  /** The issue the live card renders. */
  issue: IssueCardIssue;
  /** The read-only face of the card before Smart Fill. */
  renderPlaceholder: (entry: SmartFillRevealEntry) => ReactNode;
  /** The live card. */
  children: ReactNode;
}) {
  const entry = useSmartFillReveal(issue.id);
  const landed = entry?.landed ?? null;
  const caughtUp = landed !== null && cardShowsLandedRow(issue, landed);
  // Each is keyed by the landed row, so a later creation starts afresh.
  const [timedOutFor, setTimedOutFor] = useState<Issue | null>(null);
  const [sweepingFor, setSweepingFor] = useState<Issue | null>(null);
  if (landed && sweepingFor !== landed && (caughtUp || timedOutFor === landed)) {
    // Adjusting state during render: the sweep starts in this very render.
    setSweepingFor(landed);
  }
  const sweeping = landed !== null && sweepingFor === landed;

  useEffect(() => {
    if (!landed || caughtUp || sweeping) return;
    const timer = window.setTimeout(() => setTimedOutFor(landed), CATCH_UP_MS);
    return () => window.clearTimeout(timer);
  }, [landed, caughtUp, sweeping]);

  if (!entry) return <>{children}</>;
  const placeholder = renderPlaceholder(entry);
  return (
    <Suspense fallback={placeholder}>
      <SmartFillRevealFrame
        issueId={issue.id}
        phase={sweeping ? "revealing" : "filling"}
        placeholder={placeholder}
      >
        {children}
      </SmartFillRevealFrame>
    </Suspense>
  );
}
