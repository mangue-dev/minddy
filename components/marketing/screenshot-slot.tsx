import { getImageProps } from "next/image";
import { getLocale, getTranslations } from "next-intl/server";
import { ImageIcon } from "lucide-react";
import { cn } from "mangue-ui/lib/utils";
import { ScreenshotPicture } from "./screenshot-picture";
import {
  SCREENSHOT_SLOTS,
  screenshotSrc,
  type ScreenshotSlotId,
} from "./screenshot-slots";

/**
 * Emplacement de capture (MIN-73, refondu par MIN-88).
 *
 * Réserve la place exacte de l'image via `aspect-ratio` — la mise en page ne
 * bougera pas quand les vraies captures arriveront. Tant que l'entrée du
 * catalogue n'a pas de capture publiée, on rend la consigne de capture à
 * l'écran : la landing reste lisible et la commande reste sous les yeux.
 *
 * PAS D'ANGLES ARRONDIS SUR L'IMAGE. Le cadre les portait (`rounded-xl` sur le
 * conteneur qui rogne), et une capture d'application a du contenu jusque dans
 * ses coins : la barre latérale en haut à gauche, le bord d'une carte, un
 * compteur. L'arrondi mordait dedans — un rognage silencieux, différent d'une
 * capture à l'autre selon ce qui traînait dans l'angle. Une capture se montre
 * entière ou pas du tout ; c'est le filet qui délimite l'image, pas une découpe.
 *
 * ## Pourquoi un `<picture>` et plus `useTheme()` (MIN-88)
 *
 * Le composant était client et calculait son `src` depuis `resolvedTheme`. Or
 * `resolvedTheme` vaut `"light"` au PREMIER rendu (le ThemeProvider de mangue-ui
 * ne lit `localStorage` qu'en `useEffect`). Trois conséquences, toutes mesurées
 * sur la prod : le HTML servi annonçait toujours la variante claire, l'en-tête
 * `Link` préchargeait donc 222 Ko de capture claire, et un visiteur en thème
 * sombre les téléchargeait pour rien avant de charger la sombre — en
 * remplaçant au passage l'élément LCP après hydratation.
 *
 * Deux `<source media="(prefers-color-scheme: …)">` règlent les trois d'un coup,
 * sans JavaScript ni cookie : le navigateur choisit UNE variante avant même que
 * React ne s'exécute. Un cookie de thème aurait marché aussi, mais il aurait été
 * faux à la première visite (personne n'a encore de cookie) et il aurait rendu
 * le HTML dépendant des cookies — donc non cacheable par le CDN, ce qui
 * annulait l'autre moitié du travail sur le LCP.
 *
 * Reste le cas d'un visiteur qui a choisi explicitement un thème différent de
 * celui de son système : il verra la variante système. C'est un compromis
 * assumé — le site public n'a pas de sélecteur de thème, ce choix ne peut venir
 * que de l'app, et il ne coûte qu'une capture au mauvais fond.
 *
 * ## Et le `srcset`
 *
 * Les captures font 2208 px de large. Elles étaient servies en `unoptimized`,
 * donc sans `srcset` : un téléphone de 390 px téléchargeait les 2208 px et les
 * 222 Ko. `getImageProps` (le motif documenté par Next pour l'art direction)
 * rend les mêmes variantes de largeur qu'un `<Image>` normal, dans un
 * `<picture>` qui sait en plus choisir le thème.
 */
export async function ScreenshotSlot({
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
  const [locale, t] = await Promise.all([getLocale(), getTranslations("Landing")]);

  const light = screenshotSrc(slot, { theme: "light", lang: locale });
  const dark = screenshotSrc(slot, { theme: "dark", lang: locale });
  // Une variante manquante ne se rabat PAS sur l'autre pour le `src` de base
  // (voir `screenshotSrc`) — mais entre deux fonds et rien du tout, montrer la
  // seule variante publiée vaut mieux qu'un cadre vide.
  const fallback = light ?? dark;

  const sizes = "(min-width: 1024px) 960px, 100vw";

  return (
    <div
      className={cn(
        "relative overflow-hidden border border-border bg-card shadow-sm",
        className,
      )}
      style={{ aspectRatio: slot.ratio }}
    >
      {fallback ? (
        <Picture
          alt={t(slot.altKey)}
          light={light ?? fallback}
          dark={dark ?? fallback}
          sizes={sizes}
          priority={priority}
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

function Picture({
  alt,
  light,
  dark,
  sizes,
  priority,
}: {
  alt: string;
  light: string;
  dark: string;
  sizes: string;
  priority: boolean;
}) {
  const common = {
    alt,
    fill: true,
    sizes,
    priority,
    loading: priority ? undefined : ("lazy" as const),
    // `<Image priority>` pose `fetchpriority="high"` lui-même ; `getImageProps`
    // ne le fait pas. Sans lui, la capture du hero — l'élément LCP, mesuré —
    // partait à la priorité par défaut d'une image, c'est-à-dire derrière les
    // scripts et les feuilles de style (MIN-88).
    fetchPriority: priority ? ("high" as const) : undefined,
  };

  const {
    props: { srcSet: darkSrcSet },
  } = getImageProps({ ...common, src: dark });
  const {
    props: { srcSet: lightSrcSet, ...imgProps },
  } = getImageProps({ ...common, src: light });

  return (
    <ScreenshotPicture
      darkSrcSet={darkSrcSet}
      lightSrcSet={lightSrcSet}
      imgProps={imgProps}
      priority={priority}
    />
  );
}

/*
 * PAS DE `<link rel="preload">` MANUEL, et c'est délibéré (MIN-88).
 *
 * `getImageProps` ne génère pas le préchargement que `<Image priority>` pose,
 * alors on l'a d'abord écrit à la main, en deux variantes filtrées par `media`.
 * Mesuré sur le HTML servi, il atterrissait à l'octet 32 000 — bien APRÈS le
 * `</head>` (octet 5 400) : React ne peut remonter dans l'en-tête que ce qu'il
 * découvre avant de vider le shell, et le hero arrive longtemps après. Le
 * scanner de préchargement du navigateur lit de toute façon en avance : il
 * trouve le `<picture>` aux mêmes octets, au même instant. Deux balises pour
 * rien, dans une page dont chaque kilo-octet retarde justement l'image.
 *
 * `ReactDOM.preload()`, lui, remonte bien dans l'en-tête — mais il n'accepte
 * pas `media`, donc il faudrait précharger les DEUX thèmes et retélécharger ce
 * que le `<picture>` sert précisément à éviter.
 */
