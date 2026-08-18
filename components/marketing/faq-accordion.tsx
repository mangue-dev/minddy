"use client";

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "mangue-ui/components/ui/accordion";

/**
 * Customer rendering of the FAQ (the mango-ui accordion is interactive); THE
 * questions are translated server-side and passed as is.
 *
 * No rule at the top of the list: the first line would fall just under the title
 * of section and would give an orphan bar. The questions are separated between
 * they (`not-last:border-b` carried by the item), not framed.
 *
 * `animated`: the answers here are static (nothing that grows after the
 * montage), this is exactly the case where the accordion pitch animation is
 * safe — see `AccordionContent`'s comment in mangue-ui.
 */
export function FaqAccordion({
  items,
}: {
  items: ReadonlyArray<{ key: string; question: string; answer: string }>;
}) {
  // `faq-accordion`: the hook of the fallback rule of `globals.css`. She
  // is carried by a class and not by a global selector so as not to affect
  // THAT accordions mounted by force.
  return (
    <Accordion type="single" collapsible className="faq-accordion">
      {items.map((item) => (
        <AccordionItem key={item.key} value={item.key}>
          <AccordionTrigger className="gap-6 py-6 text-left text-base font-medium">
            {item.question}
          </AccordionTrigger>
          {/* `forceMount`: the answers are in the HTML even when folded. Without
              him, they ONLY existed in the serialized RSC payload,
              that is to say inside a `<script>` tag: a crawler
              who extracts the text from the page saw none — neither Google,
              nor GPTBot, ClaudeBot or PerplexityBot, which do not execute
              JavaScript. Twelve invisible responses, landing and prices included.

              BUT `forceMount` ALSO prevents Radix from placing his `hidden`: the
              presence is forced, so the content is declared present which
              let it happen. So nothing matched the answers — the animation
              `accordion-up` plays once, without `fill-mode`, and the content
              returns to its natural height 0.25 s later. The twelve
              answers were displayed unfolded when loading (observed on the
              prod, corrected here).

              Hence the CSS fallback of `.faq-accordion` (see `app/globals.css`),
              carried by the state that Radix writes on the container. `display: none`
              does not remove anything from the HTML: the text remains exactly where the
              crawlers read it.

              Counterparty assumed, unchanged: CLOSURE is no longer animated
              (the withdrawal is immediate). The opening retains its animation. */}
          <AccordionContent
            forceMount
            animated
            className="pb-6 leading-relaxed text-muted-foreground"
          >
            {item.answer}
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}
