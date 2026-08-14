"use client";

import { useState, type ComponentType } from "react";
import { cn } from "mangue-ui";
import { projectOrbStyle } from "@/lib/project-orb-colors";

/**
 * Safari's accelerated compositing clips a filtered child — here the blurred
 * conic layer — to the container's *rectangle*, ignoring `border-radius`: the
 * orb then paints square corners. Giving the container a mask (and its own
 * stacking context) puts it back on the path where the rounded clip is applied.
 * Both gradient stops are fully opaque, so the mask itself paints nothing.
 */
const ROUNDED_CLIP_IN_SAFARI = {
  WebkitMaskImage: "radial-gradient(#fff, #000)",
  maskImage: "radial-gradient(#fff, #000)",
  isolation: "isolate",
} as const;

/**
 * A project's icon: the imported favicon when `iconUrl` is set (MIN-62), else a
 * deterministic gradient "orb" keyed off a stable seed (`projectOrbSeed`).
 * Layered OKLCH gradients — a base fill, a blurred offset conic for organic
 * depth, and a glassy radial highlight — give the orb a subtle sphere feel.
 * Everything the layers need (both hues, chroma, lightness, the conic's angle
 * and the highlight's centre) is drawn from the seed by `projectOrbStyle`: seven
 * traits, so that two seeds landing on nearby hues still read as two orbs. No
 * initials, exactly like AutoKap's ProjectOrb. A broken image URL falls back to
 * the orb.
 *
 * Size and corner radius come from `className` (defaults to a 20px rounded
 * square); pass e.g. `size-9 rounded-[10px]` to override.
 */
export function ProjectOrb({
  seed,
  iconUrl,
  className,
}: {
  seed: string;
  iconUrl?: string | null;
  className?: string;
}) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const { hue, hue2, chroma, lightness, angle, highlightX, highlightY } =
    projectOrbStyle(seed);
  // Les trois clartés du dégradé gardent l'écart de l'original (±0,07 autour de
  // l'aplat) : c'est lui qui donne le relief. C'est le CENTRE qui bouge d'une
  // graine à l'autre, pas l'amplitude — une orbe plate et une orbe contrastée
  // ne se liraient plus comme la même famille d'objets.
  const light = lightness + 0.07;
  const deep = lightness - 0.07;
  const soft = Math.max(0.06, chroma - 0.03);
  const vivid = chroma + 0.03;

  if (iconUrl && failedUrl !== iconUrl) {
    return (
      <span
        aria-hidden
        className={cn(
          "relative block size-5 shrink-0 overflow-hidden rounded-[5px]",
          className,
        )}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={iconUrl}
          alt=""
          className="absolute inset-0 size-full object-cover"
          onError={() => setFailedUrl(iconUrl)}
        />
      </span>
    );
  }

  return (
    <span
      aria-hidden
      className={cn(
        "relative block size-5 shrink-0 overflow-hidden rounded-[5px]",
        className,
      )}
      style={ROUNDED_CLIP_IN_SAFARI}
    >
      {/* Base color fill */}
      <span
        className="absolute inset-0"
        style={{ background: `oklch(${lightness} ${chroma} ${hue})` }}
      />
      {/* Offset conic gradient for organic depth */}
      <span
        className="absolute inset-[-50%]"
        style={{
          background: `conic-gradient(from ${angle}deg, oklch(${light} ${soft} ${hue}) 0%, oklch(${deep} ${vivid} ${hue2}) 25%, oklch(${light} ${soft} ${hue}) 50%, oklch(${lightness} ${chroma} ${hue2}) 75%, oklch(${light} ${soft} ${hue}) 100%)`,
          filter: "blur(4px)",
        }}
      />
      {/* Glassy highlight for a sphere feel */}
      <span
        className="absolute inset-0"
        style={{
          background: `radial-gradient(ellipse 70% 50% at ${highlightX}% ${highlightY}%, oklch(0.95 0.02 ${hue} / 40%) 0%, transparent 70%)`,
        }}
      />
    </span>
  );
}

// mangue-ui's <Sidebar> renders `NavItem.icon` as `<Icon className="…" />` with
// no way to pass a seed, so we hand it a per-project component. Cache by
// seed+icon to keep component identity stable across renders (otherwise the
// orb remounts).
const orbIconCache = new Map<string, ComponentType<{ className?: string }>>();

export function projectOrbIcon(
  seed: string,
  iconUrl?: string | null,
): ComponentType<{ className?: string }> {
  const cacheKey = `${seed}|${iconUrl ?? ""}`;
  const cached = orbIconCache.get(cacheKey);
  if (cached) return cached;
  const Icon = ({ className }: { className?: string }) => (
    <ProjectOrb
      seed={seed}
      iconUrl={iconUrl}
      className={cn("rounded-[5px]", className)}
    />
  );
  Icon.displayName = `ProjectOrbIcon(${seed})`;
  orbIconCache.set(cacheKey, Icon);
  return Icon;
}
