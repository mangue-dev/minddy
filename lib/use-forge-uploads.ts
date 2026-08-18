"use client";

import { useCallback, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "mangue-ui";
import { forgeAttachmentMarkdown } from "@/lib/forge-image-assets";
import { compressImage } from "@/lib/image-compress";
import { MAX_ATTACHMENT_BYTES } from "@/lib/use-attachment-uploads";

/**
 * Attach a file to a pull request comment (MIN-162).
 *
 * Nothing to do with `useAttachmentUploads`, despite the identical gesture: there a
 * file becomes a LINE linked to the comment, here it becomes MARKDOWN
 * IN his body. This is the only form that survives the journey — the comment
 * goes to the forge, which has no idea what a minddy,
 * attachment is and will only display what the text says.
 *
 * Hence the behavior, which is that of github.com: the file inserts at
 * the location of the text, first as a named queue, then replaced
 * with the real link when the hosting responded. We continue writing for
 * this time, and the sending remains blocked as long as a wait drags — post
 * “⏳ capture.png” would not do anyone any favors.
 *
 * The upload goes through the server (`/api/pull-requests/{id}/attachments`), not en
 * direct-to-storage: the destination is a public bucket, and it is the
 * access control to the PR that prevents it from being made an open host.
 */
export function useForgeUploads(
  /** PR base: `/api/pull-requests/{id}` or facade `/api/agent-runs/{id}/pr`. */
  endpoint: string,
  /** The composer applies the transformation to his draft — he is the one who holds the
, and the insertion must respect what has been typed in the meantime. */
  edit: (transform: (draft: string) => string) => void,
) {
  const t = useTranslations("Resources");
  const [uploading, setUploading] = useState(0);
  // `addFiles` is called from paste/repository managers whose
  // closure may be out of date: the reference never is.
  const editRef = useRef(edit);
  editRef.current = edit;

  const addFiles = useCallback(
    (files: Iterable<File>) => {
      for (const file of files) {
        if (file.size > MAX_ATTACHMENT_BYTES) {
          toast.error(t("tooLarge", { name: file.name, max: 20 }));
          continue;
        }
        const name = file.name || "fichier";
        // The queue carries a unique token: two files of the same name
        // filed together should not replace each other.
        const token = crypto.randomUUID().slice(0, 8);
        const placeholder = `![${t("uploadingFile", { name })} ${token}]()`;

        setUploading((n) => n + 1);
        editRef.current((draft) =>
          draft.trim() ? `${draft.replace(/\s*$/, "")}\n\n${placeholder}\n` : `${placeholder}\n`,
        );

        void (async () => {
          try {
            // Same compression as ticket attachments: a capture of
            // retina weighs several megabytes for nothing, and it will be looked at
            // in a comment column.
            const blob =
              file.type.startsWith("image/") &&
              file.type !== "image/gif" &&
              file.type !== "image/svg+xml"
                ? await compressImage(file, { maxDim: 2048, maxBytes: 2.5 * 1024 * 1024 })
                : file;

            const form = new FormData();
            form.append("file", blob, name);
            const res = await fetch(`${endpoint}/attachments`, {
              method: "POST",
              body: form,
            });
            if (!res.ok) {
              const body = (await res.json().catch(() => null)) as { error?: string } | null;
              throw new Error(body?.error || t("uploadFailed", { name }));
            }
            const hosted = (await res.json()) as {
              url: string;
              name: string;
              isImage: boolean;
            };
            editRef.current((draft) =>
              draft.replace(placeholder, forgeAttachmentMarkdown(hosted)),
            );
          } catch (err) {
            toast.error((err as Error).message || t("uploadFailed", { name }));
            // Remove the waiting line AND the line break that followed it:
            // a failed file should not leave a gap in the message.
            editRef.current((draft) => draft.replace(`${placeholder}\n`, "").replace(placeholder, ""));
          } finally {
            setUploading((n) => n - 1);
          }
        })();
      }
    },
    [endpoint, t],
  );

  return { addFiles, uploading: uploading > 0 };
}
