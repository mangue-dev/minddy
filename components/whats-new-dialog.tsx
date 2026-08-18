"use client";

import { useLocale, useTranslations } from "next-intl";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "mangue-ui";
import { X } from "lucide-react";
import type { Locale } from "@/i18n/config";
import type { MessageKey } from "@/lib/i18n-keys";
import { CHANGELOG_ENTRIES } from "@/lib/changelog";
import { ChangelogEntries } from "@/components/changelog-entries";
import { useScrollFade } from "@/lib/use-scroll-fade";

/**
 * "What's new" — the public page `/changelog`, read without leaving the app.
 *
 * Same content, same list component: what is written once in
 * `lib/changelog.ts` and the namespace `Changelog` is displayed in both places.
 * The modal takes the size of the notebook and the creation wizard of
 * project — it's the app window, there is only one.
 *
 * Nothing to load: the entries are in the bundle, like the rest of the
 * catalog. The modal opens full, with no loading state.
 */
export function WhatsNewDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("Changelog");
  const tc = useTranslations("Common");
  const locale = useLocale() as Locale;

  // Soft fade at the edges of the scroll, like the notebook and columns of the
  // board: the list continues beyond the edge, and it shows.
  const { ref: fadeRef, scrollProps } = useScrollFade<HTMLDivElement>();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="flex h-[var(--spacing-dialog-h)] max-h-[calc(100dvh-2rem)] max-w-[calc(100%-2rem)] flex-col overflow-hidden p-0 !rounded-2xl sm:max-h-[var(--spacing-dialog-h)] sm:max-w-[var(--spacing-dialog-w)]"
      >
        <DialogDescription className="sr-only">
          {t("metaDescription")}
        </DialogDescription>

        {/* No tooltip on this cross, unlike the notebook: it receives
 the initial focus of the dialog, so the tooltip would open by itself
 over the title — and would swallow the first Esc. */}
        <div className="absolute top-3.5 right-3.5 z-30">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={tc("close")}
            onClick={() => onOpenChange(false)}
            className="rounded-full text-muted-foreground hover:text-foreground"
          >
            <X className="size-4" />
          </Button>
        </div>

        <div
          ref={fadeRef}
          {...scrollProps}
          className="flex flex-1 flex-col overflow-y-auto px-6 pt-14 pb-12 sm:pt-20"
        >
          <div className="mx-auto w-full max-w-2xl">
            <DialogTitle className="mb-10 text-3xl leading-[1.05] font-semibold tracking-tighter text-balance">
              {t("heroTitle")}
            </DialogTitle>
            <ChangelogEntries
              locale={locale}
              entries={CHANGELOG_ENTRIES.map((entry) => ({
                ...entry,
                title: t(`entry_${entry.id}_title` as MessageKey<"Changelog">),
                body: t(`entry_${entry.id}_body` as MessageKey<"Changelog">),
              }))}
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
