"use client";

import type { ReactNode } from "react";
import { ScrollFadeEdges } from "@/components/scroll-fade-edges";
import { useScrollFade } from "@/lib/use-scroll-fade";

import { DictateButton, type DictateButtonProps } from "@/components/ai-elements/dictate-button";
import { NumoIcon } from "@/components/numo-icon";

/** A single recorder is mounted: at the start of the desktop footer, or as a
    square icon button beside the mobile create button. */
export function CreationDictation({ mobile, busy, busyLabel, ...props }: DictateButtonProps & {
  mobile: boolean;
  busy: boolean;
  busyLabel: string;
}) {
  return <div className="creation-dictation">
    {busy ? <div role="status" className={mobile ? "flex size-11 items-center justify-center" : "flex min-h-11 items-center gap-3 text-sm"}>
      <NumoIcon state="thinking" className="size-6 shrink-0 text-primary" />
      <span className="sr-only">{busyLabel}</span>
    </div> : <DictateButton {...props}
      className={mobile ? "aspect-square size-11 bg-primary/10 text-primary [&_svg]:size-5" : "-ml-2"} />}
  </div>;
}

/**
 * A phone's creation properties: one row of the desktop's buttons that
 * scrolls sideways and snaps button by button, as the editor's toolbar does,
 * its edges fading where more buttons hide.
 */
export function CreationCarousel({ children }: { children: ReactNode }) {
  const { ref, scrollProps, edges } = useScrollFade<HTMLDivElement>("x");
  return (
    // Within the form's width: the form clips what passes its edges, and the
    // fades sit on those edges.
    <div className="relative">
      <div ref={ref} onScroll={scrollProps.onScroll}
        className="creation-carousel no-scrollbar flex snap-x snap-mandatory items-center gap-4 overflow-x-auto overscroll-x-contain"
        style={{ touchAction: "pan-x" }}>
        {children}
      </div>
      <ScrollFadeEdges edges={edges} axis="x" from="from-card" />
    </div>
  );
}
