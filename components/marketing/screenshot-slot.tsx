"use client";

import Image from "next/image";
import { useLocale } from "next-intl";
import { ImageIcon } from "lucide-react";
import { cn, useTheme } from "mangue-ui";
import {
  SCREENSHOT_SLOTS,
  screenshotSrc,
  type ScreenshotSlotId,
} from "./screenshot-slots";

/**
 * Emplacement de capture (MIN-73).
 *
 * Réserve la place exacte de l'image via `aspect-ratio` — la mise en page ne
 * bougera pas quand les vraies captures arriveront. Tant que l'entrée du
 * catalogue n'a pas de `src`, on rend la consigne de capture à l'écran : la
 * landing reste lisible et la commande de capture reste sous les yeux.
 *
 * PAS D'ANGLES ARRONDIS SUR L'IMAGE. Le cadre les portait (`rounded-xl` sur le
 * conteneur qui rogne), et une capture d'application a du contenu jusque dans
 * ses coins : la barre latérale en haut à gauche, le bord d'une carte, un
 * compteur. L'arrondi mordait dedans — un rognage silencieux, différent d'une
 * capture à l'autre selon ce qui traînait dans l'angle. Une capture se montre
 * entière ou pas du tout ; c'est le filet qui délimite l'image, pas une découpe.
 */
export function ScreenshotSlot({
  id,
  className,
  priority = false,
}: {
  id: ScreenshotSlotId;
  className?: string;
  /** À poser sur la capture du hero uniquement (chargement prioritaire). */
  priority?: boolean;
}) {
  const slot = SCREENSHOT_SLOTS[id];
  const locale = useLocale();
  const { resolvedTheme } = useTheme();
  const src = screenshotSrc(slot, {
    theme: resolvedTheme === "dark" ? "dark" : "light",
    lang: locale,
  });

  return (
    <div
      className={cn(
        "relative overflow-hidden border border-border bg-card shadow-sm",
        className,
      )}
      style={{ aspectRatio: slot.ratio }}
    >
      {src ? (
        <Image
          src={src}
          alt={slot.shot}
          fill
          unoptimized
          priority={priority}
          loading={priority ? undefined : "lazy"}
          sizes="(min-width: 1024px) 960px, 100vw"
          className="object-cover object-top"
        />
      ) : (
        <div className="absolute inset-0 flex flex-col justify-between gap-4 bg-muted/40 p-5 [background-image:repeating-linear-gradient(135deg,transparent,transparent_10px,var(--color-border)_10px,var(--color-border)_11px)] [background-size:auto] opacity-90">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <ImageIcon className="h-4 w-4" />
            <span className="rounded-md border border-border bg-card px-2 py-0.5 font-mono">
              {slot.id}
            </span>
          </div>
          <div className="max-w-prose rounded-lg border border-border bg-card/95 p-4 backdrop-blur-sm">
            <p className="mb-1 font-mono text-xs text-muted-foreground">{slot.route}</p>
            <p className="text-sm leading-relaxed text-foreground/90">{slot.shot}</p>
          </div>
        </div>
      )}
    </div>
  );
}
