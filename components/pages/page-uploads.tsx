"use client";

// Les TÉLÉVERSEMENTS d'une page (MIN-280) : ce qu'un bloc image ou fichier a
// besoin de savoir d'un envoi en cours, et rien de plus.
//
// La forme est celle de components/pages/pages-lookup.tsx, et pour la même
// raison : les deux vues de blocs sont montées en portails tout en bas de
// l'éditeur, et n'ont aucun moyen d'aller chercher elles-mêmes le projet, la
// page ou l'octet en vol. La surface leur pose un contexte.
//
// ── Ce que le nœud garde, et ce qu'il ne garde pas ──────────────────────────
//
// Un envoi vit dans un ÉTAT REACT, jamais dans le document. Le nœud ne porte
// qu'un `uploadId` (non rendu en HTML, donc jamais relu depuis la base) le temps
// que l'adresse définitive arrive. Deux conséquences voulues :
//
//  - fermer l'onglet pendant un envoi ne laisse pas un bloc « en cours » figé
//    pour l'éternité dans le corps : au rechargement, c'est un bloc SANS adresse,
//    que la vue annonce comme raté et qu'on supprime d'un geste ;
//  - et l'inverse : un envoi qui aboutit alors que l'utilisateur a déjà supprimé
//    le bloc n'écrit rien. Le fichier devient un orphelin, que le balayage
//    ramasse une semaine plus tard (lib/server/page-files.ts).
//
// Le `File` d'origine, lui, est gardé en mémoire tant que l'envoi n'a pas
// abouti : c'est ce qui permet de RÉESSAYER sans redemander le fichier, et
// d'afficher l'aperçu local d'une image avant même qu'elle soit partie.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Editor } from "@tiptap/core";
import { compressImage } from "@/lib/image-compress";
import { MAX_PAGE_FILE_BYTES, isImageMime } from "@/lib/page-files";

/** Ce que la route rend quand le fichier est arrivé. */
export interface PageFileUploaded {
  id: string;
  src: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
}

export interface PageUpload {
  id: string;
  /** Le fichier d'origine — gardé pour l'aperçu local et pour le réessai. */
  file: File;
  status: "uploading" | "failed";
  /** 0 → 1. Reste à 0 tant que le navigateur n'a rien émis. */
  progress: number;
  /** L'aperçu local d'une image, en `blob:`. Null pour tout le reste. */
  previewUrl: string | null;
}

export interface PageUploads {
  /** L'envoi en cours (ou raté) sous cet identifiant, s'il y en a un. */
  get: (uploadId: string) => PageUpload | undefined;
  /** Relancer un envoi qui a échoué, avec le fichier déjà en mémoire. */
  retry: (uploadId: string) => void;
}

const Context = createContext<PageUploads | null>(null);

