"use client";

import { useRef } from "react";
import { cn } from "mangue-ui";
import { useAutosize } from "@/lib/use-autosize";

/** A textarea that grows with its content instead of scrolling. Behaves like a
    wrapping single-line field: give it `rows={1}` sizing via className. */
export function AutoTextarea({
  value,
  suggestion,
  className,
  ref: refProp,
  ...props
}: React.ComponentProps<"textarea"> & {
  value: string;
  /**
   * Texte fantôme affiché en gris à la suite de la valeur (l'appelant décide
   * quand, et ce que Tab en fait). Absent partout sauf sur le titre du
   * formulaire de création.
   *
   * Une textarea ne sait pas afficher deux couleurs : on double donc le champ
   * d'un CALQUE qui rejoue exactement le même texte — même police, même
   * interlignage, même retour à la ligne — en transparent pour la partie déjà
   * tapée, en gris pour la suite. La superposition ne tient que si les deux
   * portent la MÊME classe, d'où le `className` recopié tel quel plus bas :
   * toute typographie posée par l'appelant vaut pour les deux.
   */
  suggestion?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  // La hauteur se calcule sur le texte ET son fantôme : sinon une suggestion
  // qui passe à la ligne se ferait couper par le bas du champ.
  useAutosize(ref, value + (suggestion ?? ""));

  const textarea = (
    <textarea
      ref={(el) => {
        ref.current = el;
        if (typeof refProp === "function") refProp(el);
        else if (refProp) refProp.current = el;
      }}
      value={value}
      rows={1}
      className={cn("resize-none", className, suggestion ? "relative bg-transparent" : null)}
      {...props}
    />
  );

  if (!suggestion) return textarea;

  return (
    <div className="relative">
      <div
        aria-hidden
        className={cn(
          "resize-none pointer-events-none absolute inset-0 whitespace-pre-wrap",
          className,
        )}
      >
        <span className="text-transparent">{value}</span>
        <span className="text-muted-foreground/50">{suggestion}</span>
      </div>
      {textarea}
    </div>
  );
}
