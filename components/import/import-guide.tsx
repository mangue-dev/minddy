"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button, cn, toast } from "mangue-ui";
import { Copy, ExternalLink } from "lucide-react";
import { IMPORT_GUIDES, type ImportGuide } from "@/lib/import-guides";
import { useModShortcut } from "@/lib/keyboard/use-mod-shortcut";
import { BrandLogo } from "@/components/brand-logo";

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
  onProviderSelected,
}: {
  className?: string;
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

  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-3 rounded-lg border border-border bg-muted/40 p-3",
        className
      )}
    >
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
            <Copy />
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
          <ExternalLink className="size-3" aria-hidden />
        </a>
      )}
    </div>
  );
}
