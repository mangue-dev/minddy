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
 * « Nouveautés » — la page publique `/changelog`, lue sans quitter l'app.
 *
 * Même contenu, même composant de liste : ce qui est écrit une fois dans
 * `lib/changelog.ts` et le namespace `Changelog` s'affiche aux deux endroits.
 * Le modal reprend la taille du carnet de notes et du wizard de création de
 * projet — c'est la fenêtre de l'app, il n'y en a qu'une.
 *
 * Rien à charger : les entrées sont dans le bundle, comme le reste du
 * catalogue. Le modal s'ouvre plein, sans état de chargement.
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

  // Fondu doux aux bords du défilement, comme le carnet et les colonnes du
  // board : la liste continue au-delà du bord, et ça se voit.
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

        {/* Pas d'infobulle sur cette croix, contrairement au carnet : elle reçoit
            le focus initial du dialog, donc l'infobulle s'ouvrirait d'elle-même
            par-dessus le titre — et avalerait le premier Échap. */}
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
