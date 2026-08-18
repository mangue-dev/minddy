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
import { useObjectiveResources } from "@/lib/use-objective-resources";
import { useAuth } from "@/lib/auth-context";

/**
 * Attachments of an OBJECTIVE — twin of IssueResourcesSection. A coin
 * is saved as soon as it lands (no validation step); withdrawal is
 * reserved for who deposited it (RLS).
 *
 * It is a LINE of the key/value table of the objective, and not a section at
 * part: “Resources” is read in the same column as Status, Responsible and
 * Color, the same gray and on the same grid. It was close to it without being part of it — a bolder title, two pixels further to the left —, and this
 * difference didn't say anything we wanted to say.
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
    <div className="relative flex flex-col rounded-lg" {...drop.handlers}>
      <DropOverlay show={drop.dragging} />
      <PropertyRow label={t("sectionTitle")}>
        {/* `-mr-1.5`: the same resetting as the other values ​​in the table, which
 all carry a padding trigger. Without it, the “+” ends in a
 notch to the right of the selectors above. */}
        <AddResourceButton
          onFiles={uploads.addFiles}
          onLink={uploads.addLink}
          onPage={uploads.addPage}
          projectId={projectId}
          className="-mr-1.5"
        />
      </PropertyRow>
      {/* The pellets pass UNDER the line, over the entire width: a file name does not fit in the right column, and truncating them where there is room to read them would only have served to keep the alignment. */}
      {!empty && (
        <ResourcePills
          className="pb-2"
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
