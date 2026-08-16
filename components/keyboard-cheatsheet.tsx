"use client";

// Keyboard-shortcuts cheat sheet. Opened by `?` (global) or from the command
// palette ("Keyboard shortcuts"). Renders the shared registry in lib/keyboard.

import { useTranslations } from "next-intl";
import { useState } from "react";
import { Search } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Input,
} from "mangue-ui";
import { KbdSequence } from "@/components/ui/kbd";
import { useCheatsheet } from "@/lib/keyboard/keyboard-context";
import { filterCheatsheet } from "@/lib/keyboard/filter-cheatsheet";
import { CHEATSHEET, resolveKeyToken } from "@/lib/keyboard/shortcuts";

export function KeyboardCheatsheet() {
  const { open, setOpen } = useCheatsheet();
  const tk = useTranslations("Keyboard");
  const tSection = useTranslations("Keyboard.sections");
  const tShortcut = useTranslations("Keyboard.shortcuts");
  const [query, setQuery] = useState("");
  const filteredCheatsheet = filterCheatsheet(CHEATSHEET, query, {
    sectionTitle: tSection,
    shortcutLabel: tShortcut,
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{tk("shortcutsTitle")}</DialogTitle>
          <DialogDescription>{tk("shortcutsDescription")}</DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={tk("searchPlaceholder")}
            aria-label={tk("searchLabel")}
            className="pl-9"
          />
        </div>

        <div className="-mr-2 flex max-h-[65vh] flex-col gap-5 overflow-y-auto pr-2">
          {filteredCheatsheet.map((section) => (
            <section key={section.id}>
              <h3 className="mb-1 text-xs font-medium text-muted-foreground">
                {tSection(section.titleKey)}
              </h3>
              <ul className="flex flex-col">
                {section.shortcuts.map((sc) => (
                  <li
                    key={sc.id}
                    className="flex items-center justify-between gap-4 py-1.5"
                  >
                    <span className="text-sm">{tShortcut(sc.labelKey)}</span>
                    <span className="flex items-center gap-1.5">
                      <KbdSequence
                        keys={sc.keys.map((step) => step.map(resolveKeyToken))}
                        size="sm"
                        separator={tk("then")}
                      />
                      {sc.altKeys && (
                        <>
                          <span className="text-xs text-muted-foreground">/</span>
                          <KbdSequence
                            keys={sc.altKeys.map((step) =>
                              step.map(resolveKeyToken)
                            )}
                            size="sm"
                            separator={tk("then")}
                          />
                        </>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
          {filteredCheatsheet.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {tk("noSearchResults")}
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
