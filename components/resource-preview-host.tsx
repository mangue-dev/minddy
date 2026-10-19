"use client";

import { FileViewer } from "@/components/file-viewer";
import { attachmentFileUrl, attachmentPreviewUrl } from "@/lib/resource-links";
import { closeResourcePreview, useResourcePreview } from "@/lib/resource-preview";

/**
 * The file reader opened by a resource mention (MIN-742), mounted once for
 * the whole app: the same reader as a resource card, without its rename and
 * remove actions, which belong to the surface that holds the file.
 */
export function ResourcePreviewHost() {
  const resource = useResourcePreview();
  if (!resource) return null;
  return (
    <FileViewer
      key={resource.storage_path}
      src={attachmentPreviewUrl(resource.storage_path)}
      downloadHref={attachmentFileUrl(resource.storage_path, true)}
      fileName={resource.file_name}
      mimeType={resource.mime_type}
      open
      onOpenChange={(open) => {
        if (!open) closeResourcePreview();
      }}
    />
  );
}
