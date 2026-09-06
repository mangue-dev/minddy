"use client";

import { useState } from "react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "mangue-ui/components/ui/accordion";

/** Keep answers in server HTML while animating both directions at their natural height. */
export function FaqAccordion({
  items,
}: {
  items: ReadonlyArray<{ key: string; question: string; answer: string }>;
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
    </Accordion>
  );
}
