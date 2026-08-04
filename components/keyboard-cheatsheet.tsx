"use client";

// Keyboard-shortcuts cheat sheet. Opened by `?` (global) or from the command
// palette ("Keyboard shortcuts"). Renders the shared registry in lib/keyboard.

import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "mangue-ui";
import { KbdSequence } from "@/components/ui/kbd";
import { useCheatsheet } from "@/lib/keyboard/keyboard-context";
import { CHEATSHEET, resolveKeyToken } from "@/lib/keyboard/shortcuts";

export function KeyboardCheatsheet() {
  const { open, setOpen } = useCheatsheet();
  const tk = useTranslations("Keyboard");
  const tSection = useTranslations("Keyboard.sections");
  const tShortcut = useTranslations("Keyboard.shortcuts");

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{tk("shortcutsTitle")}</DialogTitle>
          <DialogDescription>{tk("shortcutsDescription")}</DialogDescription>
        </DialogHeader>

        <div className="-mr-2 flex max-h-[65vh] flex-col gap-5 overflow-y-auto pr-2">
          {CHEATSHEET.map((section) => (
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
        </div>
      </DialogContent>
    </Dialog>
  );
}
