"use client";

// Menu contextuel (clic droit) des cartes de ticket : un vrai dropdown Radix
// (le même que les dropdowns classiques de l'app) ancré à la position du
// pointeur, avec un champ de recherche en tête pour filtrer les actions. Une
// action portant des `children` devient un sous-menu en flyout latéral
// (accordéon inline sur mobile, géré par mangue-ui).
//
// La recherche filtre les entrées de premier niveau (label + keywords), comme
// l'ancienne version cmdk. Le filtrage garde le focus dans le champ ; ↓ descend
// dans la liste, Entrée déclenche la première entrée, Échap ferme.

import * as React from "react";
import { useTranslations } from "next-intl";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  Kbd,
} from "mangue-ui";
import { DropdownSearchRow, searchInputClass } from "@/components/search-menu";

export interface ContextMenuAction {
  id: string;
  label: string;
  /** Termes de recherche additionnels (synonymes, anglais/français…). */
  keywords?: string[];
  icon?: React.ReactNode;
  /** Touche du raccourci correspondant, affichée à droite (ex. "⇧P"). */
  shortcut?: string;
  /** Sous-actions : quand présentes, l'action devient un sous-menu en flyout
      au lieu de déclencher `onSelect`. */
  children?: ContextMenuAction[];
  onSelect?: () => void;
}

/** L'entrée matche la recherche si son label ou un de ses keywords la contient. */
function actionMatches(action: ContextMenuAction, query: string): boolean {
  if (!query) return true;
  const haystack = [action.label, ...(action.keywords ?? [])]
    .join(" ")
    .toLowerCase();
  return haystack.includes(query);
}

/** Feuille : un item cliquable, avec éventuellement un raccourci à droite. */
function LeafItem({ action }: { action: ContextMenuAction }) {
  return (
    <DropdownMenuItem onSelect={() => action.onSelect?.()}>
      {action.icon}
      <span className="truncate">{action.label}</span>
      {action.shortcut && (
        <DropdownMenuShortcut>
          <Kbd size="sm">{action.shortcut}</Kbd>
        </DropdownMenuShortcut>
      )}
    </DropdownMenuItem>
  );
}

/** Branche ou feuille selon la présence d'enfants. */
function ActionNode({ action }: { action: ContextMenuAction }) {
  if (action.children && action.children.length > 0) {
    return (
      <DropdownMenuSub>
        <DropdownMenuSubTrigger>
          {action.icon}
          <span className="truncate">{action.label}</span>
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent>
          {action.children.map((child) => (
            <LeafItem key={child.id} action={child} />
          ))}
        </DropdownMenuSubContent>
      </DropdownMenuSub>
    );
  }
  return <LeafItem action={action} />;
}

export function IssueContextMenu({
  position,
  onClose,
  actions,
}: {
  /** Coordonnées viewport du clic droit ; null = menu fermé. */
  position: { x: number; y: number } | null;
  onClose: () => void;
  actions: ContextMenuAction[];
}) {
  const t = useTranslations("Picker");
  const [query, setQuery] = React.useState("");
  const inputRef = React.useRef<HTMLInputElement>(null);

  // Repartir d'une recherche vide à chaque fermeture ; à l'ouverture, poser le
  // focus sur la recherche (Radix focalise le premier item par défaut ; on
  // reprend la main après lui via un rAF).
  React.useEffect(() => {
    if (!position) {
      setQuery("");
      return;
    }
    const id = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [position]);

  const q = query.trim().toLowerCase();
  const visible = actions.filter((a) => actionMatches(a, q));

  // Le contenu est portalisé au <body> ; on y récupère les items focusables pour
  // router le clavier depuis le champ de recherche vers la liste.
  const items = () =>
    Array.from(
      document.querySelectorAll<HTMLElement>(
        '[data-slot="dropdown-menu-content"] [data-slot="dropdown-menu-item"]:not([data-disabled]),[data-slot="dropdown-menu-content"] [data-slot="dropdown-menu-sub-trigger"]:not([data-disabled])'
      )
    );

  const onInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") return; // laisse Radix fermer le menu
    if (e.key === "ArrowDown") {
      e.preventDefault();
      e.stopPropagation();
      items()[0]?.focus();
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      e.stopPropagation();
      const els = items();
      els[els.length - 1]?.focus();
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      items()[0]?.click();
      return;
    }
    // Empêche la frappe (lettres, Backspace, espace…) de déclencher le
    // typeahead de Radix : seul le champ de recherche la reçoit.
    e.stopPropagation();
  };

  return (
    <DropdownMenu
      open={!!position}
      onOpenChange={(open) => !open && onClose()}
      // Non modal : la sélection d'une relation enchaîne sur le picker de cible
      // (un autre popover) sans que le verrou de focus/pointeur ne subsiste.
      modal={false}
    >
      <DropdownMenuTrigger asChild>
        <span
          aria-hidden
          style={{
            position: "fixed",
            left: position?.x ?? 0,
            top: position?.y ?? 0,
          }}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        side="bottom"
        className="min-w-64"
        // Le trigger est invisible et hors flux : ne pas y renvoyer le focus à
        // la fermeture (évite un saut de scroll vers le point du clic).
        onCloseAutoFocus={(e) => e.preventDefault()}
        // Le menu est portalisé mais rendu, dans l'arbre React, à l'intérieur de
        // la carte cliquable (onClick = ouvrir le ticket). Les événements React
        // remontent l'arbre des composants malgré le portail : on stoppe donc la
        // propagation ici pour qu'un clic sur une option n'ouvre pas la carte.
        onClick={(e) => e.stopPropagation()}
        onContextMenu={(e) => e.stopPropagation()}
      >
        <DropdownSearchRow>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onInputKeyDown}
            placeholder={t("search")}
            className={searchInputClass}
            aria-label={t("search")}
          />
        </DropdownSearchRow>
        <DropdownMenuSeparator />
        {visible.length === 0 ? (
          <div className="px-2.5 py-1.5 text-sm text-muted-foreground">
            {t("noResults")}
          </div>
        ) : (
          visible.map((action) => (
            <ActionNode key={action.id} action={action} />
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
