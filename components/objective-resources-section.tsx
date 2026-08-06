"use client";

import { useTranslations } from "next-intl";
import { toast } from "mangue-ui";
import {
  AddResourceButton,
  DropOverlay,
  ResourcePills,
  useFileDrop,
} from "@/components/resources";
import { useAttachmentUploads } from "@/lib/use-attachment-uploads";
import { useObjectiveResources } from "@/lib/use-objective-resources";
import { useAuth } from "@/lib/auth-context";

/**
 * Objective-LEVEL resources in the side panel — twin of
 * IssueResourcesSection. A resource registers as soon as it lands (no submit
 * step); removal is uploader-only (RLS).
 */
export function ObjectiveResourcesSection({
  objectiveId,
  projectId,
}: {
  objectiveId: string;
  projectId: string;
}) {
  const t = useTranslations("Resources");
  const { user } = useAuth();
  const { resources, add, remove } = useObjectiveResources(objectiveId);

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
    <div
      className="relative -m-2 flex flex-col gap-2 rounded-lg p-2"
      {...drop.handlers}
    >
      <DropOverlay show={drop.dragging} />
      <div className="flex items-center justify-between py-1">
        <span className="text-sm font-medium">{t("sectionTitle")}</span>
        <AddResourceButton
          onFiles={uploads.addFiles}
          onLink={uploads.addLink}
          className="-my-1"
        />
      </div>
      {!empty && (
        <ResourcePills
          resources={resources}
          pending={uploads.pending}
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
