"use client";

import { type ReactNode } from "react";
import { BorderBeam, type BorderBeamSize } from "border-beam";
import { useTheme } from "mangue-ui";

/**
 * Liseré animé « agent en cours » (MIN-46) — la source unique des réglages du
 * `BorderBeam` partagée par les cartes d'issue, le container agent du panneau
 * latéral et l'input du chat/agent pendant une réponse. `active=false` → rend les
 * enfants tels quels (aucun wrapper). `className` porte le RAYON du beam (à aligner
 * sur celui de l'élément enveloppé, ex. `rounded-xl` / `rounded-2xl`).
 *
 * Le thème est résolu par l'APP (useTheme de mangue-ui), pas par le
 * `theme="auto"` de border-beam : son hook « auto » lit `matchMedia` dans
 * l'initialisation de son state — serveur « dark », premier rendu client =
 * préférence SYSTÈME → le <style> généré diffère et React régénère tout l'arbre
 * (hydration mismatch). `resolvedTheme` est SSR-safe (même valeur au SSR et au
 * premier rendu client, corrigée post-mount) et suit le VRAI thème de l'app —
 * pas l'OS, que minddy ignore par défaut (app dark).
 */
export function AgentBeam({
  active,
  className,
  size = "pulse-inner",
  keepMounted = false,
  children,
}: {
  active: boolean;
  className?: string;
  /**
   * Préréglage de la source. `pulse-inner` (défaut) est la respiration contenue
   * des grandes surfaces — carte d'issue, composer. Sur une petite pastille
   * ronde (le FAB) elle inonde le disque au lieu d'en souligner le bord : `sm`,
   * le préréglage taille bouton, y fait courir le liseré sur le contour.
   */
  size?: BorderBeamSize;
  /**
   * Garde le wrapper monté même inactif (le liseré s'allume/s'éteint alors via
   * `active`, avec son fondu). Indispensable dès que les enfants portent de
   * l'état DOM — un composer, par exemple : sans ça, chaque bascule du liseré
   * remonte l'arbre, ce qui perd le focus ET le texte en cours de frappe.
   */
  keepMounted?: boolean;
  children: ReactNode;
}) {
  const { resolvedTheme } = useTheme();
  if (!active && !keepMounted) return <>{children}</>;
  return (
    <BorderBeam
      active={active}
      size={size}
      duration={4}
      colorVariant="colorful"
      theme={resolvedTheme}
      className={className}
    >
      {children}
    </BorderBeam>
  );
}
