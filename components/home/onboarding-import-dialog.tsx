"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "mangue-ui";
import { useAuth } from "@/lib/auth-context";
import { useProjects } from "@/lib/projects-context";
import { useAnalytics } from "@/lib/use-analytics";
import { ImportWizardDialog } from "@/components/import/import-wizard-dialog";

/**
 * Import d'un backlog existant depuis l'onboarding (MIN-98).
 *
 * Le parcours est celui du wizard d'import (`import-wizard-dialog.tsx`) ; ce
 * fichier n'ajoute que ce qui n'existe que là : dans quel projet importer (les
 * réglages le savent déjà) et le renvoi vers ces mêmes réglages pour plus tard.
 * Les deux voyagent DANS la première étape, avec la question à laquelle ils
 * répondent.
 *
 * `initialFile` est le CSV lâché sur la carte d'onboarding : le wizard s'ouvre
 * alors directement sur la correspondance.
 *
 * Sans projet à soi, il n'y a nulle part où déposer : on garde une petite
 * modale qui le dit, plutôt qu'un parcours en trois étapes qui ne mènerait à
 * rien.
 */
export function OnboardingImportDialog({
  open,
  onOpenChange,
  initialFile,
  onImported,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialFile?: File | null;
  onImported: () => void;
}) {
  const t = useTranslations("Onboarding");
  const { user } = useAuth();
  const { projects } = useProjects();
  const { track } = useAnalytics();

  // Importer écrit dans un projet, et la route est réservée à son propriétaire :
  // un compte entré par invitation n'a rien où déposer son CSV.
  const owned = useMemo(
    () => projects.filter((p) => p.owner_id === user?.id),
    [projects, user?.id]
  );
  const [targetId, setTargetId] = useState<string | null>(null);
  const target = owned.find((p) => p.id === targetId) ?? owned[0] ?? null;

  if (!target) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("importTitle")}</DialogTitle>
            <DialogDescription>{t("importDesc")}</DialogDescription>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{t("importNoProject")}</p>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <ImportWizardDialog
      open={open}
      onOpenChange={onOpenChange}
      projectId={target.id}
      initialFile={initialFile}
      // La donnée produit qui manquait : de quel outil viennent les comptes.
      onProviderSelected={(guide) =>
        track("onboarding_import_provider_selected", { provider: guide.id })
      }
      onImported={() => onImported()}
      target={
        owned.length > 1 ? (
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-foreground">{t("importTargetLabel")}</span>
            <Select value={target.id} onValueChange={setTargetId}>
              <SelectTrigger id="onboarding-import-target" className="w-52">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {owned.map((project) => (
                  <SelectItem key={project.id} value={project.id}>
                    {project.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : undefined
      }
      sourceFooter={
        <Link
          href={`/projects/${target.id}/settings?tab=import`}
          className="self-start text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
        >
          {t("importOpenSettings")}
        </Link>
      }
    />
  );
}
