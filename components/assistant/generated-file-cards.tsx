"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { Copy01Icon, Download01Icon, ViewIcon } from "@hugeicons/core-free-icons";
import { useState, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { SplitButton } from "@/components/ui/split-button";
import { TruncatedText } from "@/components/ui/truncated-text";
import { FileViewer } from "@/components/file-viewer";
import { ResourceTile, tileExtension } from "@/components/resource-card";
import { ResourceTypeIcon } from "@/components/resource-type-icon";
import { attachmentPreviewKind } from "@/lib/attachment-preview";
import { formatFileSize } from "@/lib/page-files";
import {
  generatedFileFromResult,
  generatedFileUrl,
  type GeneratedFile,
} from "@/lib/generated-files";

/** The files a turn's successful `create_file` calls wrote, in call order. */
export function generatedFilesOf(
  calls: { id: string; function: { name: string } }[],
  results: ReadonlyMap<string, { status: string; result?: unknown; success?: boolean }>,
): GeneratedFile[] {
  const files: GeneratedFile[] = [];
  for (const call of calls) {
    if (call.function.name !== "create_file") continue;
    const entry = results.get(call.id);
    if (entry?.status !== "complete" || entry.success === false) continue;
    const file = generatedFileFromResult(entry.result);
    if (file) files.push(file);
  }
  return files;
}

function startDownload(href: string) {
  // The door answers with an attachment disposition: the page stays put.
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.rel = "noopener";
  anchor.click();
}

function GeneratedFileCard({ file }: { file: GeneratedFile }) {
  const t = useTranslations("Resources");
  const locale = useLocale();
  const [previewing, setPreviewing] = useState(false);
  const downloadHref = generatedFileUrl(file, "download");
  const previewable = attachmentPreviewKind(file.mime_type, file.file_name) !== null;
  const copyable = file.format !== "pdf";
  const extension = tileExtension(file.file_name);

  const copyContents = async () => {
    try {
      const response = await fetch(downloadHref);
      if (!response.ok) throw new Error(String(response.status));
      const text = (await response.text()).replace(/^\ufeff/, "");
      await navigator.clipboard.writeText(text);
      toast.success(t("contentsCopied"));
    } catch {
      toast.error(t("copyContentsFailed"));
    }
  };

  const detail = [extension?.toUpperCase(), formatFileSize(file.size_bytes, locale)]
    .filter(Boolean)
    .join(" · ");
  const body = (line: ReactNode) => (
    <>
      <span className="h-14 shrink-0">
        <ResourceTile
          icon={<ResourceTypeIcon mime={file.mime_type} name={file.file_name} className="size-5" />}
          label={extension}
        />
      </span>
      <span className="min-w-0 flex-1">
        <TruncatedText
          text={file.file_name}
          className="block truncate text-sm font-medium text-foreground"
        />
        <span className="block truncate text-xs text-muted-foreground">{line}</span>
      </span>
    </>
  );

  const label = (
    <>
      <HugeiconsIcon icon={Download01Icon} />
      <span className="max-sm:sr-only">{t("download")}</span>
    </>
  );

  return (
    <div className="flex w-full min-w-0 items-center gap-3 rounded-xl border border-border bg-card p-2 pr-3">
      {previewable ? (
        // The rest of the card opens the preview; hovering it says so in
        // place of the type and size (MIN-793).
        <button
          type="button"
          onClick={() => setPreviewing(true)}
          aria-label={`${t("openPreview")}: ${file.file_name}`}
          aria-haspopup="dialog"
          className="group/preview flex min-w-0 flex-1 items-center gap-3 rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {body(
            <>
              <span className="group-hover/preview:hidden group-focus-visible/preview:hidden">{detail}</span>
              <span className="hidden text-foreground group-hover/preview:inline group-focus-visible/preview:inline">
                {t("openPreview")}
              </span>
            </>,
          )}
        </button>
      ) : (
        <div className="flex min-w-0 flex-1 items-center gap-3">{body(detail)}</div>
      )}
      {previewable || copyable ? (
        <SplitButton
          variant="outline"
          size="sm"
          menuLabel={t("downloadOptions")}
          onClick={() => startDownload(downloadHref)}
          menu={
            <>
              {previewable && (
                <DropdownMenuItem onSelect={() => setPreviewing(true)}>
                  <HugeiconsIcon icon={ViewIcon} />
                  {t("preview")}
                </DropdownMenuItem>
              )}
              {copyable && (
                <DropdownMenuItem onSelect={() => void copyContents()}>
                  <HugeiconsIcon icon={Copy01Icon} />
                  {t("copyContents")}
                </DropdownMenuItem>
              )}
            </>
          }
        >
          {label}
        </SplitButton>
      ) : (
        <Button variant="outline" size="sm" onClick={() => startDownload(downloadHref)}>
          {label}
        </Button>
      )}
      {previewing && (
        <FileViewer
          src={generatedFileUrl(file, "preview")}
          downloadHref={downloadHref}
          fileName={file.file_name}
          mimeType={file.mime_type}
          open
          onOpenChange={(open) => { if (!open) setPreviewing(false); }}
        />
      )}
    </div>
  );
}

/**
 * The files Numo wrote during a turn (MIN-793), under its answer: one card
 * each, with the download first and the other options in its menu.
 */
export function GeneratedFileCards({ files }: { files: GeneratedFile[] }) {
  const t = useTranslations("Resources");
  if (files.length === 0) return null;
  return (
    <ul aria-label={t("numoFiles")} className="flex w-full flex-col gap-2">
      {files.map((file) => (
        <li key={file.attachment_id}>
          <GeneratedFileCard file={file} />
        </li>
      ))}
    </ul>
  );
}
