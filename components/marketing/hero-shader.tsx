"use client";

import { useEffect, useState } from "react";
import { GrainGradient } from "@paper-design/shaders-react";
import { useTheme } from "mangue-ui";
import { useShaderPalette } from "@/lib/use-shader-palette";

/**
 * Signature visuelle du hero (MIN-73) : le même shader « grain gradient » que le
 * panneau de connexion — mêmes couleurs, dérivées du token `--primary` (cf.
 * useShaderPalette) — en beaucoup plus discret : c'est un fond, pas un sujet.
 *
 * Réglages volontairement calmes (intensité et opacité basses, grande échelle) :
 * le texte du hero passe par-dessus et doit rester le point de contraste le plus
 * fort de la page. Le WebGL n'est monté qu'à partir de `sm` (sur mobile il coûte
 * une batterie pour une bande de 200 px) et l'animation se fige si l'utilisateur
 * demande moins de mouvement. Un dégradé de masquage fond le shader dans la
 * page vers le bas, pour qu'il n'y ait pas de couture avec la section suivante.
 *
 * Se rend au niveau de la PAGE, pas du hero : ancré sur le `relative isolate`
 * du layout marketing, il part du haut du document et passe derrière la navbar
 * (transparente hors de sa pastille) grâce à `-z-10`. Le monter dans le hero
 * le ferait démarrer sous les 80 px réservés à la barre, avec une couture
 * horizontale visible juste en dessous.
 */
export function HeroShader() {
  const { resolvedTheme } = useTheme();
  const colors = useShaderPalette();
  const [enabled, setEnabled] = useState(false);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const mqWide = window.matchMedia("(min-width: 640px)");
    const mqMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => {
      setEnabled(mqWide.matches);
      setReduced(mqMotion.matches);
    };
    sync();
    mqWide.addEventListener("change", sync);
    mqMotion.addEventListener("change", sync);
    return () => {
      mqWide.removeEventListener("change", sync);
      mqMotion.removeEventListener("change", sync);
    };
  }, []);

  const isDark = resolvedTheme === "dark";

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[520px] transition-opacity duration-700 ease-out sm:h-[640px]"
      style={{
        opacity: enabled ? (isDark ? 0.5 : 0.35) : 0,
        maskImage: "linear-gradient(to bottom, black 0%, black 35%, transparent 100%)",
        WebkitMaskImage: "linear-gradient(to bottom, black 0%, black 35%, transparent 100%)",
      }}
    >
      {enabled && (
        <GrainGradient
          style={{ width: "100%", height: "100%" }}
          colors={colors}
          colorBack={isDark ? "#0d0e10" : "#f3f4f6"}
          softness={0.72}
          intensity={0.16}
          noise={0.08}
          shape="wave"
          speed={reduced ? 0 : 0.7}
          scale={2.6}
          rotation={100}
        />
      )}
    </div>
  );
}
