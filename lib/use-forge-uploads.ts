"use client";

import { useCallback, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "mangue-ui";
import { forgeAttachmentMarkdown } from "@/lib/forge-image-assets";
import { compressImage } from "@/lib/image-compress";
import { MAX_ATTACHMENT_BYTES } from "@/lib/use-attachment-uploads";

/**
 * Joindre un fichier à un commentaire de pull request (MIN-162).
 *
 * Rien à voir avec `useAttachmentUploads`, malgré le geste identique : là-bas un
 * fichier devient une LIGNE liée au commentaire, ici il devient du MARKDOWN
 * DANS son corps. C'est la seule forme qui survive au voyage — le commentaire
 * part chez la forge, qui n'a aucune idée de ce qu'est une pièce jointe minddy,
 * et n'affichera que ce que le texte dit.
 *
 * D'où le comportement, qui est celui de github.com : le fichier s'insère à
 * l'endroit du texte, d'abord comme une ligne d'attente nommée, puis remplacée
 * par le vrai lien quand l'hébergement a répondu. On continue d'écrire pendant
 * ce temps, et l'envoi reste bloqué tant qu'une attente traîne — poster
 * « ⏳ capture.png » ne rendrait service à personne.
 *
 * L'upload passe par le serveur (`/api/pull-requests/{id}/attachments`), pas en
 * direct-to-storage : la destination est un bucket public, et c'est le contrôle
 * d'accès à la PR qui empêche d'en faire un hébergeur ouvert.
 */
export function useForgeUploads(
  /** Base de la PR : `/api/pull-requests/{id}` ou la façade `/api/agent-runs/{id}/pr`. */
  endpoint: string,
  /** Le composer applique la transformation à son brouillon — c'est lui qui le
      détient, et l'insertion doit respecter ce qui a été tapé entre-temps. */
  edit: (transform: (draft: string) => string) => void,
) {
  const t = useTranslations("Attachments");
  const [uploading, setUploading] = useState(0);
  // `addFiles` est appelé depuis des gestionnaires de collage / dépôt dont la
  // fermeture peut être périmée : la référence, elle, ne l'est jamais.
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
        // La ligne d'attente porte un jeton unique : deux fichiers du même nom
        // déposés ensemble ne doivent pas se remplacer l'un l'autre.
        const token = crypto.randomUUID().slice(0, 8);
        const placeholder = `![${t("uploadingFile", { name })} ${token}]()`;

        setUploading((n) => n + 1);
        editRef.current((draft) =>
          draft.trim() ? `${draft.replace(/\s*$/, "")}\n\n${placeholder}\n` : `${placeholder}\n`,
        );

        void (async () => {
          try {
            // Même compression que les pièces jointes de ticket : une capture de
            // rétine pèse plusieurs mégaoctets pour rien, et elle sera regardée
            // dans une colonne de commentaire.
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
            // Retirer la ligne d'attente ET le saut de ligne qui la suivait :
            // un fichier raté ne doit pas laisser un trou dans le message.
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
