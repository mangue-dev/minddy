"use client";

import { useTranslations } from "next-intl";
import { toast } from "mangue-ui";
import {
  AddResourceButton,
  DropOverlay,
  ResourcePills,
  useFileDrop,
} from "@/components/resources";
import { PropertyRow } from "@/components/issue-property-fields";
import { useAttachmentUploads } from "@/lib/use-attachment-uploads";
import { useIssueResources } from "@/lib/use-issue-resources";
import { useAuth } from "@/lib/auth-context";

/**
 * Issue-LEVEL resources in the side panel (description tab). Rendered as a row
 * of the key/value property table — label left, « + » right — with the
 * resources listed just under it, so they read as one more property of the
 * ticket rather than a section of their own.
 *
 * A resource registers as soon as it lands — the file in storage, the link once
 * resolved — with no submit step, and anyone can add more; removal is
 * uploader-only (RLS). The row and its resources are one drop target.
 */
export function IssueResourcesSection({
  issueId,
  projectId,
}: {
  issueId: string;
  projectId: string;
}) {
  const t = useTranslations("Resources");
  const { user } = useAuth();
  const { resources, add, remove } = useIssueResources(issueId);

  const uploads = useAttachmentUploads(() => `projects/${projectId}`, {
    onUploaded: (input, localId) => {
      add([input])
        .catch((e) => toast.error((e as Error).message))
        .finally(() => uploads.remove(localId));
    },
  });

  const drop = useFileDrop(uploads.addFiles);
  const empty = resources.length === 0 && uploads.pending.length === 0;

  return (
    <div className="relative rounded-lg" {...drop.handlers}>
      <DropOverlay show={drop.dragging} />
      <PropertyRow label={t("sectionTitle")}>
        <AddResourceButton
          onFiles={uploads.addFiles}
          onLink={uploads.addLink}
          className="-mr-1.5"
        />
      </PropertyRow>
      {!empty && (
        <ResourcePills
          resources={resources}
          pending={uploads.pending}
          className="pb-2"
          onRemove={(a) => {
            if (a.id) remove(a.id).catch((e) => toast.error((e as Error).message));
          }}
          canRemove={(a) =>
            resources.some((x) => x.id === a.id && x.created_by === user?.id)
          }
          onRemovePending={uploads.remove}
        />
      )}
    </div>
  );
}
