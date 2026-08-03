import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type RefCallback,
} from "react";

/** Default height/width of the soft fade zone at each scrollable edge. */
const FADE = "2rem";

function maskImage(
  start: boolean,
  end: boolean,
  axis: "x" | "y",
  fade: string
): string | undefined {
  if (!start && !end) return undefined;
  const dir = axis === "y" ? "to bottom" : "to right";
  const from = start ? `transparent, #000 ${fade}` : "#000";
  const to = end ? `#000 calc(100% - ${fade}), transparent` : "#000";
  return `linear-gradient(${dir}, ${from}, ${to})`;
}

/**
 * Softly fades the leading and/or trailing edge of a scroll container to hint
 * that the content continues past the edge — but only on the side(s) that
 * actually have more to reveal (leading once scrolled off the start, trailing
 * until the end). Pass `"x"` for a horizontal scroller (default is vertical).
 *
 * Merge `ref` with any other ref on the scroll element and spread `scrollProps`
 * (an `onScroll` handler + the mask `style`) onto it. The mask only changes when
 * an edge crosses its threshold, so scrolling stays cheap.
 *
 * Works the same on a box that only CLIPS (`overflow: hidden`): nothing scrolls,
 * so only the trailing edge ever fades — which is exactly the "there is more
 * text below" of a preview (components/home/home-scratchpad-section.tsx). Such a
 * preview wants a longer ramp than a scroller's edge hint, hence `fade`.
 */
export function useScrollFade<T extends HTMLElement>(
  axis: "x" | "y" = "y",
  fade: string = FADE
) {
  const elRef = useRef<T | null>(null);
  // Le nœud est AUSSI un état : l'élément observé peut n'arriver qu'après le
  // premier rendu (un aperçu qui ne se monte qu'une fois ses données là, cf.
  // l'accueil), et l'effet doit alors se rejouer pour l'observer. Avec la seule
  // ref, il tournait une fois dans le vide et plus rien ne mesurait jamais.
  const [node, setNode] = useState<T | null>(null);
  const [edges, setEdges] = useState({ start: false, end: false });

  const update = useCallback(() => {
    const el = elRef.current;
    if (!el) return;
    const offset = axis === "y" ? el.scrollTop : el.scrollLeft;
    const client = axis === "y" ? el.clientHeight : el.clientWidth;
    const scroll = axis === "y" ? el.scrollHeight : el.scrollWidth;
    const start = offset > 1;
    const end = offset + client < scroll - 1;
    setEdges((prev) =>
      prev.start === start && prev.end === end ? prev : { start, end }
    );
  }, [axis]);

  const ref = useCallback<RefCallback<T>>((el) => {
    elRef.current = el;
    setNode(el);
  }, []);

  // Recompute when the container resizes or its content changes (add/remove/
  // reorder), so the trailing fade appears/disappears without a scroll event.
  useEffect(() => {
    const el = node;
    if (!el) return;
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    const mo = new MutationObserver(update);
    mo.observe(el, { childList: true, subtree: true });
    return () => {
      ro.disconnect();
      mo.disconnect();
    };
  }, [node, update]);

  const mask = maskImage(edges.start, edges.end, axis, fade);
  const scrollProps = {
    onScroll: update,
    style: mask
      ? ({ WebkitMaskImage: mask, maskImage: mask } as CSSProperties)
      : undefined,
  };

  // `edges` sort avec le reste : « il reste du contenu de ce côté » sert au-delà du
  // fondu — c'est aussi la condition d'un bouton de retour en bas (le fil de l'agent).
  // Le mesurer deux fois sur le même nœud n'apprendrait rien de plus.
  return { ref, scrollProps, edges };
}
