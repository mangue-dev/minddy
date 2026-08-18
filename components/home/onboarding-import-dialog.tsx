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
 * Import an existing backlog from onboarding (MIN-98).
 *
 * The route is that of the import wizard (`import-wizard-dialog.tsx`); This
 * file only adds what only exists there: into which project to import (the
 * settings already know it) and referring to these same settings for later.
 * The two travel IN the first stage, with the question to which they
 * respond.
 *
 * `initialFile` is the CSV dropped on the onboarding card: the wizard opens
 * then directly on the correspondence.
 *
 * Without a project of your own, there is nowhere to deposit: we keep a small
 * modal which says so, rather than a three-step journey which would only lead to
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

  // Import written in a project, and the route is reserved for its owner:
  // an account entered by invitation has nowhere to deposit its CSV.
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
      // The product data that was missing: which tool the accounts come from.
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
