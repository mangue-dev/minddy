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

import { useEffect, useRef, useState, type RefObject } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { cn } from "mangue-ui";
import { Smile } from "lucide-react";

import { AutoTextarea } from "@/components/auto-textarea";
import { EmojiPicker } from "@/components/pages/emoji-picker";

/**
 * Le curseur est-il sur la DERNIÈRE ligne visible du champ ?
 *
 * Un titre n'a pas de saut de ligne (Entrée descend dans le corps), mais il se
 * REPLIE : un titre long fait deux ou trois lignes à l'écran, et ↓ doit y
 * descendre d'une ligne avant de quitter le champ. Rien dans le DOM ne dit sur
 * quelle ligne repliée tombe le caret, d'où la mesure : un champ qui tient sur
 * une ligne rend toujours `true`, et au-delà on ne passe la main qu'au bout du
 * texte — c'est-à-dire au bout de la dernière ligne, la seule position dont on
 * soit sûr.
 */
function caretOnLastLine(field: HTMLTextAreaElement): boolean {
  if (field.selectionStart !== field.selectionEnd) return false;
  if (field.selectionEnd === field.value.length) return true;
  const line = parseFloat(getComputedStyle(field).lineHeight);
  return !Number.isFinite(line) || field.scrollHeight < line * 1.5;
}

export function PageHeader({
  title,
  icon,
  onTitleChange,
  onIconChange,
  onEnter,
  onDown,
  fieldRef,
  autoFocus,
  readOnly,
  lastEdit,
  onOpenHistory,
  className,
}: {
  title: string;
  icon: string | null;
  onTitleChange: (title: string) => void;
  onIconChange: (icon: string | null) => void;
  /** Entrée depuis le titre : une ligne vide s'ouvre en tête du corps, curseur
      dedans — le geste d'une ligne, pas celui d'un champ qu'on quitte. */
  onEnter?: () => void;
  /**
   * ↓ depuis la dernière ligne du titre : le curseur passe dans le corps, parce
   * que la première ligne du corps est bien la ligne d'en dessous. C'est
   * l'autre moitié du passage que tient title-bridge.ts dans l'éditeur.
   */
  onDown?: () => void;
  /** Le champ lui-même — par où l'appelant lui rend le focus (⌫ ou ↑ dans le
      corps ramènent en fin de titre). */
  fieldRef?: RefObject<HTMLTextAreaElement | null>;
  /**
   * Page qui vient d'être créée : le curseur est mis dans le titre (MIN-272).
   *
   * C'est la seule chose qu'on ait à faire d'une page neuve — elle n'a ni nom
   * ni contenu, et laisser le curseur nulle part obligerait à cliquer dans un
   * champ vide pour commencer.
   */
  autoFocus?: boolean;
  readOnly?: boolean;
  /**
   * QUI a écrit en dernier, et quand (MIN-277).
   *
   * Sur un ticket, personne ne le demande. Sur de la doc, c'est *la* ligne qui
   * fait qu'on croit une page : « modifiée par Clément il y a 2 jours »
   * distingue une décision en vigueur d'une note morte. Le nom vient déjà
   * résolu — « minddy » quand l'écriture est celle de l'agent, quel que soit le
   * compte qui l'a permise.
   */
  lastEdit?: { name: string; at: string } | null;
  /**
   * La ligne devient le chemin vers l'HISTORIQUE, et c'est le bon endroit :
   * c'est en lisant « modifiée par quelqu'un d'autre » qu'on se demande ce qui a
   * changé. Un menu ⋯ à part poserait la question loin de sa réponse.
   */
  onOpenHistory?: () => void;
  className?: string;
}) {
  const t = useTranslations("Pages");
  const format = useFormatter();

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
        ref={fieldRef}
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
          // Un titre n'a pas de saut de ligne : Entrée OUVRE la ligne suivante,
          // qui est la première du corps — le champ se comporte comme la ligne
          // qu'il paraît être (cf. block-actions.ts, `focusDocumentStart`).
          if (event.key === "Enter") {
            event.preventDefault();
            onEnter?.();
            return;
          }
          if (event.key === "ArrowDown" && onDown && caretOnLastLine(event.currentTarget)) {
            event.preventDefault();
            onDown();
          }
        }}
        className="w-full border-0 bg-transparent p-0 font-display text-4xl font-semibold tracking-tight outline-none placeholder:text-muted-foreground/50"
      />
      {/* Une LIGNE, pas un bandeau : c'est un repère qu'on cherche quand on
          arrive sur une page, jamais une chose à lire. L'appelant ne la donne
          qu'une fois le nom résolu — un nom qui change sous les yeux, le temps
          que les membres arrivent, se lit comme une erreur. */}
      {lastEdit ? (
        <button
          type="button"
          onClick={onOpenHistory}
          disabled={!onOpenHistory}
          className={cn(
            "-mt-0.5 w-fit rounded px-0 text-left text-xs text-muted-foreground/70 transition-colors",
            onOpenHistory && "hover:text-foreground",
            "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          )}
        >
          {t("lastEditedBy", {
            name: lastEdit.name,
            time: format.relativeTime(new Date(lastEdit.at), new Date()),
          })}
        </button>
      ) : null}
    </div>
  );
}
