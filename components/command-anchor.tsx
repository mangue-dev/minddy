"use client";

// A searchable cmdk popover anchored at an arbitrary viewport position (the
// mouse pointer) instead of a trigger element. Used by the keyboard field
// shortcuts (issue-field-shortcuts.tsx) and the relation target picker
// (relation-target-picker.tsx). Thin wrapper over the shared SearchMenu shell
// in position-anchored mode, so it looks identical to every other searchable
// dropdown in the app.

import { SearchMenu } from "@/components/search-menu";

export function CommandAnchor({
  position,
  onClose,
  children,
  className,
  searchValue,
  onSearchValueChange,
  hideEmpty,
}: {
  /** Viewport coordinates to anchor to; null = closed (renders nothing). */
  position: { x: number; y: number } | null;
  onClose: () => void;
  children: React.ReactNode;
  /** Overrides the default popover width (w-60). */
  className?: string;
  /** Texte de recherche contrôlé — les menus qui portent une ligne de création
   *  le lisent pour en faire le nom de ce qu'ils créent. */
  searchValue?: string;
  onSearchValueChange?: (value: string) => void;
  hideEmpty?: boolean;
}) {
  return (
    <SearchMenu
      open={!!position}
      onOpenChange={(open) => !open && onClose()}
      position={position}
      contentClassName={className}
      searchValue={searchValue}
      onSearchValueChange={onSearchValueChange}
      hideEmpty={hideEmpty}
      stopPropagation
    >
      {children}
    </SearchMenu>
  );
}
