"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { cn, useTheme } from "mangue-ui";
import { useShaderPalette } from "@/lib/use-shader-palette";

/**
 * Le fond animé de la landing (MIN-73), monté deux fois : sous le hero et sous
 * la dernière relance, pour que la page se referme comme elle s'ouvre. Tout ce
 * qui suit vaut pour les deux ; seules la géométrie et le masque changent.
 *
 * C'est le même shader « grain gradient » que le
 * panneau de connexion — mêmes couleurs, dérivées du token `--primary` (cf.
 * useShaderPalette) — en beaucoup plus discret : c'est un fond, pas un sujet.
 *
 * Réglages volontairement calmes (intensité et opacité basses, grande échelle) :
 * le texte du hero passe par-dessus et doit rester le point de contraste le plus
 * fort de la page. Le WebGL n'est monté qu'à partir de `sm` (sur mobile il coûte
 * une batterie pour une bande de 200 px) et l'animation se fige si l'utilisateur
 * demande moins de mouvement. Un dégradé de masquage fond le shader dans la
 * page vers le bas, pour qu'il n'y ait pas de couture avec la section suivante.
 *
 * Se rend au niveau de la PAGE, pas du hero : ancré sur le `relative isolate`
 * du layout marketing, il part du haut du document et passe derrière la navbar
 * (transparente hors de sa pastille) grâce à `-z-10`. Le monter dans le hero
 * le ferait démarrer sous les 80 px réservés à la barre, avec une couture
 * horizontale visible juste en dessous.
 *
 * IL S'ARRÊTE QUAND ON L'A DÉPASSÉ. La librairie ne met la boucle en pause que
 * si l'ONGLET est caché (`document.hidden`) : elle n'a pas d'IntersectionObserver.
 * Mesuré sur la landing, le shader demandait donc encore 120 images par seconde
 * alors qu'il était à 10 700 px au-dessus du viewport — pour un fond que
 * personne ne regarde, sur toute la longueur de la page. L'observer ci-dessous
 * passe `speed` à 0 dès qu'il sort du champ, ce que `setCurrentSpeed` traduit
 * par un `cancelAnimationFrame` (shader-mount.js) : la boucle s'arrête net.
 *
 * On ne DÉMONTE pas le shader pour autant — ça détruirait le contexte WebGL et
 * il faudrait le recréer à chaque retour en haut de page, ce qui coûte plus
 * cher que de laisser un canvas figé sur sa dernière image.
 */
/**
 * `@paper-design/shaders-react` est une librairie WebGL : chargée statiquement,
 * elle entrait dans le bundle INITIAL de la landing — celui qui doit arriver
 * avant que la page soit interactive — pour un fond décoratif qui n'est même
 * pas monté sous 640 px. `ssr: false` parce que le shader ne rend rien
 * d'utile côté serveur : c'est un canvas (MIN-88).
 */
const GrainGradient = dynamic(
  () => import("@paper-design/shaders-react").then((m) => m.GrainGradient),
  { ssr: false },
);

/** Dégradé de masquage : le shader ne s'arrête jamais net, il se fond dans la
    page. Le hero se dissout vers le bas ; le CTA, pris entre deux sections, se
    dissout des deux côtés. */
const MASKS = {
  hero: "linear-gradient(to bottom, black 0%, black 35%, transparent 100%)",
  cta: "linear-gradient(to bottom, transparent 0%, black 35%, black 68%, transparent 100%)",
} as const;

function GrainBackdrop({
  className,
  mask,
}: {
  /** Géométrie du fond : c'est l'appelant qui décide où il se pose. */
  className: string;
  mask: string;
}) {
  const { resolvedTheme } = useTheme();
  const colors = useShaderPalette();
  const [enabled, setEnabled] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [onScreen, setOnScreen] = useState(true);
  const holder = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const mqWide = window.matchMedia("(min-width: 640px)");
    const mqMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => {
      setEnabled(mqWide.matches);
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

  useEffect(() => {
    const el = holder.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    // Une marge de 200 px relance l'animation juste avant qu'elle redevienne
    // visible : personne ne doit voir le fond repartir sous ses yeux.
    const io = new IntersectionObserver(
      ([entry]) => setOnScreen(entry.isIntersecting),
      { rootMargin: "200px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [enabled]);

  const isDark = resolvedTheme === "dark";

  return (
    <div
      ref={holder}
      aria-hidden="true"
      className={cn(
        "pointer-events-none transition-opacity duration-700 ease-out",
        className,
      )}
      style={{
        opacity: enabled ? (isDark ? 0.5 : 0.35) : 0,
        maskImage: mask,
        WebkitMaskImage: mask,
      }}
    >
      {enabled && (
        <GrainGradient
          style={{ width: "100%", height: "100%" }}
          colors={colors}
          colorBack={isDark ? "#0d0e10" : "#f3f4f6"}
          softness={0.72}
          intensity={0.16}
          noise={0.08}
          shape="wave"
          speed={reduced || !onScreen ? 0 : 0.7}
          scale={2.6}
          rotation={100}
        />
      )}
    </div>
  );
}

/** Le fond du haut de page, posé au niveau de la PAGE (voir plus haut). */
export function HeroShader() {
  return (
    <GrainBackdrop
      className="absolute inset-x-0 top-0 -z-10 h-[520px] sm:h-[640px]"
      mask={MASKS.hero}
    />
  );
}

/**
 * Le même fond sous la dernière relance : la page se referme sur l'image qui
 * l'a ouverte. Il remplit la section (qui porte `relative isolate`) au lieu de
 * partir du haut du document, et se fond en haut comme en bas pour ne faire de
 * couture ni avec la FAQ ni avec le pied de page.
 */
export function CtaShader() {
  return <GrainBackdrop className="absolute inset-0 -z-10" mask={MASKS.cta} />;
}
