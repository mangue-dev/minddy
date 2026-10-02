"use client";

import { useState, type ReactNode } from "react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "mangue-ui/components/ui/accordion";

/** Keep answers in server HTML while animating both directions at their natural height. */
export function FaqAccordion({
  items,
  footer,
}: {
  items: ReadonlyArray<{ key: string; question: string; answer: string }>;
  /** Rendered inside the root, after the items — the ask box row (MIN-590).
   * Being a child of the Accordion keeps the separators honest: the last item
   * reads `not-last:border-b` against it and closes the list above the row. */
  footer?: ReactNode;
}) {
  const [value, setValue] = useState("");

  return (
    <Accordion type="single" collapsible value={value} onValueChange={setValue} className="faq-accordion">
      {items.map((item) => (
        <AccordionItem key={item.key} value={item.key}>
          <AccordionTrigger className="gap-6 py-6 text-left text-base font-medium">
            {item.question}
          </AccordionTrigger>
          <AccordionContent forceMount inert={value !== item.key} aria-hidden={value !== item.key}
            className="pb-0 leading-relaxed text-muted-foreground">
            <div className="min-h-0 overflow-hidden"><p className="pb-6">{item.answer}</p></div>
          </AccordionContent>
        </AccordionItem>
      ))}
      {footer}
    </Accordion>
  );
}
