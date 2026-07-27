"use client";

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "mangue-ui/components/ui/accordion";

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
  // `faq-accordion` : le crochet de la règle de repli de `globals.css`. Elle
  // est portée par une classe et non par un sélecteur global pour ne toucher
  // QUE les accordéons montés de force.
  return (
    <Accordion type="single" collapsible className="faq-accordion">
      {items.map((item) => (
        <AccordionItem key={item.key} value={item.key}>
          <AccordionTrigger className="gap-6 py-6 text-left text-base font-medium">
            {item.question}
          </AccordionTrigger>
          {/* `forceMount` : les réponses sont dans le HTML même repliées. Sans
              lui, elles n'existaient QUE dans la charge utile RSC sérialisée,
              c'est-à-dire à l'intérieur d'une balise `<script>` : un crawler
              qui extrait le texte de la page n'en voyait aucune — ni Google,
              ni GPTBot, ClaudeBot ou PerplexityBot, qui n'exécutent pas de
              JavaScript. Douze réponses invisibles, landing et tarifs compris.

              MAIS `forceMount` empêche AUSSI Radix de poser son `hidden` : la
              présence est forcée, donc le contenu est déclaré présent quoi
              qu'il arrive. Rien ne repliait donc les réponses — l'animation
              `accordion-up` joue une fois, sans `fill-mode`, et le contenu
              revient à sa hauteur naturelle 0,25 s plus tard. Les douze
              réponses s'affichaient dépliées au chargement (constaté sur la
              prod, corrigé ici).

              D'où le repli en CSS de `.faq-accordion` (voir `app/globals.css`),
              porté par l'état que Radix écrit sur le conteneur. `display: none`
              ne retire rien du HTML : le texte reste exactement là où les
              crawlers le lisent.

              Contrepartie assumée, inchangée : la FERMETURE n'est plus animée
              (le repli est immédiat). L'ouverture, elle, garde son animation. */}
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
