"use client";

import { useCallback, type CSSProperties, type ReactNode, type Ref } from "react";
import { cn } from "mangue-ui/lib/utils";

/**
 * Apparitions au scroll de la landing (MIN-73).
 *
 * Deux contraintes ont dicté la forme :
 *
 * 1. Les sections de la landing sont des Server Components (elles traduisent
 *    avec `getTranslations`). On ne peut donc pas y poser un `whileInView` de
 *    framer-motion sans les basculer côté client. Ici les composants clients ne
 *    portent QUE l'observer : le contenu leur arrive en `children` déjà rendu
 *    par le serveur et ne traverse jamais la frontière.
 * 2. Le site public n'a aucune raison d'embarquer une librairie d'animation.
 *    L'animation elle-même est en CSS (`app/globals.css`), le JS se limite à
 *    poser `data-revealed` une fois.
 *
 * Sans JS, rien n'est masqué : `reveal-ready` — la classe qui met l'opacité à 0
 * — n'est ajoutée qu'au montage. Le rendu serveur est donc la page complète, et
 * `prefers-reduced-motion` désactive tout côté CSS.
 *
 * ## Ces frontières clientes ne coûtent presque rien (MIN-100, mesuré)
 *
 * On les soupçonnait de porter les 264 Ko de charge RSC inline de la landing —
 * 48 instances, chacune une référence de module client dans le flux. Décompte
 * réel des rangées du flux : **13,9 Ko bruts pour toutes**, soit 6 % de la
 * charge, ~2 Ko gzippés. Les enfants, eux, sont sérialisés de toute façon : ils
 * font partie de l'arbre que RSC décrit, frontière ou pas.
 *
 * Les 264 Ko venaient d'ailleurs (le catalogue i18n entier, cf.
 * `lib/public-client-messages.ts`). Donc : rien à sacrifier ici, et surtout pas
 * la peine de tout réécrire en `animation-timeline: view()` ou de remplacer les
 * 48 observers par un seul — le gain serait de l'ordre du kilo-octet.
 */

/** Éléments qu'on peut vouloir animer. Volontairement restreint : `Reveal`
    REMPLACE une balise existante (`as="header"`) plutôt que d'en ajouter une,
    pour ne pas insérer de `<div>` au milieu d'une grille ou d'un flex. */
type RevealTag = "div" | "header" | "section" | "figure" | "p" | "li" | "ul" | "ol" | "span";

/**
 * Ref de rappel qui branche l'observer sur l'élément. Une seule fonction pour
 * `Reveal`, `RevealGroup` et `RevealHeading` : ils partagent le même
 * déclenchement, seule la règle CSS qui en découle change.
 *
 * `rootMargin` bas négatif : le bloc part quand son haut a franchi 90 % de la
 * hauteur du viewport, donc un peu avant d'être réellement lu. Un margin
 * négatif en HAUT retarderait au contraire les blocs déjà à l'écran au
 * chargement — exactement ceux qui doivent enchaîner avec la cascade du hero.
 */
function useRevealRef(): Ref<HTMLElement> {
  return useCallback((el: HTMLElement | null) => {
    if (!el) return;
    el.classList.add("reveal-ready");
    if (typeof IntersectionObserver === "undefined") {
      el.dataset.revealed = "true";
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          el.dataset.revealed = "true";
          io.disconnect();
        }
      },
      { rootMargin: "0px 0px -10% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
}

interface RevealProps {
  children: ReactNode;
  /** Balise rendue — à choisir pour remplacer l'élément existant, pas l'envelopper. */
  as?: RevealTag;
  className?: string;
  id?: string;
  /** Retard avant le départ, en secondes. */
  delay?: number;
}

/** Un bloc qui monte et se dévoile quand il entre dans le viewport. */
export function Reveal({ children, as: Tag = "div", className, id, delay = 0 }: RevealProps) {
  const ref = useRevealRef();

  return (
    <Tag
      ref={ref as Ref<never>}
      id={id}
      className={cn("reveal", className)}
      style={delay ? ({ "--reveal-d": delay } as CSSProperties) : undefined}
    >
      {children}
    </Tag>
  );
}

interface RevealGroupProps extends RevealProps {
  /** Décalage entre deux enfants, en secondes (0.09 par défaut). */
  step?: number;
}

/**
 * Même chose, mais ce sont les ENFANTS DIRECTS qui entrent, en cascade — un
 * seul observer pour toute une grille de cartes. À poser sur le conteneur qui
 * existe déjà (la grille, la liste) : aucun élément n'est ajouté au DOM, donc
 * la mise en page ne bouge pas.
 */
export function RevealGroup({
  children,
  as: Tag = "div",
  className,
  id,
  delay = 0,
  step,
}: RevealGroupProps) {
  const ref = useRevealRef();

  return (
    <Tag
      ref={ref as Ref<never>}
      id={id}
      className={cn("reveal-group", className)}
      style={
        {
          ...(delay ? { "--reveal-d": delay } : null),
          ...(step ? { "--reveal-step": `${step}s` } : null),
        } as CSSProperties
      }
    >
      {children}
    </Tag>
  );
}

interface RevealHeadingProps {
  /** Texte du titre. Découpé en mots, qui entrent les uns après les autres. */
  text: string;
  as?: "h1" | "h2" | "h3";
  className?: string;
  /** Décalage entre deux mots, en secondes. */
  step?: number;
}

/**
 * Titre de section qui se dévoile mot à mot — la signature d'apparition de la
 * page, reprise du hero pour que les deux se répondent.
 *
 * Le titre complet reste dans `aria-label` et la découpe est `aria-hidden` :
 * une synthèse vocale lit une phrase, pas une suite de mots isolés.
 */
export function RevealHeading({
  text,
  as: Tag = "h2",
  className,
  step,
}: RevealHeadingProps) {
  const ref = useRevealRef();
  // Compté à part et pas déduit de l'index du tableau : `split` avec capture
  // produit aussi les séparateurs (et une chaîne vide si le texte commence par
  // un blanc), qui ne doivent pas consommer de rang dans la cascade.
  let wordIndex = 0;

  return (
    <Tag
      ref={ref as Ref<never>}
      className={cn("reveal-heading", className)}
      style={step ? ({ "--reveal-step": `${step}s` } as CSSProperties) : undefined}
      aria-label={text}
    >
      <span aria-hidden="true">
        {/* La capture du séparateur garde les espaces dans le flux : sans eux,
            des <span> inline-block collés supprimeraient les blancs. */}
        {text.split(/(\s+)/).map((token, index) => {
          if (token === "") return null;
          if (/^\s+$/.test(token)) return token;
          const i = wordIndex;
          wordIndex += 1;
          return (
            <span
              key={index}
              className="reveal-word"
              style={{ "--reveal-i": i } as CSSProperties}
            >
              {token}
            </span>
          );
        })}
      </span>
    </Tag>
  );
}
