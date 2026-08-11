"use client";

import type { NodeViewRenderer } from "@tiptap/core";
import {
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type NodeViewProps,
} from "@tiptap/react";
import { useLocale, useTranslations } from "next-intl";
import { Download, File as FileIcon, RotateCcw } from "lucide-react";
import { cx } from "@/components/pages/blocks/cx";
import {
  NODE_LINK_CLASS,
  isPlainNavigationClick,
} from "@/components/editor-node-link";
import { formatFileSize } from "@/lib/page-files";
import { usePageUploadsContext } from "@/components/pages/page-uploads";

/**
 * La vue d'un bloc fichier (MIN-280) : une ligne, avec le nom, le poids et le
 * téléchargement. Mêmes quatre états que la vue de l'image, pour la même raison
 * — un envoi qui n'a pas abouti doit se voir et se réessayer, pas laisser un
 * bloc muet dans le document.
 *
 * Le téléchargement est une vraie ancre vers `?download=1` : le ⌘-clic, le clic
 * du milieu et « enregistrer sous » du menu contextuel viennent avec, et aucun
 * `onClick` ne sait les refaire. `editor-node-link` n'est pas décoratif : c'est
 * la marque par laquelle l'éditeur laisse cette ancre tranquille (cf.
 * components/editor-node-link.ts et le `PROSE` de page-editor.tsx).
 */
export function FileView({ node, selected }: NodeViewProps) {
  const t = useTranslations("Pages");
  const locale = useLocale();
  const uploads = usePageUploadsContext();

  const src = (node.attrs.src as string | null) ?? null;
  const uploadId = (node.attrs.uploadId as string | null) ?? null;
  const upload = uploadId ? uploads?.get(uploadId) : undefined;
  const name =
    (node.attrs.name as string | null) || upload?.file.name || t("blockFile");
  const size = (node.attrs.size as number | null) ?? upload?.file.size ?? 0;

  const failed = upload?.status === "failed";
  const abandoned = !src && !upload;
  const weight = formatFileSize(size, locale);

  return (
    <NodeViewWrapper
      as="div"
      className={cx(
        "my-1 flex items-center gap-3 rounded-lg border border-border px-3 py-2 transition-colors",
        src && "hover:bg-muted",
        selected && "bg-muted ring-1 ring-ring"
      )}
      contentEditable={false}
    >
      <FileIcon
        className={cx("size-4 shrink-0 text-muted-foreground", !src && "opacity-60")}
      />

      <span className="min-w-0 flex-1">
        <span
          className={cx(
            "block truncate text-base font-normal",
            src ? "text-foreground" : "text-muted-foreground"
          )}
        >
          {name}
        </span>
        <span className="block truncate text-xs text-muted-foreground">
          {failed
            ? t("uploadFailed", { name })
            : abandoned
              ? t("fileMissing")
              : upload
                ? t("uploadInProgress", { name })
                : weight}
        </span>
      </span>

      {upload?.status === "uploading" && (
        <span className="h-1 w-16 shrink-0 overflow-hidden rounded-full bg-muted">
          <span
            className="block h-full bg-primary transition-[width]"
            style={{ width: `${Math.round((upload.progress || 0) * 100)}%` }}
          />
        </span>
      )}

      {failed && uploadId && (
        <button
          type="button"
          className="flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          onClick={() => uploads?.retry(uploadId)}
        >
          <RotateCcw className="size-3" />
          {t("uploadRetry")}
        </button>
      )}

      {src && (
        <a
          href={`${src}${src.includes("?") ? "&" : "?"}download=1`}
          className={cx(
            NODE_LINK_CLASS,
            "flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium text-muted-foreground no-underline transition-colors hover:bg-muted hover:text-foreground"
          )}
          // `handleNodeLinkClick` a déjà coupé l'extension Link ET le
          // comportement par défaut de l'ancre (components/editor-node-link.ts) :
          // sans ce relais, le clic ordinaire ne ferait plus rien du tout. La
          // réponse porte un `Content-Disposition: attachment`, donc l'affectation
          // télécharge sans quitter la page. Les clics MODIFIÉS, eux, ne sont pas
          // préemptés — le navigateur les sert mieux que nous.
          onClick={(event) => {
            if (!isPlainNavigationClick(event)) return;
            event.preventDefault();
            window.location.href = event.currentTarget.href;
          }}
        >
          <Download className="size-3" />
          {t("fileDownload")}
        </a>
      )}
    </NodeViewWrapper>
  );
}

/** Cf. `imageNodeView` : la vue est injectée par la surface, pas nommée par le
    fichier de bloc — le registre doit rester importable hors navigateur. */
export function fileNodeView(): NodeViewRenderer {
  return ReactNodeViewRenderer(FileView) as unknown as NodeViewRenderer;
}