export function PageUploadsProvider({
  value,
  children,
}: {
  value: PageUploads;
  children: ReactNode;
}) {
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function usePageUploadsContext(): PageUploads | null {
  return useContext(Context);
}

/* ── Le moteur ────────────────────────────────────────────────────────────── */

/** Réencoder un gif tue son animation, un svg ses vecteurs : ceux-là partent
    tels quels. Miroir exact de lib/use-attachment-uploads.ts. */
function isCompressible(type: string): boolean {
  return isImageMime(type) && type !== "image/gif" && type !== "image/svg+xml";
}

/** Aligner l'extension du nom affiché sur le blob réencodé (png → webp). */
function renameForType(name: string, type: string): string {
  const ext = type === "image/webp" ? "webp" : type === "image/jpeg" ? "jpg" : null;
  if (!ext) return name;
  return `${name.replace(/\.[a-zA-Z0-9]+$/, "")}.${ext}`;
}

/** Le nœud qui porte cet `uploadId`, s'il est encore dans le document. */
function findUploadNode(editor: Editor, uploadId: string): number | null {
  let found: number | null = null;
  editor.state.doc.descendants((node, pos) => {
    if (found !== null) return false;
    if (node.attrs?.uploadId === uploadId) {
      found = pos;
      return false;
    }
    return true;
  });
  return found;
}

/**
 * L'envoi lui-même, en `XMLHttpRequest` et non en `fetch`.
 *
 * Ce n'est pas de la nostalgie : `fetch` ne rapporte pas l'avancement d'un corps
 * de requête (les flux de requête ne sont pas déployés partout, et n'existent
 * pas du tout sur Safari). Sans avancement, un envoi de 8 Mo sur une connexion
 * lente est un bloc gris qui ne bouge pas pendant quinze secondes — le moment
 * exact où l'on recommence à coller.
 */
function postFile(
  url: string,
  file: File,
  onProgress: (ratio: number) => void
): Promise<PageFileUploaded> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append("file", file);
    const request = new XMLHttpRequest();
    request.open("POST", url);
    request.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) {
        onProgress(event.loaded / event.total);
      }
    };
    request.onload = () => {
      let payload: unknown = null;
      try {
        payload = JSON.parse(request.responseText);
      } catch {
        payload = null;
      }
      const data = payload as (PageFileUploaded & { error?: string }) | null;
      if (request.status >= 200 && request.status < 300 && data?.src) {
        resolve(data);
      } else {
        reject(new Error(data?.error || `upload failed (${request.status})`));
      }
    };
    request.onerror = () => reject(new Error("network error"));
    request.send(form);
  });
}

/**
 * Le crochet que monte la surface (components/pages/page-view.tsx) : il tient la
 * file des envois et RECOUD le nœud quand l'adresse arrive.
 *
 * `editorRef` plutôt que l'éditeur lui-même : l'éditeur naît après le premier
 * rendu, et un envoi lancé par un collage doit pouvoir le lire au moment où il
 * aboutit, pas au moment où le crochet a été appelé.
 */
