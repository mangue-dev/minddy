"use client";

import { useEffect, useRef, useState } from "react";
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
 *
 * ENTRÉE À LA CHARGE, pas seulement au scroll. Les blocs de la landing entrent
 * via `<Reveal>` quand ils croisent le viewport — mais une capture est en
 * `loading="lazy"` : elle COMMENCE à se télécharger à peu près à ce
 * moment-là. L'apparition du conteneur jouait donc sur un cadre vide, et
 * l'image tombait dedans d'un coup, sans transition, une fois l'animation
 * finie. Le fondu ci-dessous est porté par l'image elle-même et part de son
 * `load` : c'est le seul instant qui corresponde à « l'image apparaît ». Même
 * courbe que le texte, pour que ça se lise comme la même page.
 *
 * La capture du hero en est exemptée (`priority`) : c'est le candidat LCP, et
 * la démarrer à opacité nulle repousserait la métrique d'autant. Elle garde la
 * cascade CSS du hero, qui part d'un plancher d'opacité non nul.
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

  const [mounted, setMounted] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const img = useRef<HTMLImageElement | null>(null);
  // `mounted` : même garde que `<Reveal>`. Le rendu serveur ne masque RIEN, donc
  // la landing reste lisible si le script ne part pas — on ne peut pas cacher
  // une image derrière une animation qui a besoin de JavaScript pour finir.
  // `complete` : une image déjà en cache peut être chargée AVANT que React
  // n'ait branché son `onLoad`. Les deux états sont posés dans le même effet,
  // donc dans le même rendu : une image déjà là n'a jamais l'occasion de
  // disparaître pour réapparaître.
  useEffect(() => {
    setMounted(true);
    if (img.current?.complete) setLoaded(true);
  }, [src]);

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
          ref={img}
          src={src}
          alt={slot.shot}
          fill
          unoptimized
          priority={priority}
          loading={priority ? undefined : "lazy"}
          sizes="(min-width: 1024px) 960px, 100vw"
          onLoad={() => setLoaded(true)}
          className={cn(
            "object-cover object-top",
            !priority && [
              "transition-[opacity,transform,filter] duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none",
              mounted && !loaded && "scale-[1.03] opacity-0 blur-md",
            ],
          )}
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
