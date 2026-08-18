"use client";

import { useCallback, type CSSProperties, type ReactNode, type Ref } from "react";
import { cn } from "mangue-ui/lib/utils";

/**
 * Appearances in the landing scroll (MIN-73).
 *
 * Two constraints dictated the form:
 *
 * 1. The landing sections are Server Components (they translate to
 * with `getTranslations`). We cannot therefore place a `whileInView` de
 * framer-motion without switching them to the client side. Here the client components do
 * ONLY observe it: the content arrives to them in `children` already rendered
 * by the server and never crosses the border.
 * 2. The public site has no reason to embed an animation library.
 * The animation itself is in CSS (`app/globals.css`), the JS is limited to
 * set `data-revealed` once.
 *
 * Without JS, nothing is hidden: `reveal-ready` — the class which sets the opacity to 0
 * — is only added during editing. The server rendering is therefore the complete page, and
 * `prefers-reduced-motion` disables all CSS side.
 *
 * ## These client borders cost almost nothing (MIN-100, measured)
 *
 * They were suspected of carrying the 264 KB inline RSC payload of the landing —
 * 48 instances, each a client module reference in the flow. Count
 * actual flow rows: **13.9 KB raw for all**, or 6% of the
 * load, ~2 KB gzipped. The children are serialized anyway: they
 * are part of the tree that RSC describes, border or not.
 *
 * The 264 KB came from elsewhere (the entire i18n catalog, cf.
 * `lib/public-client-messages.ts`). So: nothing to sacrifice here, and especially not
 * the trouble of rewriting everything in `animation-timeline: view()` or replacing the
 * 48 observers by a single one — the gain would be of the order of a kilobyte.
 */

/** Elements that we may want to animate. Intentionally restricted: `Reveal`
 REPLACES an existing tag (`as="header"`) rather than adding one,
 to avoid inserting a `<div>` in the middle of a grid or flex. */
// `h1` and `dl` arrived with /download (MIN-292): a title of which part
// is in serif italic cannot go through `RevealHeading`, which cuts out the
// text verbatim, and a datasheet is a list of definitions.
type RevealTag =
  | "div"
  | "header"
  | "section"
  | "figure"
  | "p"
  | "li"
  | "ul"
  | "ol"
  | "dl"
  | "span"
  | "h1";

/**
 * Callback ref that plugs the observer into the element. A single function for
 * `Reveal`, `RevealGroup` and `RevealHeading`: they share the same
 * trigger, only the resulting CSS rule changes.
 *
 * `rootMargin` low negative: the block leaves when its top has crossed 90% of the
 * height of the viewport, so a little before being actually read. A negative margin
 * at HIGH would, on the contrary, delay the blocks already on the screen before loading — exactly those which should continue with the hero's stunt.
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
  /** Rendered tag — choose to replace the existing element, not wrap it. */
  as?: RevealTag;
  className?: string;
  id?: string;
  /** Delay before departure, in seconds. */
  delay?: number;
}

/** A block that rises and is revealed when it enters the viewport. */
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
  /** Offset between two children, in seconds (0.09 by default). */
  step?: number;
}

/**
 * Same thing, but it's the DIRECT CHILDREN that come in, in cascade — a single
 * observe for an entire grid of cards. To place on the container which
 * already exists (the grid, the list): no element is added to the DOM, therefore
 * the layout does not move.
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
  /** Title text. Cut into words, which come in one after the other. */
  text: string;
  as?: "h1" | "h2" | "h3";
  className?: string;
  /** Offset between two words, in seconds. */
  step?: number;
}

/**
 * Section title which is revealed word for word — the appearance signature of the
 * page, taken from the hero so that the two respond to each other.
 *
 * The full title remains in `aria-label` and the cutout is `aria-hidden` :
 * a speech synthesis reads a sentence, not a series of isolated words.
 */
export function RevealHeading({
  text,
  as: Tag = "h2",
  className,
  step,
}: RevealHeadingProps) {
  const ref = useRevealRef();
  // Counted separately and not deducted from the array index: `split` with capture
  // also produces the separators (and an empty string if the text starts with
  // a blank), which must not consume a rank in the cascade.
  let wordIndex = 0;

  return (
    <Tag
      ref={ref as Ref<never>}
      className={cn("reveal-heading", className)}
      style={step ? ({ "--reveal-step": `${step}s` } as CSSProperties) : undefined}
      aria-label={text}
    >
      <span aria-hidden="true">
        {/* Capturing the separator keeps spaces in the stream: without them,
 pasted inline-blocks would remove whitespace. */}
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