export function usePageUploads(
  projectId: string,
  pageId: string,
  editorRef: { current: Editor | null }
): PageUploads & {
  /** Poser le bloc adapté au fichier, et lancer son envoi. */
  addFiles: (files: Iterable<File>, options?: { at?: number }) => void;
} {
  const [uploads, setUploads] = useState<Map<string, PageUpload>>(new Map());
  const uploadsRef = useRef(uploads);
  uploadsRef.current = uploads;

  const patch = useCallback((uploadId: string, next: Partial<PageUpload>) => {
    setUploads((prev) => {
      const current = prev.get(uploadId);
      if (!current) return prev;
      const copy = new Map(prev);
      copy.set(uploadId, { ...current, ...next });
      return copy;
    });
  }, []);

  const drop = useCallback((uploadId: string) => {
    setUploads((prev) => {
      const current = prev.get(uploadId);
      if (!current) return prev;
      if (current.previewUrl) URL.revokeObjectURL(current.previewUrl);
      const copy = new Map(prev);
      copy.delete(uploadId);
      return copy;
    });
  }, []);

  // Les `blob:` survivent au démontage s'ils ne sont pas révoqués — une page
  // qu'on ouvre et referme dix fois retiendrait dix images en mémoire.
  const uploadsAtUnmount = useRef(uploads);
  uploadsAtUnmount.current = uploads;
  useEffect(
    () => () => {
      for (const upload of uploadsAtUnmount.current.values()) {
        if (upload.previewUrl) URL.revokeObjectURL(upload.previewUrl);
      }
    },
    []
  );

  const send = useCallback(
    (uploadId: string, file: File) => {
      patch(uploadId, { status: "uploading", progress: 0 });
      void (async () => {
        try {
          // Une capture d'écran sort à 4 Mo d'un Mac récent pour un rendu qui
          // n'en demande pas le quart. Même recompression que les ressources de
          // ticket, donc même résultat visuel et le même respect des gif et des
          // svg (lib/image-compress.ts).
          const blob = isCompressible(file.type)
            ? await compressImage(file, {
                maxDim: 2048,
                maxBytes: 2.5 * 1024 * 1024,
              })
            : file;
          const payload =
            blob === file
              ? file
              : new File(
                  [blob],
                  renameForType(file.name, blob.type || file.type),
                  { type: blob.type || file.type }
                );

          const result = await postFile(
            `/api/projects/${projectId}/pages/${pageId}/files`,
            payload,
            (ratio) => patch(uploadId, { progress: ratio })
          );

          const editor = editorRef.current;
          if (!editor || editor.isDestroyed) {
            drop(uploadId);
            return;
          }
          const pos = findUploadNode(editor, uploadId);
          // Le bloc a été supprimé pendant l'envoi : on n'écrit rien. Le fichier
          // part avec le balayage des orphelins — mieux vaut un octet de trop
          // qu'un bloc qui réapparaît sous le curseur.
          if (pos === null) {
            drop(uploadId);
            return;
          }
          const node = editor.state.doc.nodeAt(pos);
          if (!node) {
            drop(uploadId);
            return;
          }
          editor
            .chain()
            .command(({ tr }) => {
              tr.setNodeMarkup(pos, undefined, {
                ...node.attrs,
                uploadId: null,
                src: result.src,
                ...(node.type.name === "pageFile"
                  ? {
                      name: result.file_name,
                      size: result.size_bytes,
                      mime: result.mime_type,
                    }
                  : {}),
              });
              return true;
            })
            .run();
          drop(uploadId);
        } catch {
          patch(uploadId, { status: "failed" });
        }
      })();
    },
    [drop, editorRef, pageId, patch, projectId]
  );

  const addFiles = useCallback(
    (files: Iterable<File>, options: { at?: number } = {}) => {
      const editor = editorRef.current;
      if (!editor || editor.isDestroyed) return;

      let at = options.at;
      for (const file of files) {
        if (file.size === 0) continue;
        const uploadId = crypto.randomUUID();
        const image = isImageMime(file.type);

        // La taille est refusée AVANT de poser le bloc : un bloc raté d'avance
        // n'apprend rien de plus à l'utilisateur qu'un message immédiat, et il
        // laisse un trou dans le document à nettoyer à la main. Le serveur
        // revérifie de son côté.
        if (file.size > MAX_PAGE_FILE_BYTES) {
          setUploads((prev) => {
            const copy = new Map(prev);
            copy.set(uploadId, {
              id: uploadId,
              file,
              status: "failed",
              progress: 0,
              previewUrl: null,
            });
            return copy;
          });
          continue;
        }

        setUploads((prev) => {
          const copy = new Map(prev);
          copy.set(uploadId, {
            id: uploadId,
            file,
            status: "uploading",
            progress: 0,
            previewUrl: image ? URL.createObjectURL(file) : null,
          });
          return copy;
        });

        const attrs = image
          ? { type: "image", attrs: { uploadId } }
          : {
              type: "pageFile",
              attrs: {
                uploadId,
                name: file.name,
                size: file.size,
                mime: file.type || null,
              },
            };
        const chain = editor.chain().focus();
        if (at === undefined) chain.insertContent(attrs);
        else chain.insertContentAt(at, attrs);
        chain.run();
        // Les fichiers d'un même lâcher se suivent, dans l'ordre où on les a
        // pris — sans ça, ils s'empileraient tous à la même position, donc à
        // l'envers.
        if (at !== undefined) at = editor.state.selection.to;

        send(uploadId, file);
      }
    },
    [editorRef, send]
  );

  const retry = useCallback(
    (uploadId: string) => {
      const upload = uploadsRef.current.get(uploadId);
      if (!upload) return;
      if (upload.file.size > MAX_PAGE_FILE_BYTES) return;
      send(uploadId, upload.file);
    },
    [send]
  );

  const get = useCallback((uploadId: string) => uploads.get(uploadId), [uploads]);

  return useMemo(
    () => ({ get, retry, addFiles }),
    [addFiles, get, retry]
  );
}
