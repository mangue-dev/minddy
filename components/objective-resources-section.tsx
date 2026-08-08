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
 * Les pièces jointes d'un OBJECTIF — jumelle d'IssueResourcesSection. Une pièce
 * s'enregistre dès qu'elle atterrit (pas d'étape de validation) ; le retrait est
 * réservé à qui l'a déposée (RLS).
 *
 * C'est une LIGNE de la table clé/valeur de l'objectif, et pas une section à
 * part : « Ressources » se lit dans la même colonne que Statut, Responsable et
 * Couleur, du même gris et sur la même grille. Elle en était voisine sans en
 * faire partie — un titre plus gras, deux pixels plus à gauche —, et cette
 * différence-là ne disait rien qu'on ait voulu dire.
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
        {/* `-mr-1.5` : le même recalage que les autres valeurs de la table, qui
            portent toutes un déclencheur à padding. Sans lui, le « + » finit une
            encoche à droite des sélecteurs du dessus. */}
        <AddResourceButton
          onFiles={uploads.addFiles}
          onLink={uploads.addLink}
          className="-mr-1.5"
        />
      </PropertyRow>
      {/* Les pastilles passent SOUS la ligne, sur toute la largeur : un nom de
          fichier ne tient pas dans la colonne de droite, et les tronquer là où
          il y a la place de les lire n'aurait servi qu'à garder l'alignement. */}
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
