"use client";

import { useTranslations } from "next-intl";
import { toast } from "mangue-ui";
import {
  AttachButton,
  AttachmentPills,
  DropOverlay,
  useFileDrop,
} from "@/components/attachments";
import { PropertyRow } from "@/components/issue-property-fields";
import { useAttachmentUploads } from "@/lib/use-attachment-uploads";
import { useIssueAttachments } from "@/lib/use-issue-attachments";
import { useAuth } from "@/lib/auth-context";

/**
 * Issue-LEVEL attachments in the side panel (description tab). Rendered as a row
 * of the key/value property table — label left, attach button right — with the
 * files listed just under it, so attachments read as one more property of the
 * ticket rather than a section of their own.
 *
 * Files register as soon as they land in storage — no submit step — and anyone
 * can drop or pick more; removal is uploader-only (RLS). The row and its files
 * are one drop target.
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
    <div className="relative rounded-lg" {...drop.handlers}>
      <DropOverlay show={drop.dragging} />
      <PropertyRow label={t("sectionTitle")}>
        <AttachButton onFiles={uploads.addFiles} className="-mr-1.5" />
      </PropertyRow>
      {!empty && (
        <AttachmentPills
          attachments={attachments}
          pending={uploads.pending}
          className="pb-2"
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
