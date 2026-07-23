"use client";

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "mangue-ui";

/** Rendu client de la FAQ (l'accordéon de mangue-ui est interactif) ; les
    questions sont traduites côté serveur et passées telles quelles. */
export function FaqAccordion({
  items,
}: {
  items: ReadonlyArray<{ key: string; question: string; answer: string }>;
}) {
  return (
    <Accordion type="single" collapsible className="border-t border-border">
      {items.map((item) => (
        <AccordionItem key={item.key} value={item.key}>
          <AccordionTrigger className="text-left text-base font-medium">
            {item.question}
          </AccordionTrigger>
          <AccordionContent className="leading-relaxed text-muted-foreground">
            {item.answer}
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}
