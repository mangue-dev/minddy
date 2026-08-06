"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "mangue-ui";
import { getSupabase } from "@/lib/supabase";
import { compressImage } from "@/lib/image-compress";
import type { LinkResourceInput, ResourceInput, ResourceKind } from "@/lib/types";
import { trackEvent } from "./analytics";
import { sizeBucket } from "./analytics-sanitize";

/** Server-checked too (parseResourcesInput) — keep the two in sync. */
export const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024; // 20 MB
/** Files and links confounded — a resource is a resource (MIN-184). */
export const MAX_ATTACHMENTS = 10;

/** One entry of a composer's queue, file or link, in flight or landed. */
export interface PendingResource {
  localId: string;
  status: "uploading" | "done";
  kind: ResourceKind;
  file_name: string;
  /** File half; empty string while the upload is in flight. */
  storage_path: string;
  mime_type: string;
  size_bytes: number;
  /** Link half. */
  url?: string;
  icon_data_url?: string | null;
}

/** Re-encoding a gif kills the animation, an svg its vectors — upload as-is. */
function isCompressible(type: string): boolean {
  return (
    type.startsWith("image/") && type !== "image/gif" && type !== "image/svg+xml"
  );
}

/** Storage keys reject most exotic characters; the display name keeps them. */
function sanitizeKeyPart(name: string): string {
  const sanitized = name.replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/^_+|_+$/g, "");
  return (sanitized || "fichier").slice(-140);
}

/** Align the display name's extension with the re-encoded blob (png → webp). */
function renameForType(name: string, type: string): string {
  const ext = type === "image/webp" ? "webp" : type === "image/jpeg" ? "jpg" : null;
  if (!ext) return name;
  const base = name.replace(/\.[a-zA-Z0-9]+$/, "");
  return `${base}.${ext}`;
}

/** `projects/{uuid}` — the only prefix family a link can hang from (a link is
    resolved by a project-scoped route; the `chat/` family has no project). */
const PROJECT_PREFIX_RE = /^projects\/([0-9a-fA-F-]{36})$/;

/**
 * Shared queue for every resource composer (comments, issue panel, create
 * dialog, Numo shell). The two halves are deliberately symmetric:
 *
 *  - a FILE goes DIRECTLY from the browser to the private `attachments` bucket
 *    (storage RLS gates the path prefix), then its descriptor lands here;
 *  - a LINK goes to `/api/projects/{id}/link-preview`, which resolves its title
 *    and favicon, then its descriptor lands here the same way.
 *
 * Either way the DB rows are created server-side from `inputs` — at submit time
 * for composers, right away for surfaces that pass `onUploaded`. Abandoned
 * uploads are tolerated orphans.
 *
 * `getPrefix` returns the path family, e.g. `projects/${projectId}` or
 * `chat/${userId}` — the latter has no project, so it takes files only.
 */
