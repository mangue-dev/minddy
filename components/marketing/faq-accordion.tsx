"use client";

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "mangue-ui";

/**
 * Rendu client de la FAQ (l'accordéon de mangue-ui est interactif) ; les
 * questions sont traduites côté serveur et passées telles quelles.
 *
 * Pas de filet en haut de liste : le premier trait tomberait juste sous le titre
 * de section et donnerait une barre orpheline. Les questions sont séparées entre
 * elles (`not-last:border-b` porté par l'item), pas encadrées.
 *
 * `animated` : les réponses ici sont statiques (rien qui grandisse après le
 * montage), c'est exactement le cas où l'animation de hauteur de l'accordéon est
 * sûre — voir le commentaire de `AccordionContent` dans mangue-ui.
 */
export function FaqAccordion({
  items,
}: {
  items: ReadonlyArray<{ key: string; question: string; answer: string }>;
}) {
  return (
    <Accordion type="single" collapsible>
      {items.map((item) => (
        <AccordionItem key={item.key} value={item.key}>
          <AccordionTrigger className="gap-6 py-6 text-left text-base font-medium">
            {item.question}
          </AccordionTrigger>
          <AccordionContent animated className="pb-6 leading-relaxed text-muted-foreground">
            {item.answer}
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}
