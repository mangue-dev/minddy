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
  keepMounted = false,
  children,
}: {
  active: boolean;
  className?: string;
  /**
   * Garde le wrapper monté même inactif (le liseré s'allume/s'éteint alors via
   * `active`, avec son fondu). Indispensable dès que les enfants portent de
   * l'état DOM — un composer, par exemple : sans ça, chaque bascule du liseré
   * remonte l'arbre, ce qui perd le focus ET le texte en cours de frappe.
   */
  keepMounted?: boolean;
  children: ReactNode;
}) {
  if (!active && !keepMounted) return <>{children}</>;
  return (
    <BorderBeam
      active={active}
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
