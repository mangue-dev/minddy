import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { signedAttachmentUrl } from "@/lib/server/attachments";
import type { ChatContentPart } from "./loop";

// ── Attachments → OpenRouter content parts ───────────────────────────────
// Shared by the two Numo entry points (assistant shell, @Numo comments).
// Degrades gracefully: whatever the model can't ingest (or is too heavy)
// becomes a text note naming the file, so a text-only model never errors.

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_PDF_BYTES = 8 * 1024 * 1024;
const MAX_TEXT_BYTES = 200 * 1024;
const MAX_TEXT_CHARS = 4000;

/**
 * What the prompt needs to know about one resource (a DB row or a metadata
 * entry from assistant_messages alike).
 *
 * `storage_path` est NULLABLE, et ce n'est pas une précaution : depuis MIN-184
 * une ressource peut être un LIEN, depuis MIN-275 une PAGE citée — deux lignes
 * de `attachments` sans octet dans le bucket. Les typer `string` ici a fait
 * tomber une réponse @Numo entière : `storage.download(null)` lève dans
 * `getFinalPath` (`Cannot read properties of null (reading 'replace')`), et rien
 * n'attrapait ça avant le `catch` du run.
 */
export type PromptAttachment = {
  kind?: "file" | "link" | "page" | null;
  storage_path: string | null;
  /** Le lien lui-même (kind: "link"). */
  url?: string | null;
  /** La page citée (kind: "page") — l'id que `get_page` prend. */
  page_id?: string | null;
  file_name: string;
  mime_type: string;
  size_bytes: number;
};

/** Une ligne de `attachments` telle que la lisent les trois modes de
    @Numo — groupée par commentaire (clé `null` = la ressource du parent). */
export function groupPromptAttachments(
  rows:
    | {
        comment_id?: unknown;
        kind?: unknown;
        storage_path?: unknown;
        url?: unknown;
        page_id?: unknown;
        file_name?: unknown;
        mime_type?: unknown;
        size_bytes?: unknown;
      }[]
    | null
    | undefined
): Map<string | null, PromptAttachment[]> {
  const byComment = new Map<string | null, PromptAttachment[]>();
  for (const row of rows ?? []) {
    const key = (row.comment_id as string | null) ?? null;
    const list = byComment.get(key) ?? [];
    list.push({
      kind: (row.kind as PromptAttachment["kind"]) ?? null,
      storage_path: (row.storage_path as string | null) ?? null,
      url: (row.url as string | null) ?? null,
      page_id: (row.page_id as string | null) ?? null,
      file_name: row.file_name as string,
      mime_type: row.mime_type as string,
      size_bytes: (row.size_bytes as number | null) ?? 0,
    });
    byComment.set(key, list);
  }
  return byComment;
}

/** Les colonnes que `groupPromptAttachments` attend — une seule source pour les
    trois `select()` de @Numo. */
export const PROMPT_ATTACHMENT_COLUMNS =
  "comment_id, kind, storage_path, url, page_id, file_name, mime_type, size_bytes";

function isLink(a: PromptAttachment): boolean {
  return a.kind === "link" || a.mime_type === "text/uri-list";
}

function isPage(a: PromptAttachment): boolean {
  return a.kind === "page" || a.mime_type === "application/vnd.minddy.page";
}

function isTextLike(mime: string, name: string): boolean {
  return (
    mime.startsWith("text/") ||
    mime === "application/json" ||
    /\.(csv|txt|md|json|log)$/i.test(name)
  );
}

function note(a: PromptAttachment, suffix = "not included"): ChatContentPart {
  const kb = Math.max(1, Math.round(a.size_bytes / 1024));
  return {
    type: "text",
    text: `[Attachment: ${a.file_name} (${a.mime_type}, ${kb} KB) — ${suffix}]`,
  };
}

async function download(
  service: SupabaseClient,
  storagePath: string | null
): Promise<Buffer | null> {
  if (!storagePath) return null;
  const { data, error } = await service.storage
    .from("attachments")
    .download(storagePath);
  if (error || !data) return null;
  return Buffer.from(await data.arrayBuffer());
}

/**
 * Build the content parts for a message's attachments.
 *
 * - links → a text part naming the URL (rien à téléverser : l'adresse EST le
 *   contenu, et un lien porte le MIME `text/uri-list`, donc sans cette branche
 *   il partait se faire télécharger comme du texte);
 * - pages citées → un texte qui donne l'id, pour que le modèle la lise avec
 *   `get_page` s'il en a besoin;
 * - images → `image_url` with a short-lived signed URL (OpenRouter fetches it
 *   server-side within the TTL), when the model takes image input;
 * - PDFs → base64 `file` part, only when `includeHeavy` (the trigger / latest
 *   message — re-encoding history PDFs on every turn would be prohibitive);
 * - CSV / text-ish → inline text excerpt, same `includeHeavy` rule;
 * - everything else (or over the caps) → a text note naming the file.
 */
export async function buildAttachmentParts(
  service: SupabaseClient,
  attachments: PromptAttachment[],
  {
    modalities,
    includeHeavy,
  }: { modalities: Set<string>; includeHeavy: boolean }
): Promise<ChatContentPart[]> {
  const parts: ChatContentPart[] = [];

  for (const a of attachments) {
    if (isLink(a)) {
      parts.push({
        type: "text",
        text: a.url
          ? `[Link: ${a.file_name} — ${a.url}]`
          : `[Link: ${a.file_name}]`,
      });
      continue;
    }

    if (isPage(a)) {
      parts.push({
        type: "text",
        text: a.page_id
          ? `[Page of this project cited: "${a.file_name}" (page id: ${a.page_id}) — read it with get_page if you need its content]`
          : `[Page of this project cited: "${a.file_name}"]`,
      });
      continue;
    }

    // Un fichier sans objet dans le bucket : rien à télécharger, et surtout pas
    // un `download(null)` qui lèverait (voir PromptAttachment).
    if (!a.storage_path) {
      parts.push(note(a));
      continue;
    }

    if (a.mime_type.startsWith("image/")) {
      if (modalities.has("image") && a.size_bytes <= MAX_IMAGE_BYTES) {
        const url = await signedAttachmentUrl(service, a.storage_path, {
          expiresIn: 600,
        });
        if (url) {
          parts.push({ type: "image_url", image_url: { url } });
          continue;
        }
      }
      parts.push(note(a));
      continue;
    }

    if (a.mime_type === "application/pdf") {
      if (includeHeavy && modalities.has("file") && a.size_bytes <= MAX_PDF_BYTES) {
        const buf = await download(service, a.storage_path);
        if (buf) {
          parts.push({
            type: "file",
            file: {
              filename: a.file_name,
              file_data: `data:application/pdf;base64,${buf.toString("base64")}`,
            },
          });
          continue;
        }
      }
      parts.push(note(a));
      continue;
    }

    if (isTextLike(a.mime_type, a.file_name)) {
      if (includeHeavy && a.size_bytes <= MAX_TEXT_BYTES) {
        const buf = await download(service, a.storage_path);
        if (buf) {
          let text = buf.toString("utf8");
          if (text.length > MAX_TEXT_CHARS) {
            text = `${text.slice(0, MAX_TEXT_CHARS)}\n… [truncated]`;
          }
          parts.push({
            type: "text",
            text: `[Attachment: ${a.file_name}]\n"""\n${text}\n"""`,
          });
          continue;
        }
      }
      parts.push(note(a));
      continue;
    }

    parts.push(note(a, "not viewable"));
  }

  return parts;
}
