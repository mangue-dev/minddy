"use client";

import dynamic from "next/dynamic";
import { useEffect } from "react";
import { afterFirstContentIdle } from "@/lib/first-content";
import { preloadSurface } from "@/lib/lazy-app-surfaces";
import { attachmentFileUrl, attachmentPreviewUrl } from "@/lib/resource-links";
import { closeResourcePreview, useResourcePreview } from "@/lib/resource-preview";

// The reader renders Markdown and highlighted code: its code loads after the
// page's first content, not with the shell (MIN-880).
const loadFileViewer = () => import("@/components/file-viewer");
const FileViewer = dynamic(() => loadFileViewer().then((m) => m.FileViewer), { ssr: false });

/**
 * The file reader opened by a resource mention (MIN-742), mounted once for
 * the whole app: the same reader as a resource card, without its rename and
 * remove actions, which belong to the surface that holds the file.
 */
export function ResourcePreviewHost() {
  const resource = useResourcePreview();
  useEffect(() => afterFirstContentIdle(() => preloadSurface(loadFileViewer), 5_000, 2_500), []);
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
