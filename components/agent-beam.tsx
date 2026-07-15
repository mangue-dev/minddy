"use client";

import { type ReactNode } from "react";
import { BorderBeam } from "border-beam";

/**
 * Liseré animé « agent en cours » (MIN-46) — la source unique des réglages du
 * `BorderBeam` partagée par les cartes d'issue, le container agent du panneau
 * latéral et l'input du chat/agent pendant une réponse. `active=false` → rend les
 * enfants tels quels (aucun wrapper). `className` porte le RAYON du beam (à aligner
 * sur celui de l'élément enveloppé, ex. `rounded-xl` / `rounded-2xl`).
 */
export function AgentBeam({
  active,
  className,
  children,
}: {
  active: boolean;
  className?: string;
  children: ReactNode;
}) {
  if (!active) return <>{children}</>;
  return (
    <BorderBeam
      size="pulse-inner"
      duration={4}
      colorVariant="colorful"
      theme="auto"
      className={className}
    >
      {children}
    </BorderBeam>
  );
}
