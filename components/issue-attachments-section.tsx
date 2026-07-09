"use client";

import { useTranslations } from "next-intl";
import { toast } from "mangue-ui";
import {
  AttachButton,
  AttachmentPills,
  DropOverlay,
  useFileDrop,
} from "@/components/attachments";
import { useAttachmentUploads } from "@/lib/use-attachment-uploads";
import { useIssueAttachments } from "@/lib/use-issue-attachments";
import { useAuth } from "@/lib/auth-context";

/**
 * Issue-LEVEL attachments in the side panel (description tab). Files register
 * as soon as they land in storage — no submit step — and anyone can drop or
 * pick more; removal is uploader-only (RLS).
 */
export function IssueAttachmentsSection({
  issueId,
  projectId,
}: {
  issueId: string;
  projectId: string;
}) {
  const t = useTranslations("Attachments");
  const { user } = useAuth();
  const { attachments, add, remove } = useIssueAttachments(issueId);

  const uploads = useAttachmentUploads(() => `projects/${projectId}`, {
    onUploaded: (input, localId) => {
      add([input])
        .catch((e) => toast.error((e as Error).message))
        .finally(() => uploads.remove(localId));
    },
  });

  const drop = useFileDrop(uploads.addFiles);
  const empty = attachments.length === 0 && uploads.pending.length === 0;

  return (
    <div
      className="relative -m-2 flex flex-col gap-2 rounded-lg p-2"
      {...drop.handlers}
    >
      <DropOverlay show={drop.dragging} />
      <div className="flex items-center justify-between py-1">
        <span className="text-sm font-medium">{t("sectionTitle")}</span>
        <AttachButton onFiles={uploads.addFiles} className="-my-1" />
      </div>
      {!empty && (
        <AttachmentPills
          attachments={attachments}
          pending={uploads.pending}
          onRemove={(a) => {
            if (a.id) remove(a.id).catch((e) => toast.error((e as Error).message));
          }}
          canRemove={(a) =>
            attachments.some((x) => x.id === a.id && x.created_by === user?.id)
          }
          onRemovePending={uploads.remove}
        />
      )}
    </div>
  );
}
