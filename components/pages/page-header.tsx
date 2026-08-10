"use client";

// L'en-tête d'une page ouverte : son icône et son TITRE (MIN-270).
//
// Le titre est un champ à part, et surtout PAS le premier `H1` du corps. C'est
// la décision qui rend simples la sidebar, la recherche, le fil d'Ariane, le
// bloc sous-page et le lien de page : tous lisent une colonne, aucun n'a à
// ouvrir un document ProseMirror pour savoir comment la page s'appelle. Le prix
// est visible ici, et nulle part ailleurs — deux champs à l'écran au lieu d'un.
//
// Le champ est un `textarea` auto-agrandissant (components/auto-textarea.tsx) :
// un titre long doit passer à la ligne comme il le fera dans le document, et
// non défiler dans une fente d'une ligne.

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { cn } from "mangue-ui";

import { AutoTextarea } from "@/components/auto-textarea";
import { EmojiPicker } from "@/components/pages/emoji-picker";

export function PageHeader({
  title,
  icon,
  onTitleChange,
  onIconChange,
  onEnter,
  readOnly,
  className,
}: {
  title: string;
  icon: string | null;
  onTitleChange: (title: string) => void;
  onIconChange: (icon: string | null) => void;
  /** Entrée depuis le titre : le curseur passe dans le corps. */
  onEnter?: () => void;
  readOnly?: boolean;
  className?: string;
}) {
  const t = useTranslations("Pages");

  // Le champ est NON contrôlé par la prop pendant la frappe : la sauvegarde
  // renvoie la ligne serveur, et rebrancher `value` dessus ferait sauter le
  // curseur en fin de champ à chaque aller-retour. On n'adopte une valeur
  // distante que lorsqu'elle diffère de ce qu'on a tapé.
  const [draft, setDraft] = useState(title);
  const typed = useRef(title);
  useEffect(() => {
    if (title !== typed.current) {
      typed.current = title;
      setDraft(title);
    }
  }, [title]);

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="-ml-1">
        <EmojiPicker value={icon} onChange={onIconChange} />
      </div>
      <AutoTextarea
        value={draft}
        readOnly={readOnly}
        placeholder={t("titlePlaceholder")}
        aria-label={t("titleLabel")}
        spellCheck={false}
        onChange={(event) => {
          typed.current = event.target.value;
          setDraft(event.target.value);
          onTitleChange(event.target.value);
        }}
        onKeyDown={(event) => {
          // Un titre n'a pas de saut de ligne : Entrée descend dans le corps,
          // comme dans n'importe quel éditeur de document.
          if (event.key === "Enter") {
            event.preventDefault();
            onEnter?.();
          }
        }}
        className="w-full border-0 bg-transparent p-0 font-display text-4xl font-semibold tracking-tight outline-none placeholder:text-muted-foreground/50"
      />
    </div>
  );
}
