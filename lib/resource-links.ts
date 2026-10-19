// Where a resource leads and what it is called (MIN-742): pure helpers shared
// by the resource chips (components/resources.tsx) and resource mentions
// (lib/use-resource-mentions.ts).

/** The address of a page in the app — the same as that of the wiki tree. */
export function pageResourceHref(projectId: string, pageId: string): string {
  return `/projects/${projectId}/pages/${pageId}`;
}

/** The same-origin proxy for the private attachment bucket. */
export function attachmentFileUrl(storagePath: string, download = false): string {
  const qs = new URLSearchParams({ path: storagePath });
  if (download) qs.set("download", "1");
  return `/api/attachments/file?${qs.toString()}`;
}

/** Authenticated same-origin response used only inside the sandboxed viewer. */
export function attachmentPreviewUrl(storagePath: string): string {
  const qs = new URLSearchParams({ path: storagePath, preview: "1" });
  return `/api/attachments/file?${qs.toString()}`;
}

/** The name a chip shows: a page's live title, else the resource's own. */
export function resourceDisplayName(resource: {
  kind?: string | null;
  file_name: string;
  page?: { title?: string | null } | null;
}): string {
  return resource.kind === "page"
    ? resource.page?.title?.trim() || resource.file_name
    : resource.file_name;
}
