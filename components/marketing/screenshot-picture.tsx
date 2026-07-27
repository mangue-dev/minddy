"use client";

import { useEffect, useRef, useState, type ComponentProps } from "react";
import { cn } from "mangue-ui";

/**
 * Le `<picture>` d'une capture, et son fondu à la charge (MIN-73, MIN-88).
 *
 * Seul le fondu a besoin du client : il part de l'événement `load` de l'image,
 * qui n'existe pas côté serveur. Tout le reste — quelle variante servir, dans
 * quelle langue, dans quel thème, à quelles largeurs — est calculé par
 * `screenshot-slot.tsx`, qui est un composant serveur.
 *
 * ENTRÉE À LA CHARGE, pas seulement au scroll. Les blocs de la landing entrent
 * via `<Reveal>` quand ils croisent le viewport — mais une capture est en
 * `loading="lazy"` : elle COMMENCE à se télécharger à peu près à ce moment-là.
 * L'apparition du conteneur jouait donc sur un cadre vide, et l'image tombait
 * dedans d'un coup, sans transition, une fois l'animation finie. Le fondu
 * ci-dessous est porté par l'image elle-même et part de son `load` : c'est le
 * seul instant qui corresponde à « l'image apparaît ».
 *
 * La capture du hero en est exemptée (`priority`) : c'est le candidat LCP, et
 * la démarrer à opacité nulle repousserait la métrique d'autant. Elle garde la
 * cascade CSS du hero, qui part d'un plancher d'opacité non nul.
 */
export function ScreenshotPicture({
  darkSrcSet,
  lightSrcSet,
  imgProps,
  priority,
}: {
  darkSrcSet: string | undefined;
  lightSrcSet: string | undefined;
  imgProps: ComponentProps<"img">;
  priority: boolean;
}) {
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
  }, [imgProps.src]);

  return (
    <picture>
      {/* Art direction par thème SYSTÈME, sans JavaScript ni cookie : le
          navigateur choisit une seule des deux variantes, avant même que React
          ne s'exécute. Voir `screenshot-slot.tsx` pour pourquoi ce n'est pas
          `useTheme()` qui décide. */}
      {darkSrcSet && <source media="(prefers-color-scheme: dark)" srcSet={darkSrcSet} />}
      {lightSrcSet && <source media="(prefers-color-scheme: light)" srcSet={lightSrcSet} />}
      {/* eslint-disable-next-line @next/next/no-img-element -- les props viennent
          de `getImageProps`, c'est le motif documenté pour l'art direction. */}
      <img
        {...imgProps}
        ref={img}
        onLoad={() => setLoaded(true)}
        className={cn(
          "object-cover object-top",
          imgProps.className,
          !priority && [
            "transition-[opacity,transform,filter] duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none",
            mounted && !loaded && "scale-[1.03] opacity-0 blur-md",
          ],
        )}
      />
    </picture>
  );
}
