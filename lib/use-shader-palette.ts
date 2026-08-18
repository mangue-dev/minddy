"use client";

import { useEffect, useState } from "react";

/**
 * Colors of the “grain gradient” shader (login + hero), derived from the token
 * `--primary` from globals.css: changing its value recolors both gradients.
 *
 * Paper Shaders parses the colors itself and only understands `#hex`, `rgb()`
 * and `hsl()` — neither `var(--primary)`, nor `oklch()`, nor `color-mix()`. We let
 * so the browser does the work: an invisible probe carries the expression
 * CSS, `getComputedStyle` resolves it, and a 1×1 canvas returns it to sRGB whatever
 * whatever the output color space (oklab for one `color-mix`).
 */

export type ShaderPalette = [light: string, base: string];

/** Light veil (perceptual mixture towards white) then the primary itself. */
const EXPRESSIONS = ["color-mix(in oklab, var(--primary) 30%, white)", "var(--primary)"];

/** Safety net if the resolution fails: the default primary, hard. */
const FALLBACK: ShaderPalette = ["#c9ebcf", "#2eba5f"];

/** Unlikely value: used to detect a `fillStyle` refused by the browser. */
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
  // Common case (--primary in hex or rgb): already in an understood format.
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
      // Keep the same reference as long as nothing changes: the WebGL shader is
      // would go up with each new array.
      setPalette((prev) =>
        prev[0] === light && prev[1] === base ? prev : [light!, base!],
      );
    };
    read();

    // The theme changes `--primary` by placing a class on <html>. We reread on
    // mutation rather than on the state of the ThemeProvider, whose child effect
    // can pass before the class is applied.
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
