import type { ReactNode } from "react";
import { ChevronDownIcon } from "lucide-react";

/**
 * FAQ list of the public pages, built from `<details name="faq">` items: one
 * answer open at a time, no client JavaScript, and closed answers stay
 * reachable by find-in-page and text-fragment links (the browser opens the
 * matching item), which a hidden accordion panel is not. The open/close
 * height animation lives in `app/globals.css` (`.faq-accordion`).
 *
 * `summary` holds plain text, not a heading: some screen readers expose it as
 * a button and drop a heading inside it.
 */
export function FaqAccordion({
  items,
  footer,
}: {
  items: ReadonlyArray<{ key: string; question: string; answer: string }>;
  /** Rendered after the items — the ask box row (MIN-590). Being inside the
   * list keeps the separators honest: the last item reads `not-last:border-b`
   * against it and closes the list above the row. */
  footer?: ReactNode;
}) {
  return (
    <div className="faq-accordion flex w-full flex-col">
      {items.map((item) => (
        <details key={item.key} name="faq" className="not-last:border-b">
          <summary className="flex cursor-pointer list-none items-start justify-between gap-6 rounded-lg py-6 text-left text-base font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
            {item.question}
            <ChevronDownIcon aria-hidden className="faq-accordion-chevron pointer-events-none size-4 shrink-0 text-muted-foreground" />
          </summary>
          <p className="pb-6 text-sm leading-relaxed text-muted-foreground">{item.answer}</p>
        </details>
      ))}
      {footer}
    </div>
  );
}
