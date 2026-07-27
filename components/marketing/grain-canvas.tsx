"use client";

import { GrainGradient } from "@paper-design/shaders-react";
import { useShaderPalette } from "@/lib/use-shader-palette";

/**
 * Le canvas WebGL du fond animé, et lui seul.
 *
 * Sorti de `hero-shader.tsx` pour que `@paper-design/shaders-react` ne soit
 * atteint que par un `next/dynamic` monté CONDITIONNELLEMENT (MIN-100). Un
 * `dynamic()` dont le composant parent se rend côté serveur voit son chunk
 * préchargé dans le document : la landing téléchargeait donc 12 Ko gzippés de
 * WebGL sur mobile — où le shader n'est même pas monté (il démarre à `sm`).
 * Ici, rien ne rend, donc rien ne se précharge.
 *
 * La palette est lue ici et non passée en props : elle dérive du token
 * `--primary` résolu dans le navigateur, ce qui suppose déjà d'être côté client.
 */
export default function GrainCanvas({
  isDark,
  speed,
}: {
  isDark: boolean;
  /** 0 = boucle arrêtée (hors champ, ou « moins de mouvement »). */
  speed: number;
}) {
  const colors = useShaderPalette();

  return (
    <GrainGradient
      style={{ width: "100%", height: "100%" }}
      colors={colors}
      colorBack={isDark ? "#0d0e10" : "#f3f4f6"}
      softness={0.72}
      intensity={0.16}
      noise={0.08}
      shape="wave"
      speed={speed}
      scale={2.6}
      rotation={100}
    />
  );
}
