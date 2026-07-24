"use client";

import { useEffect, useState } from "react";

/**
 * Couleurs du shader « grain gradient » (login + hero), dérivées du token
 * `--primary` de globals.css : changer sa valeur recolore les deux dégradés.
 *
 * Paper Shaders parse lui-même les couleurs et ne comprend que `#hex`, `rgb()`
 * et `hsl()` — ni `var(--primary)`, ni `oklch()`, ni `color-mix()`. On laisse
 * donc le navigateur faire le travail : une sonde invisible porte l'expression
 * CSS, `getComputedStyle` la résout, et un canvas 1×1 la ramène en sRGB quel
 * que soit l'espace de couleur de sortie (oklab pour un `color-mix`).
 */

export type ShaderPalette = [light: string, base: string];

/** Voile clair (mélange perceptuel vers le blanc) puis la primaire elle-même. */
const EXPRESSIONS = ["color-mix(in oklab, var(--primary) 30%, white)", "var(--primary)"];

/** Filet de sécurité si la résolution échoue : la primaire par défaut, en dur. */
const FALLBACK: ShaderPalette = ["#c9ebcf", "#2eba5f"];

/** Valeur improbable : sert à détecter un `fillStyle` refusé par le navigateur. */
const SENTINEL = "#010203";

function toShaderColor(
  expression: string,
  probe: HTMLElement,
  ctx: CanvasRenderingContext2D | null,
): string | null {
  probe.style.color = "";
  probe.style.color = expression;
  const computed = getComputedStyle(probe).color;
  if (!computed) return null;
  // Cas courant (--primary en hex ou rgb) : déjà dans un format compris.
  if (/^(#|rgb|hsl)/i.test(computed)) return computed;
  if (!ctx) return null;
  ctx.fillStyle = SENTINEL;
  ctx.fillStyle = computed;
  if (ctx.fillStyle === SENTINEL) return null;
  ctx.clearRect(0, 0, 1, 1);
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
  return `rgb(${r}, ${g}, ${b})`;
}

export function useShaderPalette(): ShaderPalette {
  const [palette, setPalette] = useState<ShaderPalette>(FALLBACK);

  useEffect(() => {
    const probe = document.createElement("span");
    probe.style.cssText =
      "position:absolute;width:0;height:0;visibility:hidden;pointer-events:none";
    document.body.appendChild(probe);

    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });

    const read = () => {
      const [light, base] = EXPRESSIONS.map(
        (expression, i) => toShaderColor(expression, probe, ctx) ?? FALLBACK[i]!,
      );
      // Garder la même référence tant que rien ne change : le shader WebGL se
      // remonterait à chaque nouveau tableau.
      setPalette((prev) =>
        prev[0] === light && prev[1] === base ? prev : [light!, base!],
      );
    };
    read();

    // Le thème change `--primary` en posant une classe sur <html>. On relit sur
    // mutation plutôt que sur le state du ThemeProvider, dont l'effet enfant
    // peut passer avant que la classe soit appliquée.
    const observer = new MutationObserver(read);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "style"],
    });

    return () => {
      observer.disconnect();
      probe.remove();
    };
  }, []);

  return palette;
}
