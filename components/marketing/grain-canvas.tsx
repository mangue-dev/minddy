"use client";

import { GrainGradient } from "@paper-design/shaders-react";
import { useShaderPalette } from "@/lib/use-shader-palette";

/**
 * The WebGL canvas of the animated background, and it alone.
 *
 * Taken out of `hero-shader.tsx` so that `@paper-design/shaders-react` is
 * only reached by a CONDITIONALLY mounted `next/dynamic` (MIN-100). A
 * `dynamic()` whose parent component goes to the server side sees its chunk
 * preloaded in the document: the landing therefore downloaded 12 KB gzipped from
 * WebGL on mobile — where the shader is not even mounted (it starts at `sm`) client.
 */
export default function GrainCanvas({
  isDark,
  speed,
}: {
  isDark: boolean;
  /** 0 = loop stopped (out of scope, or “less movement”). */
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
