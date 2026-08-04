"use client";

// Menu d'actions d'un ticket : un vrai dropdown Radix (le même que les dropdowns
// classiques de l'app), décliné en deux ancrages qui partagent le même corps —
//   • IssueContextMenu — ancré à la position du pointeur (clic droit sur une carte,
//     ou sur une pill de vue du board), avec un champ de recherche en tête pour
//     filtrer les actions (désactivable sur les menus courts) ;
//   • IssueActionsMenu — ancré à un trigger (le bouton « ⋯ » du panneau d'issue).
// Une action portant des `children` devient un sous-menu en flyout latéral
// (accordéon inline sur mobile, géré par mangue-ui).
//
// La recherche (quand elle est activée) filtre les entrées de premier niveau
// (label + keywords), comme l'ancienne version cmdk. Le filtrage garde le focus
// dans le champ ; ↓ descend dans la liste, Entrée déclenche la première entrée,
// Échap ferme.

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
} from "mangue-ui";
import { Kbd } from "@/components/ui/kbd";
import { DropdownSearchRow, searchInputClass } from "@/components/search-menu";

export interface ContextMenuAction {
  id: string;
  label: string;
  /** Termes de recherche additionnels (synonymes, anglais/français…). */
  keywords?: string[];
  icon?: React.ReactNode;
  /** Touche du raccourci correspondant, affichée à droite (ex. "⇧P"). */
  shortcut?: string;
  /** Sépare l'entrée du groupe précédent (ignoré si elle ouvre la liste). */
  separatorBefore?: boolean;
  /** `destructive` = rouge, pour les actions irréversibles (supprimer). */
  variant?: "default" | "destructive";
  /** Entrée montrée mais inerte (l'action existe, elle n'est juste pas
      possible ici — ex. supprimer la dernière vue d'un board). */
  disabled?: boolean;
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
    <DropdownMenuItem
      variant={action.variant}
      disabled={action.disabled}
      onSelect={() => action.onSelect?.()}
    >
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

/** Corps commun aux deux ancrages : recherche optionnelle + liste d'actions. */
function ActionMenuBody({
  actions,
  open,
  searchable,
}: {
  actions: ContextMenuAction[];
  open: boolean;
  searchable: boolean;
}) {
  const t = useTranslations("Picker");
  const [query, setQuery] = React.useState("");
  const inputRef = React.useRef<HTMLInputElement>(null);

  // Repartir d'une recherche vide à chaque fermeture ; à l'ouverture, poser le
  // focus sur la recherche (Radix focalise le premier item par défaut ; on
  // reprend la main après lui via un rAF).
  React.useEffect(() => {
    if (!open) {
      setQuery("");
      return;
    }
    if (!searchable) return;
    const id = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [open, searchable]);

  const q = searchable ? query.trim().toLowerCase() : "";
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
    <>
      {searchable && (
        <>
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
        </>
      )}
      {visible.length === 0 ? (
        <div className="px-2.5 py-1.5 text-sm text-muted-foreground">
          {t("noResults")}
        </div>
      ) : (
        visible.map((action, i) => (
          <React.Fragment key={action.id}>
            {/* Un séparateur en tête de liste (groupe précédent entièrement
                filtré) serait une barre orpheline : on ne le rend qu'entre deux
                entrées visibles. */}
            {action.separatorBefore && i > 0 && <DropdownMenuSeparator />}
            <ActionNode action={action} />
          </React.Fragment>
        ))
      )}
    </>
  );
}

export function IssueContextMenu({
  position,
  onClose,
  actions,
  searchable = true,
}: {
  /** Coordonnées viewport du clic droit ; null = menu fermé. */
  position: { x: number; y: number } | null;
  onClose: () => void;
  actions: ContextMenuAction[];
  /** Champ de recherche en tête. À couper sur les menus de deux ou trois
      entrées (pills de vues), où il ne ferait que du bruit. */
  searchable?: boolean;
}) {
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
        <ActionMenuBody
          actions={actions}
          open={!!position}
          searchable={searchable}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Les mêmes actions, ancrées à un bouton — le « ⋯ » de l'en-tête du panneau
 * d'issue. Pas de champ de recherche par défaut : la liste y est courte et se
 * balaie d'un regard (le typeahead natif de Radix suffit), là où le clic droit
 * sert de palette.
 */
export function IssueActionsMenu({
  trigger,
  actions,
  align = "end",
  searchable = false,
}: {
  trigger: React.ReactNode;
  actions: ContextMenuAction[];
  align?: "start" | "center" | "end";
  searchable?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  return (
    // Non modal, comme le menu contextuel : les actions enchaînent sur d'autres
    // couches (confirmation de suppression, conversation de l'agent) sans que le
    // verrou de focus/pointeur du menu ne leur survive.
    <DropdownMenu open={open} onOpenChange={setOpen} modal={false}>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent align={align} side="bottom" className="min-w-56">
        <ActionMenuBody actions={actions} open={open} searchable={searchable} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
