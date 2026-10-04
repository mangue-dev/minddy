"use client";

import type { ReactNode } from "react";

/** Wait for complete reads without unmounting editors or changing scroll ranges. */
export function QueryReadBoundary({
  phase,
  fallback,
  children,
  className,
  contentClassName,
}: {
  phase: "loading" | "refreshing" | "fresh" | "paused" | "error";
  fallback: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
}) {
  const ready = phase === "fresh";
  return (
    <div className={`relative ${className ?? ""}`} aria-busy={phase === "loading" || phase === "refreshing"} data-query-read-phase={phase}>
      <div className={contentClassName} style={{ visibility: ready ? undefined : "hidden" }} inert={!ready} aria-hidden={!ready || undefined}>
        {children}
      </div>
      {!ready && <div className="absolute inset-0">{fallback}</div>}
    </div>
  );
}
