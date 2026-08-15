import "server-only";

import type { AttachmentInput } from "@/lib/types";
import { signedAttachmentUrl } from "@/lib/server/attachments";
import { getServiceClient } from "@/lib/supabase-service";

/**
 * Turn direct-to-storage chat uploads into links an agent run can read.
 *
 * Chat uploads deliberately do not create `attachments` rows: unlike an issue
 * resource, they belong only to the message that sent them.  The agent has no
 * browser session, so its prompt carries short-lived signed URLs instead.
 */
export async function promptWithAttachments(
  prompt: string,
  attachments: AttachmentInput[],
): Promise<string> {
  if (attachments.length === 0) return prompt;

  const service = getServiceClient();
  const links = await Promise.all(
    attachments.map(async (attachment) => ({
      attachment,
      url: await signedAttachmentUrl(service, attachment.storage_path, {
        // The agent has to download the original even when its MIME type is not
        // safe to display inline (archives, source files, logs, …).
        download: true,
        expiresIn: 60 * 60,
        mimeType: attachment.mime_type,
      }),
    })),
  );
  const readable = links.filter(
    (item): item is { attachment: AttachmentInput; url: string } => !!item.url,
  );
  if (readable.length === 0) return prompt;

  // The HTML comment is not part of the instruction. It lets the conversation
  // renderer recover the original storage descriptors and show proper resource
  // pills instead of exposing the signed URLs in the user's bubble.
  const metadata = encodeURIComponent(
    JSON.stringify(readable.map(({ attachment }) => attachment)),
  );
  return `${prompt}\n\n<!-- minddy-attachments:${metadata} -->\n<attachments>\nThe user attached the following files. Download and inspect them when useful to the request:\n${readable
    .map(
      ({ attachment, url }) =>
        `- ${attachment.file_name} (${attachment.mime_type}, ${attachment.size_bytes} bytes): ${url}`,
    )
    .join("\n")}\n</attachments>`;
}
