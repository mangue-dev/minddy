"use client";

import { useState, type ComponentType } from "react";
import { cn } from "mangue-ui";

/**
 * Deterministic hue in [0,360) from a seed string (djb2-style hash), so the
 * same project always renders the same gradient. Mirrors AutoKap's `projectHue`.
 */
function projectHue(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  }
  return ((hash % 360) + 360) % 360;
}

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
 * deterministic gradient "orb" keyed off a stable seed (the project id).
 * Layered OKLCH gradients — a base fill, a blurred offset conic for organic
 * depth, and a glassy radial highlight — give the orb a subtle sphere feel. No
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
  const hue = projectHue(seed);
  const hue2 = (hue + 40) % 360;

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
        style={{ background: `oklch(0.65 0.15 ${hue})` }}
      />
      {/* Offset conic gradient for organic depth */}
      <span
        className="absolute inset-[-50%]"
        style={{
          background: `conic-gradient(from 135deg, oklch(0.72 0.12 ${hue}) 0%, oklch(0.58 0.18 ${hue2}) 25%, oklch(0.72 0.12 ${hue}) 50%, oklch(0.65 0.15 ${hue2}) 75%, oklch(0.72 0.12 ${hue}) 100%)`,
          filter: "blur(4px)",
        }}
      />
      {/* Glassy highlight for a sphere feel */}
      <span
        className="absolute inset-0"
        style={{
          background: `radial-gradient(ellipse 70% 50% at 40% 30%, oklch(0.95 0.02 ${hue} / 40%) 0%, transparent 70%)`,
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
