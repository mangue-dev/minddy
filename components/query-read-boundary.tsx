"use client";

import type { ReactNode } from "react";

/** Wait for complete reads without unmounting editors or changing scroll ranges. */
export function QueryReadBoundary({
  phase,
  fallback,
  children,
  className,
  contentClassName,
  keepContentWhileRefreshing = false,
}: {
  phase: "loading" | "refreshing" | "fresh" | "paused" | "error";
  fallback: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  /** Keep loaded content usable during background reads; loading and errors still block. */
  keepContentWhileRefreshing?: boolean;
}) {
  const ready = phase === "fresh" || (keepContentWhileRefreshing && phase === "refreshing");
  return (
    <div className={`relative ${className ?? ""}`} aria-busy={phase === "loading" || phase === "refreshing"} data-query-read-phase={phase}>
      <div className={contentClassName} style={{ visibility: ready ? undefined : "hidden" }} inert={!ready} aria-hidden={!ready || undefined}>
        {children}
      </div>
      {!ready && <div className="absolute inset-0">{fallback}</div>}
    </div>
  );
}
