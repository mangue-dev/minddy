"use client";

import { type ComponentType, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Kbd } from "@/components/ui/kbd";
import { Search } from "lucide-react";
import { useModKey } from "@/lib/keyboard/use-mod-shortcut";

/**
 * A single command-palette row. Superset of mangue-ui's `CommandMenuItem`: adds
 * a `meta` slot rendered right-aligned (e.g. an issue identifier badge or a
 * project chip), mirroring how AutoKap tags each result with its project. This
 * is the shared "command list" contract consumed by both the mobile nav search
 * (mangue-ui MobileNav) and the desktop command palette (command-palette.tsx).
 */
export interface PaletteItem {
  key: string;
  label: string;
  icon?: ComponentType<{ className?: string }>;
  /** Extra terms to match against when searching (identifier, project name…). */
  keywords?: string[];
  /** Texte secondaire, CHERCHÉ mais moins fort qu'un titre — l'extrait d'une
   *  page trouvée par son contenu (MIN-276). Le moteur classe un match de titre
   *  au-dessus ; c'est ce qui fait passer « trouvée par son titre » devant
   *  « citée dans un corps » sans tri explicite. */
  description?: string;
  /** Right-aligned trailing content — identifier badge or project chip. */
  meta?: ReactNode;
  /** Plain-text version of `meta` (identifier, project name) — the desktop
   *  command palette renders it as a dim context label next to the title. */
  metaText?: string;
  /** Entity type for the palette's contextual-action routing (e.g. "issue"). */
  entityType?: string;
  /** Project this row belongs to. The desktop palette boosts rows whose
   *  `contextId` matches the project the user is currently in, so "search
   *  everywhere" (MIN-91) still ranks the project at hand first. Also what the
   *  mobile cap keys on. Ignored by the mobile search. */
  contextId?: string;
  /** Raw entity (e.g. the Issue) — lets the palette derive status icons and wire
   *  mutations (⌘; actions) without re-querying. Ignored by the mobile search. */
  data?: unknown;
  onSelect?: () => void;
}

export interface PaletteGroup {
  key?: string;
  heading?: string;
  items: PaletteItem[];
}

/**
 * Header search affordance: a pill-shaped button that opens the command palette
 * (command-palette.tsx). The palette owns the global shortcuts (⌘K / ⌘P / F);
 * this pill is just the pointer entry point in the desktop header.
 */
export function HeaderSearchPill({ onOpen }: { onOpen: () => void }) {
  const t = useTranslations("Nav");
  // La pill ANNONCE le raccourci : elle doit donc dire celui qu'on a sous les
  // doigts. Le cheat sheet et le pied de la palette résolvent déjà « mod » à la
  // plateforme ; celle-ci était la dernière à afficher ⌘ en dur, y compris à qui
  // n'a pas de touche ⌘.
  const mod = useModKey();
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={t("searchPlaceholder")}
      className="flex h-8 items-center gap-1.5 rounded-full border border-border bg-card px-3 text-[0.8rem] font-medium text-muted-foreground shadow-none transition-[border-color,box-shadow] hover:border-primary/40 focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
    >
      <Search className="size-4 shrink-0" strokeWidth={2} />
      <span className="hidden text-left sm:inline-block">
        {t("searchPlaceholder")}
      </span>
      {/* Deux touches, deux `Kbd` — comme le cheat sheet, et comme le clavier :
          « ⌘K » dans une seule pastille se lisait comme une touche unique. */}
      <span className="ml-1 hidden items-center gap-0.5 opacity-60 sm:inline-flex">
        <Kbd>{mod}</Kbd>
        <Kbd>K</Kbd>
      </span>
    </button>
  );
}
