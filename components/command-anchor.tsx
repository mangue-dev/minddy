"use client";

// A cmdk <Command> popover anchored at an arbitrary viewport position (the mouse
// pointer), instead of a trigger element. Shared shell for the right-click issue
// menu (issue-context-menu.tsx) and the keyboard field shortcuts
// (issue-field-shortcuts.tsx). Same look as the search-select.tsx pickers.

import * as React from "react";
import { useTranslations } from "next-intl";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandList,
  Popover,
  PopoverAnchor,
  PopoverContent,
  cn,
} from "mangue-ui";

export function CommandAnchor({
  position,
  onClose,
  children,
  className,
}: {
  /** Viewport coordinates to anchor to; null = closed (renders nothing). */
  position: { x: number; y: number } | null;
  onClose: () => void;
  children: React.ReactNode;
  /** Overrides the default popover width (w-60). */
  className?: string;
}) {
  const t = useTranslations("Picker");
  if (!position) return null;

  return (
    <Popover open onOpenChange={(open) => !open && onClose()}>
      <PopoverAnchor asChild>
        <span
          aria-hidden
          style={{ position: "fixed", left: position.x, top: position.y }}
        />
      </PopoverAnchor>
      <PopoverContent
        align="start"
        side="bottom"
        className={cn("w-60 overflow-hidden p-0", className)}
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {/* Same radius fix as PickerShell (search-select.tsx): the input rounds
            to rounded-sm to match the options below it. */}
        <Command className="[&_[data-slot=input-group]]:rounded-sm!">
          <CommandInput autoFocus placeholder={t("search")} />
          <CommandList>
            <CommandEmpty>{t("noResults")}</CommandEmpty>
            {children}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
