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
import { Smile } from "lucide-react";

import { AutoTextarea } from "@/components/auto-textarea";
import { EmojiPicker } from "@/components/pages/emoji-picker";

export function PageHeader({
  title,
  icon,
  onTitleChange,
  onIconChange,
  onEnter,
  autoFocus,
  readOnly,
  className,
}: {
  title: string;
  icon: string | null;
  onTitleChange: (title: string) => void;
  onIconChange: (icon: string | null) => void;
  /** Entrée depuis le titre : le curseur passe dans le corps. */
  onEnter?: () => void;
  /**
   * Page qui vient d'être créée : le curseur est mis dans le titre (MIN-272).
   *
   * C'est la seule chose qu'on ait à faire d'une page neuve — elle n'a ni nom
   * ni contenu, et laisser le curseur nulle part obligerait à cliquer dans un
   * champ vide pour commencer.
   */
  autoFocus?: boolean;
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
    // `group/header` : le bouton « ajouter une icône » n'existe qu'au survol du
    // BLOC titre, pas de sa seule ligne — on vise le titre pour l'illustrer, et
    // la cible se déroberait si elle n'apparaissait qu'au-dessus d'elle-même.
    <div className={cn("group/header flex flex-col gap-2", className)}>
      {icon ? (
        <div className="-ml-1">
          <EmojiPicker value={icon} onChange={onIconChange} />
        </div>
      ) : (
        // Pas d'icône : RIEN par défaut, et surtout pas un 📄 que personne n'a
        // choisi. Une icône posée d'office se lit comme une décision de
        // l'utilisateur — toutes les pages se ressemblent, et celui qui en veut
        // une vraie ne voit pas qu'il peut la changer.
        //
        // La place est RÉSERVÉE (`h-7`) même quand le bouton est invisible :
        // sans ça, le titre sauterait de 28 px au passage de la souris.
        <div className="-ml-1.5 flex h-7 items-center">
          <EmojiPicker value={null} onChange={onIconChange}>
            <button
              type="button"
              className={cn(
                "flex items-center gap-1.5 rounded-md px-1.5 py-1 text-xs font-medium text-muted-foreground",
                "opacity-0 transition-opacity hover:bg-muted hover:text-foreground",
                // `data-state=open` : le sélecteur ouvert, la souris part vers
                // lui et quitte l'en-tête — son déclencheur ne doit pas
                // s'effacer sous elle en chemin.
                "group-hover/header:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100",
                "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              )}
            >
              <Smile className="size-3.5" />
              {t("addIcon")}
            </button>
          </EmojiPicker>
        </div>
      )}
      <AutoTextarea
        value={draft}
        autoFocus={autoFocus}
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
