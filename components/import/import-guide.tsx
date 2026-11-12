"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowDown01Icon, Copy01Icon, LinkSquare01Icon } from "@hugeicons/core-free-icons";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { IMPORT_GUIDES, type ImportGuide } from "@/lib/import-guides";
import { useModShortcut } from "@/lib/keyboard/use-mod-shortcut";
import { ImportSourceLogo } from "@/components/import-source-logo";

/**
 * The procedure to follow on the side of the tool you leave (MIN-98): the selector
 * tool, its three lines, the command to copy when it has no export, the
 * link to its documentation.
 *
 * Separated from the dropzone because the two do not always go together: the
 * settings and onboarding show the procedure THEN the repository+mapping
 * (`import-panel.tsx`), the creation wizard only collects one file — the
 * project does not exist yet, there is nothing to map. Without this separation,
 * the import step of the wizard only had one drop zone: we asked for a
 * CSV without ever saying where to find it.
 *
 * The labels keep the i18n namespace `Onboarding` where they were born, like
 * `CsvImportPanel` keeps `Settings` — `lib/import-guides.ts` documents this
 * emplacement.
 */
export function ImportGuideBlock({
  className,
  foldSteps = false,
  onProviderSelected,
}: {
  className?: string;
  /**
   * The procedure folds under "How to export from …" (the creation wizard,
   * MIN-907): the tool and the file come first, the steps on request.
   */
  foldSteps?: boolean;
  /** Which tool does the account come from — onboarding makes it an event. */
  onProviderSelected?: (guide: ImportGuide) => void;
}) {
  const t = useTranslations("Onboarding");
  const tc = useTranslations("Common");
  // Linear and minddy both open their export with the keyboard: the sentence must
  // say ⌘K to someone who has a Mac and Ctrl+K to someone who doesn't.
  const shortcut = useModShortcut("K");

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

  const procedureContent = (
    <>
      {/* All three lines ALL receive `shortcut`, even those that don't.
 are not useful: it is the same key assembled at runtime, and next-intl
 ignores one value too many — whereas a missing value would display
 the path of the key on the screen. */}
      <ol className="ml-4 flex list-decimal flex-col gap-1 text-sm text-muted-foreground marker:text-muted-foreground/70">
        <li>{t(`importGuide_${guide.id}_1`, { shortcut })}</li>
        <li>{t(`importGuide_${guide.id}_2`, { shortcut })}</li>
        <li>{t(`importGuide_${guide.id}_3`, { shortcut })}</li>
      </ol>

      {guide.command && (
        <div className="flex min-w-0 flex-col items-start gap-2">
          {/* `w-full min-w-0`: `whitespace-pre` would otherwise impose on the block the
 width of the entire command and expand its container. */}
          <code className="max-h-40 w-full min-w-0 overflow-auto whitespace-pre rounded-md border border-border bg-background px-3 py-2 font-mono text-xs">
            {guide.command}
          </code>
          <Button type="button" size="sm" onClick={() => void copyCommand()}>
            <HugeiconsIcon icon={Copy01Icon} />
            {t("importCopyCommand")}
          </Button>
        </div>
      )}

      {/* minddy has no link: her instructions take place in the app,
 returning “elsewhere” would have nothing more to show. */}
      {guide.docUrl && (
        <a
          href={guide.docUrl}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1 self-start text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
        >
          {t("importGuideDoc", { name: guide.label })}
          <HugeiconsIcon icon={LinkSquare01Icon} className="size-3" aria-hidden />
        </a>
      )}
    </>
  );

  return (
    <div className={cn("flex min-w-0 flex-col gap-3", className)}>
      {/* One select rather than a row of tabs (MIN-907): it reads the same
          on a phone, and the procedure under it is the only thing that
          changes. */}
      <Select
        value={guide.id}
        onValueChange={(id) => {
          const next = IMPORT_GUIDES.find((item) => item.id === id);
          if (next) selectGuide(next);
        }}
      >
        <SelectTrigger aria-label={t("importProviderPicker")} className="h-11 w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {IMPORT_GUIDES.map((item) => (
            <SelectItem key={item.id} value={item.id}>
              <span className="flex items-center gap-2">
                <ImportSourceLogo source={item.id} className="size-4" />
                {item.label}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {foldSteps ? (
        <Collapsible className="min-w-0">
          <CollapsibleTrigger className="group flex w-full items-center justify-between gap-2 rounded-lg py-1 text-sm font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
            {t("importHowTo", { name: guide.label })}
            <HugeiconsIcon icon={ArrowDown01Icon} className="size-4 transition-transform group-data-[state=open]:rotate-180" aria-hidden />
          </CollapsibleTrigger>
          <CollapsibleContent className="flex min-w-0 flex-col gap-3 pt-2">{procedureContent}</CollapsibleContent>
        </Collapsible>
      ) : (
        procedureContent
      )}
    </div>
  );
}
