"use client";

// Le sélecteur d'emoji d'une page (MIN-270).
//
// `frimousse` plutôt qu'une grille écrite ici : un vrai sélecteur, c'est la
// recherche multilingue, les variantes de teinte, la virtualisation de 1 800
// emojis et le repli sur ce que le navigateur sait AFFICHER. Rien de tout cela
// ne se bricole en un après-midi, et la version bricolée qu'on garderait
// afficherait des carrés vides sur la moitié des systèmes.
//
// La bibliothèque est sans style, façon Radix : c'est nous qui peignons, donc
// le sélecteur reste dans la grammaire de l'app plutôt que d'y poser un widget
// venu d'ailleurs.

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { EmojiPicker as Frimousse } from "frimousse";
import {
  Button,
  Popover,
  PopoverContent,
  PopoverTrigger,
  cn,
} from "mangue-ui";

export function EmojiPicker({
  value,
  onChange,
  className,
  children,
}: {
  value: string | null;
  /** `null` retire l'icône — la page reprend l'icône de document par défaut. */
  onChange: (emoji: string | null) => void;
  className?: string;
  /** Le déclencheur. Absent : un bouton qui montre l'emoji courant. */
  children?: React.ReactNode;
}) {
  const t = useTranslations("Pages");
  const locale = useLocale();
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {children ?? (
          <Button
            variant="ghost"
            aria-label={t("changeIcon")}
            className={cn("size-12 shrink-0 p-0 text-4xl leading-none", className)}
          >
            {value ?? "📄"}
          </Button>
        )}
      </PopoverTrigger>
      {/* `overflow-hidden` : le sélecteur peint son propre fond sur toute sa
          hauteur (barre de recherche, liste virtualisée). Sans découpe, ses
          angles carrés recouvrent ceux du panneau et le tout paraît sans rayon
          — le rayon est bien là, c'est le contenu qui passe par-dessus. */}
      <PopoverContent
        align="start"
        className="w-[320px] overflow-hidden p-0"
      >
        <Frimousse.Root
          // La langue de l'app pilote celle de la recherche : chercher
          // « fusée » doit trouver 🚀 en français comme « rocket » en anglais.
          locale={locale === "fr" ? "fr" : "en"}
          className="isolate flex h-[340px] w-full flex-col bg-popover"
          onEmojiSelect={({ emoji }) => {
            onChange(emoji);
            setOpen(false);
          }}
        >
          <div className="flex items-center gap-2 border-b border-border p-2">
            <Frimousse.Search
              placeholder={t("searchEmoji")}
              className="h-8 min-w-0 flex-1 rounded-md border border-input bg-transparent px-2 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
            {value ? (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 shrink-0 px-2 text-xs"
                onClick={() => {
                  onChange(null);
                  setOpen(false);
                }}
              >
                {t("removeIcon")}
              </Button>
            ) : null}
          </div>
          <Frimousse.Viewport className="scrollbar-quiet relative flex-1 outline-none">
            <Frimousse.Loading className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
              {t("loadingEmoji")}
            </Frimousse.Loading>
            <Frimousse.Empty className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
              {t("noEmoji")}
            </Frimousse.Empty>
            <Frimousse.List
              className="select-none pb-1"
              components={{
                CategoryHeader: ({ category, ...props }) => (
                  <div
                    className="bg-popover px-3 pt-3 pb-1.5 text-xs font-medium text-muted-foreground"
                    {...props}
                  >
                    {category.label}
                  </div>
                ),
                Row: ({ children, ...props }) => (
                  <div className="scroll-my-1 px-1" {...props}>
                    {children}
                  </div>
                ),
                Emoji: ({ emoji, ...props }) => (
                  <button
                    type="button"
                    className="flex size-8 items-center justify-center rounded-md text-lg data-[active]:bg-accent"
                    {...props}
                  >
                    {emoji.emoji}
                  </button>
                ),
              }}
            />
          </Frimousse.Viewport>
        </Frimousse.Root>
      </PopoverContent>
    </Popover>
  );
}
