"use client";

import { useEffect, useState } from "react";
import { GrainGradient } from "@paper-design/shaders-react";
import { useTheme } from "mangue-ui";
import { useShaderPalette } from "@/lib/use-shader-palette";

/**
 * Fond animé du panneau d'auth : le shader « grain gradient » de Paper Shaders,
 * teinté par le token `--primary` (cf. useShaderPalette). Mêmes réglages dans
 * les deux thèmes, seul le fond change : blanc en clair, noir en sombre. Le
 * WebGL n'est monté que sur ≥ lg (le panneau est masqué en dessous) et
 * l'animation se fige si l'utilisateur préfère moins de mouvement.
 */
export function AuthShader() {
  const { resolvedTheme } = useTheme();
  const colors = useShaderPalette();
  const [wide, setWide] = useState(false);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const mqWide = window.matchMedia("(min-width: 1024px)");
    const mqMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => {
      setWide(mqWide.matches);
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

  // Fond du shader = token --background (couleur de la colonne de droite),
  // pour que la zone « dispersée » raccorde exactement au panneau du formulaire.
  const colorBack = resolvedTheme === "dark" ? "#0d0e10" : "#f3f4f6";

  return (
    <div
      aria-hidden="true"
      className="absolute inset-0 transition-opacity duration-700 ease-out"
      style={{ opacity: wide ? 1 : 0 }}
    >
      {wide && (
        <GrainGradient
          style={{ width: "100%", height: "100%" }}
          colors={colors}
          colorBack={colorBack}
          softness={0.64}
          intensity={0.2}
          noise={0.08}
          shape="wave"
          speed={reduced ? 0 : 1.02}
          scale={2.04}
          rotation={100}
        />
      )}
    </div>
  );
}
