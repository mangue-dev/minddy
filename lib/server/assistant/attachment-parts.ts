import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { signedAttachmentUrl } from "@/lib/server/attachments";
import type { AttachmentInput } from "@/lib/types";
import type { ChatContentPart } from "./loop";

// ── Attachments → OpenRouter content parts ───────────────────────────────
// Shared by the two Numo entry points (assistant shell, @Numo comments).
// Degrades gracefully: whatever the model can't ingest (or is too heavy)
// becomes a text note naming the file, so a text-only model never errors.

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_PDF_BYTES = 8 * 1024 * 1024;
const MAX_TEXT_BYTES = 200 * 1024;
const MAX_TEXT_CHARS = 4000;

/** What the prompt needs to know about one attachment (a DB row or a
    metadata entry from assistant_messages alike). */
export type PromptAttachment = AttachmentInput;

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
  storagePath: string
): Promise<Buffer | null> {
  const { data, error } = await service.storage
    .from("attachments")
    .download(storagePath);
  if (error || !data) return null;
  return Buffer.from(await data.arrayBuffer());
}

/**
 * Build the content parts for a message's attachments.
 *
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
