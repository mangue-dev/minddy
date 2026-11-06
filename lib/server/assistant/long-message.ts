import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { opaqueAttachmentPath, uploadPrivateAttachmentObject } from "@/lib/server/attachments";
import type { AttachmentInput } from "@/lib/types";
import { MAX_INLINE_MESSAGE_CHARS, normalizeAssistantMessageText } from "./sanitize";

/** How much of a converted message stays in the message itself. */
export const LONG_MESSAGE_EXCERPT_CHARS = 2_000;

// Control characters other than tab and newline; the file keeps the text's
// own spacing (tab-separated logs, aligned columns), unlike the inline message.
// oxlint-disable-next-line no-control-regex
const FILE_CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

export type LongMessageLabels = {
  /** The attachment's name, e.g. "Pasted text 2026-11-06 21.30.txt". */
  fileName: string;
  /** The line that follows the excerpt, naming the attachment. */
  note: string;
};

/**
 * A message too long to travel inline becomes a text attachment of the
 * conversation (MIN-916): the message keeps a short excerpt and a note naming
 * the file, and Numo reads the rest with `read_conversation_attachment`. The
 * object lands under the user's private chat prefix, like a file dropped in
 * the composer, after the same account quota check.
 *
 * Returns null when the message fits inline, or when the file cannot be
 * stored; the caller then keeps the truncated message, which says it was cut.
 */
export async function longMessageAttachment(
  service: SupabaseClient,
  userId: string,
  message: string,
  labels: LongMessageLabels,
): Promise<{ content: string; attachment: AttachmentInput } | null> {
  const inline = normalizeAssistantMessageText(message);
  if (inline.length <= MAX_INLINE_MESSAGE_CHARS) return null;

  const text = message.normalize("NFC").replace(/\r\n?/g, "\n")
    .replace(FILE_CONTROL_CHARS, "").replace(/^﻿/, "");
  const bytes = new TextEncoder().encode(text);
  try {
    const quota = await service.rpc("account_storage_quota_allows", {
      p_user: userId, p_additional_bytes: Math.ceil(bytes.byteLength * 1.4) + 4096,
    });
    if (quota.error || quota.data !== true) return null;
    const path = opaqueAttachmentPath(`chat/${userId}`);
    await uploadPrivateAttachmentObject(service, path, bytes, "text/plain");
    const excerpt = inline.slice(0, LONG_MESSAGE_EXCERPT_CHARS).trimEnd();
    return {
      content: `${excerpt}\n…\n\n${labels.note}`,
      attachment: {
        storage_path: path,
        file_name: labels.fileName,
        mime_type: "text/plain",
        size_bytes: bytes.byteLength,
      },
    };
  } catch (error) {
    console.error("[numo-chat] long message attachment failed", {
      reason: error instanceof Error ? error.message : "unknown",
    });
    return null;
  }
}