export function useAttachmentUploads(
  getPrefix: () => string,
  {
    max = MAX_ATTACHMENTS,
    onUploaded,
  }: {
    max?: number;
    /** Fired as each resource lands — for surfaces that register rows
        immediately (issue panel) instead of at submit time (composers). */
    onUploaded?: (input: ResourceInput, localId: string) => void;
  } = {}
) {
  const t = useTranslations("Resources");
  const [pending, setPending] = useState<PendingResource[]>([]);
  // addFiles is called from paste/drop handlers whose closures can be stale.
  const pendingRef = useRef(pending);
  pendingRef.current = pending;
  const onUploadedRef = useRef(onUploaded);
  onUploadedRef.current = onUploaded;

  const addFiles = useCallback(
    (files: Iterable<File>) => {
      const list = Array.from(files);
      if (list.length === 0) return;
      const prefix = getPrefix().replace(/\/+$/, "");

      let slots = max - pendingRef.current.length;
      for (const file of list) {
        if (slots <= 0) {
          toast.error(t("tooMany", { max }));
          break;
        }
        if (file.size > MAX_ATTACHMENT_BYTES) {
          toast.error(t("tooLarge", { name: file.name, max: 20 }));
          continue;
        }
        slots -= 1;

        const localId = crypto.randomUUID();
        const entry: PendingResource = {
          localId,
          status: "uploading",
          kind: "file",
          storage_path: "",
          file_name: file.name || "fichier",
          mime_type: file.type || "application/octet-stream",
          size_bytes: file.size,
        };
        setPending((prev) => [...prev, entry]);

        void (async () => {
          try {
            const blob = isCompressible(entry.mime_type)
              ? await compressImage(file, { maxDim: 2048, maxBytes: 2.5 * 1024 * 1024 })
              : file;
            const mime = blob.type || entry.mime_type;
            const fileName =
              blob !== file ? renameForType(entry.file_name, mime) : entry.file_name;
            const path = `${prefix}/${localId}/${sanitizeKeyPart(fileName)}`;

            const { error } = await getSupabase()
              .storage.from("attachments")
              .upload(path, blob, { contentType: mime });
            if (error) throw error;

            setPending((prev) =>
              prev.map((p) =>
                p.localId === localId
                  ? {
                      ...p,
                      status: "done",
                      storage_path: path,
                      file_name: fileName,
                      mime_type: mime,
                      size_bytes: blob.size,
                    }
                  : p
              )
            );
            // Métadonnées seulement : ni le nom du fichier ni son contenu —
            // le type MIME générique et la tranche de taille suffisent à savoir
            // ce que les gens joignent (captures d'écran ? logs ? PDF ?).
            trackEvent("resource_added", {
              target: "issue",
              kind: "file",
              size_bucket: sizeBucket(blob.size),
              mime_kind: mime.split("/")[0] || "unknown",
              compressed: blob !== file,
            });
            onUploadedRef.current?.(
              {
                storage_path: path,
                file_name: fileName,
                mime_type: mime,
                size_bytes: blob.size,
              },
              localId
            );
          } catch {
            toast.error(t("uploadFailed", { name: entry.file_name }));
            setPending((prev) => prev.filter((p) => p.localId !== localId));
          }
        })();
      }
    },
    [getPrefix, max, t]
  );

  /**
   * Le geste « lien », symétrique de l'envoi d'un fichier : une entrée en vol
   * (le badge sait déjà afficher un spinner), la résolution côté serveur, puis
   * la même bascule en `done` et le même `onUploaded`.
   *
   * Lève plutôt que de toaster : c'est le dialog qui affiche l'erreur, dans le
   * champ où l'URL vient d'être saisie — un toast l'enverrait ailleurs.
   */
  const addLink = useCallback(
    async (url: string) => {
      const projectId = PROJECT_PREFIX_RE.exec(getPrefix().replace(/\/+$/, ""))?.[1];
      if (!projectId) throw new Error(t("linkFailed"));
      if (pendingRef.current.length >= max) throw new Error(t("tooMany", { max }));

      const localId = crypto.randomUUID();
      setPending((prev) => [
        ...prev,
        {
          localId,
          status: "uploading",
          kind: "link",
          storage_path: "",
          file_name: hostnameOf(url),
          mime_type: "text/uri-list",
          size_bytes: 0,
          url,
        },
      ]);

      try {
        const response = await fetch(`/api/projects/${projectId}/link-preview`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url }),
        });
        const data = (await response.json().catch(() => null)) as
          | (LinkResourceInput & { error?: string })
          | null;
        if (!response.ok || !data?.url) {
          throw new Error(data?.error || t("linkFailed"));
        }

        setPending((prev) =>
          prev.map((p) =>
            p.localId === localId
              ? {
                  ...p,
                  status: "done" as const,
                  url: data.url,
                  file_name: data.file_name,
                  icon_data_url: data.icon_data_url ?? null,
                }
              : p
          )
        );
        // Ni l'URL ni le titre : seulement qu'un lien a été ajouté.
        trackEvent("resource_added", { target: "issue", kind: "link" });
        onUploadedRef.current?.(
          {
            kind: "link",
            url: data.url,
            file_name: data.file_name,
            icon_data_url: data.icon_data_url ?? null,
          },
          localId
        );
      } catch (e) {
        setPending((prev) => prev.filter((p) => p.localId !== localId));
        throw e;
      }
    },
    [getPrefix, max, t]
  );

  // No storage delete policy for users — the dropped object stays orphaned,
  // same policy as an abandoned composer.
  const remove = useCallback((localId: string) => {
    setPending((prev) => prev.filter((p) => p.localId !== localId));
  }, []);

  const clear = useCallback(() => setPending([]), []);

  // Reseed the composer from already-added references (a recovered draft,
  // MIN-41). The storage objects still exist and the links are still resolved —
  // mark each done with a fresh localId so removal keeps working.
  const restore = useCallback((restored: ResourceInput[]) => {
    setPending(
      restored.map((input) =>
        input.kind === "link"
          ? {
              localId: crypto.randomUUID(),
              status: "done" as const,
              kind: "link" as const,
              storage_path: "",
              file_name: input.file_name,
              mime_type: "text/uri-list",
              size_bytes: 0,
              url: input.url,
              icon_data_url: input.icon_data_url ?? null,
            }
          : {
              ...input,
              kind: "file" as const,
              localId: crypto.randomUUID(),
              status: "done" as const,
            }
      )
    );
  }, []);

  const inputs = useMemo<ResourceInput[]>(
    () =>
      pending
        .filter((p) => p.status === "done")
        .map((p) =>
          p.kind === "link"
            ? {
                kind: "link" as const,
                url: p.url as string,
                file_name: p.file_name,
                icon_data_url: p.icon_data_url ?? null,
              }
            : {
                storage_path: p.storage_path,
                file_name: p.file_name,
                mime_type: p.mime_type,
                size_bytes: p.size_bytes,
              }
        ),
    [pending]
  );

  const uploading = pending.some((p) => p.status === "uploading");

  return { pending, addFiles, addLink, remove, clear, restore, inputs, uploading };
}

/** `https://www.linear.app/x` → `linear.app`; the raw string if unparsable
    (the server has the last word on validity anyway). */
function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
