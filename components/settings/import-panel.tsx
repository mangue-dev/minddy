"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button, cn, toast } from "mangue-ui";
import { Copy, ExternalLink } from "lucide-react";
import { IMPORT_GUIDES, type ImportGuide } from "@/lib/import-guides";
import type { ImportCommitResponse } from "@/lib/import-api";
import { BrandLogo } from "@/components/brand-logo";
import { CsvImportPanel } from "@/components/settings/csv-import-panel";

/**
 * Faire entrer un backlog existant, en entier (MIN-45, MIN-98) : la marche à
 * suivre du côté de l'outil qu'on quitte, puis le vrai dropzone. Le mapping se
 * voit avant de valider.
 *
 * Le même composant sert les réglages du projet (`project-import-section.tsx`)
 * et le dialog d'import de l'onboarding
 * (`components/home/onboarding-import-dialog.tsx`) : on ne sortait pas de la
 * home pour importer, et il n'y a aucune raison que la marche à suivre soit
 * plus courte une fois installé.
 *
 * Les libellés du guide gardent le namespace i18n `Onboarding` où ils sont nés,
 * comme `CsvImportPanel` garde `Settings` : aucune chaîne ne change de place.
 * `lib/import-guides.ts` documente cet emplacement.
 */
export function ImportPanel({
  projectId,
  className,
  initialFile,
  onProviderSelected,
  onImported,
}: {
  projectId: string;
  className?: string;
  /** CSV déjà tenu par l'appelant (dépôt sur la carte d'onboarding). */
  initialFile?: File | null;
  /** De quel outil vient le compte — l'onboarding en fait un événement. */
  onProviderSelected?: (guide: ImportGuide) => void;
  onImported?: (result: ImportCommitResponse) => void;
}) {
  const t = useTranslations("Onboarding");
  const tc = useTranslations("Common");

  const [guide, setGuide] = useState<ImportGuide>(IMPORT_GUIDES[0]);

  const selectGuide = (next: ImportGuide) => {
    setGuide(next);
    onProviderSelected?.(next);
  };

  const copyCommand = async () => {
    if (!guide.command) return;
    await navigator.clipboard.writeText(guide.command);
    toast.success(tc("copied"));
  };

  return (
    <div className={cn("flex min-w-0 flex-col gap-4", className)}>
      <div className="flex min-w-0 flex-col gap-3 rounded-lg border border-border bg-muted/40 p-3">
        <div
          className="flex flex-wrap gap-1.5"
          role="group"
          aria-label={t("importProviderPicker")}
        >
          {IMPORT_GUIDES.map((item) => {
            const active = item.id === guide.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => selectGuide(item)}
                aria-pressed={active}
                className={cn(
                  "flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-sm font-medium transition-colors",
                  active
                    ? "border-brand/40 bg-brand/10 text-foreground"
                    : "border-border bg-background text-muted-foreground hover:text-foreground"
                )}
              >
                <BrandLogo brand={item} className="size-4 shrink-0" />
                {item.label}
              </button>
            );
          })}
        </div>

        <ol className="ml-4 flex list-decimal flex-col gap-1 text-sm text-muted-foreground marker:text-muted-foreground/70">
          <li>{t(`importGuide_${guide.id}_1`)}</li>
          <li>{t(`importGuide_${guide.id}_2`)}</li>
          <li>{t(`importGuide_${guide.id}_3`)}</li>
        </ol>

        {guide.command && (
          <div className="flex min-w-0 flex-col items-start gap-2">
            {/* `w-full min-w-0` : `whitespace-pre` imposerait sinon au bloc la
                largeur de la commande entière et élargirait son conteneur. */}
            <code className="max-h-40 w-full min-w-0 overflow-auto whitespace-pre rounded-md border border-border bg-background px-3 py-2 font-mono text-xs">
              {guide.command}
            </code>
            <Button type="button" size="sm" onClick={() => void copyCommand()}>
              <Copy />
              {t("importCopyCommand")}
            </Button>
          </div>
        )}

        <a
          href={guide.docUrl}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1 self-start text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
        >
          {t("importGuideDoc", { name: guide.label })}
          <ExternalLink className="size-3" aria-hidden />
        </a>
      </div>

      <CsvImportPanel
        projectId={projectId}
        initialFile={initialFile}
        onImported={onImported}
      />
    </div>
  );
}
