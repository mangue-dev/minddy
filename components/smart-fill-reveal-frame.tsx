"use client";

import type { ReactNode } from "react";
import { AgentBeamOverlay } from "@/components/agent-beam";
import { SmartFillSweep } from "@/components/smart-fill-sweep";
import { endSmartFillReveal, type SmartFillRevealPhase } from "@/lib/smart-fill-reveal";

/**
 * The board's Smart Fill frame (MIN-1032), loaded only when a card needs it
 * (components/smart-fill-reveal.tsx): the agent beam on the border while
 * Smart Fill works, then the sweep to the filled card. The beam fades out as
 * the sweep starts.
 */
export default function SmartFillRevealFrame({
  issueId,
  phase,
  placeholder,
  children,
}: {
  issueId: string;
  phase: SmartFillRevealPhase;
  placeholder: ReactNode;
  children: ReactNode;
}) {
  const revealing = phase === "revealing";
  return (
    <SmartFillSweep
      revealing={revealing}
      placeholder={placeholder}
      onDone={() => endSmartFillReveal(issueId)}
      overlay={<AgentBeamOverlay active={!revealing} />}
    >
      {children}
    </SmartFillSweep>
  );
}
