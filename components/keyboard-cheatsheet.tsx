"use client";

// Keyboard-shortcuts cheat sheet, docked as a side panel like the issue panel.
// Opened by `?` (global) or from the command palette ("Keyboard shortcuts").
// Renders the shared registry in lib/keyboard.

import { HugeiconsIcon } from "@hugeicons/react";
import { Search01Icon } from "@hugeicons/core-free-icons";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import {
  Input,
} from "mangue-ui";
import { SidePanel, SidePanelBody, SidePanelContent, SidePanelDescription, SidePanelHeader, SidePanelTitle } from "@/components/ui/side-panel";
import { KbdSequence } from "@/components/ui/kbd";
import { useCheatsheet } from "@/lib/keyboard/keyboard-context";
import { allowInputAutoFocus } from "@/lib/mobile-sheet-focus";
import { filterCheatsheet } from "@/lib/keyboard/filter-cheatsheet";
import { CHEATSHEET, resolveKeyToken } from "@/lib/keyboard/shortcuts";

export function KeyboardCheatsheet() {
  const { open, setOpen } = useCheatsheet();
  const tk = useTranslations("Keyboard");
  const tSection = useTranslations("Keyboard.sections");
  const tShortcut = useTranslations("Keyboard.shortcuts");
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const filteredCheatsheet = filterCheatsheet(CHEATSHEET, query, {
    sectionTitle: tSection,
    shortcutLabel: tShortcut,
  });

  return (
    <SidePanel open={open} onOpenChange={setOpen}>
      <SidePanelContent
        side="right"
        // Typing filters right away on desktop; on mobile the keyboard stays shut.
        onOpenAutoFocus={() => {
          if (allowInputAutoFocus()) searchRef.current?.focus({ preventScroll: true });
        }}
      >
        <SidePanelHeader>
          <SidePanelTitle>{tk("shortcutsTitle")}</SidePanelTitle>
          <SidePanelDescription>{tk("shortcutsDescription")}</SidePanelDescription>
        </SidePanelHeader>

        <div className="relative shrink-0 px-6 pt-4 pb-2">
          <HugeiconsIcon icon={Search01Icon} className="pointer-events-none absolute left-9 top-[calc(50%+0.25rem)] size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={searchRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={tk("searchPlaceholder")}
            aria-label={tk("searchLabel")}
            className="pl-9"
          />
        </div>

        <SidePanelBody className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-6 pt-2 pb-6">
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
        </SidePanelBody>
      </SidePanelContent>
    </SidePanel>
  );
}
