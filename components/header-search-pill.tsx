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
  /** Secondary text, SOUGHT-AFTER but less strong than a title — an extract from a
   * page found by its contents (MIN-276). The engine ranks a title match
   * above ; this is what puts “found by its title” in front of
   * “cited in a body” without explicit sorting. */
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
 * (command-palette.tsx). The app shell owns the global shortcuts (⌘K / ⌘P / F)
 * so they work before the deferred palette chunk loads; this pill is the
 * pointer entry point in the desktop header.
 */
export function HeaderSearchPill({ onOpen }: { onOpen: () => void }) {
  const t = useTranslations("Nav");
  // The pill ANNOUNCES the shortcut: it must therefore say the one we have under the
  // fingers. The cheat sheet and the foot of the palette already solve “mod” at the
  // platform ; this was the last one to display ⌘ in hard copy, including to whom
  // has no ⌘ key.
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
      {/* Two keys, two `Kbd` — like the cheat sheet, and like the keyboard:
 “⌘K” in a single dot read like a single key. */}
      <span className="ml-1 hidden items-center gap-0.5 opacity-60 sm:inline-flex">
        <Kbd>{mod}</Kbd>
        <Kbd>K</Kbd>
      </span>
    </button>
  );
}
