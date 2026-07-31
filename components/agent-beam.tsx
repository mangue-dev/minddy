"use client";

import { useCallback, useState, type ReactNode } from "react";
import { BorderBeam, type BorderBeamSize } from "border-beam";
import { useTheme } from "mangue-ui";

/** Réglages communs aux deux formes du liseré (enveloppe et calque). */
const BEAM_TUNING = { duration: 4, colorVariant: "colorful" } as const;

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
      {...BEAM_TUNING}
      active={active}
      size={size}
      theme={resolvedTheme}
      className={className}
    >
      {children}
    </BorderBeam>
  );
}

/**
 * Même liseré, posé en SURIMPRESSION dans un container au lieu de l'envelopper :
 * `absolute inset-0`, sans enfant, `pointer-events: none`. C'est la seule forme
 * possible sur une surface PORTALISÉE en `position: fixed` — le modal, le
 * panneau latéral : le portail téléporte l'élément hors de l'`AgentBeam`, qui
 * s'effondre alors à 0×0 dans le flux de la page et ne peint plus rien. À rendre
 * en DERNIER enfant du container (il passe ainsi au-dessus du contenu), lequel
 * doit être positionné — `fixed` pour les deux surfaces de mangue-ui.
 *
 * Le positionnement passe par `style` et non par des classes : la feuille de
 * style que `border-beam` génère (`[data-beam] { position: relative }`) est HORS
 * cascade layer, et bat donc les utilitaires Tailwind quel que soit leur ordre.
 *
 * Le rayon est MESURÉ sur le container plutôt que passé par le site d'appel :
 * l'auto-détection de `border-beam` lit le premier enfant, et il n'y en a pas
 * ici. Le mesurer suit aussi le vrai container — mangue-ui n'expose pas ses
 * rayons (`rounded-[2rem]` du modal, `rounded-2xl` du panneau) ni le basculement
 * en bottom sheet, où ils changent.
 */
export function AgentBeamOverlay({
  active,
  size = "pulse-inner",
}: {
  active: boolean;
  size?: BorderBeamSize;
}) {
  const { resolvedTheme } = useTheme();
  const [radius, setRadius] = useState<number>();
  // Ref de rappel plutôt qu'un effet de layout : elle ne s'exécute qu'au commit
  // client, et donc jamais au rendu serveur.
  const measureParent = useCallback((node: HTMLDivElement | null) => {
    // `offsetParent`, pas `parentElement` : c'est l'élément sur lequel
    // `inset: 0` se règle vraiment, donc celui dont il faut copier le rayon. Les
    // deux coïncident sur le panneau latéral, mais pas sur le modal en bottom
    // sheet, où mangue-ui glisse un div de défilement sans rayon ni position.
    const box = node?.offsetParent ?? node?.parentElement;
    if (!box) return;
    const r = Number.parseFloat(getComputedStyle(box).borderTopLeftRadius);
    setRadius(Number.isFinite(r) ? r : undefined);
  }, []);
  // Toujours monté : c'est ce qui donne au liseré son fondu de SORTIE quand
  // `active` retombe. Éteint, il ne peint rien (le halo est en `display: none`).
  return (
    <BorderBeam
      {...BEAM_TUNING}
      ref={measureParent}
      active={active}
      size={size}
      theme={resolvedTheme}
      borderRadius={radius}
      aria-hidden
      style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
    >
      {null}
    </BorderBeam>
  );
}
