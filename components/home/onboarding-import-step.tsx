"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Spinner,
  cn,
  toast,
} from "mangue-ui";
import { Copy, ExternalLink } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useProjects } from "@/lib/projects-context";
import { useAnalytics } from "@/lib/use-analytics";
import { IMPORT_GUIDES, type ImportGuide } from "@/lib/import-guides";
import { CsvImportPanel } from "@/components/settings/csv-import-panel";

/**
 * Étape 3 de l'onboarding (MIN-98) : faire entrer un backlog existant.
 *
 * Ce n'est pas une page de doc — la marche à suivre du côté de l'outil qu'on
 * quitte est au-dessus, le VRAI dropzone est juste en dessous. On ne sort donc
 * pas de la home pour importer, et le mapping se voit avant de valider.
 *
 * L'étape est facultative : « Passer cette étape » l'acquitte comme le ferait
 * un import réussi. Les deux chemins sont distincts pour l'analytics, pas pour
 * l'état — voir `onboarding-card.tsx`.
 */
export function OnboardingImportStep({
  onDone,
  onSkip,
  busy,
}: {
  onDone: () => void;
  onSkip: () => void;
  busy: boolean;
}) {
  const t = useTranslations("Onboarding");
  const tc = useTranslations("Common");
  const { user } = useAuth();
  const { projects } = useProjects();
  const { track } = useAnalytics();

  const [guide, setGuide] = useState<ImportGuide>(IMPORT_GUIDES[0]);

  // Importer écrit dans un projet, et la route est réservée à son propriétaire :
  // un compte entré par invitation n'a rien où déposer son CSV.
  const owned = useMemo(
    () => projects.filter((p) => p.owner_id === user?.id),
    [projects, user?.id]
  );
  const [targetId, setTargetId] = useState<string | null>(null);
  const target = owned.find((p) => p.id === targetId) ?? owned[0] ?? null;

  const selectGuide = (next: ImportGuide) => {
    setGuide(next);
    // La donnée produit qui manquait : de quel outil viennent les comptes.
    track("onboarding_import_provider_selected", { provider: next.id });
  };

  const copyCommand = async () => {
    if (!guide.command) return;
    await navigator.clipboard.writeText(guide.command);
    toast.success(tc("copied"));
  };

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-col gap-3 rounded-lg border border-border bg-muted/40 p-3">
        <div
          className="flex flex-wrap gap-1.5"
          role="group"
          aria-label={t("importProviderPicker")}
        >
          {IMPORT_GUIDES.map((item) => {
            const active = item.id === guide.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => selectGuide(item)}
                aria-pressed={active}
                className={cn(
                  "rounded-md border px-2.5 py-1.5 text-sm font-medium transition-colors",
                  active
                    ? "border-brand/40 bg-brand/10 text-foreground"
                    : "border-border bg-background text-muted-foreground hover:text-foreground"
                )}
              >
                {item.label}
              </button>
            );
          })}
        </div>

        <ol className="ml-4 flex list-decimal flex-col gap-1 text-sm text-muted-foreground marker:text-muted-foreground/70">
          <li>{t(`importGuide_${guide.id}_1`)}</li>
          <li>{t(`importGuide_${guide.id}_2`)}</li>
          <li>{t(`importGuide_${guide.id}_3`)}</li>
        </ol>

        {guide.command && (
          <div className="flex flex-col items-start gap-2">
            <code className="max-h-40 w-full overflow-auto whitespace-pre rounded-md border border-border bg-background px-3 py-2 font-mono text-xs">
              {guide.command}
            </code>
            <Button type="button" size="sm" onClick={() => void copyCommand()}>
              <Copy />
              {t("importCopyCommand")}
            </Button>
          </div>
        )}

        <a
          href={guide.docUrl}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1 self-start text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
        >
          {t("importGuideDoc", { name: guide.label })}
          <ExternalLink className="size-3" aria-hidden />
        </a>
      </div>

      {target ? (
        <>
          {owned.length > 1 && (
            <div className="flex max-w-sm items-center justify-between gap-3">
              <span className="text-sm text-foreground">{t("importTargetLabel")}</span>
              <Select
                value={target.id}
                onValueChange={setTargetId}
                disabled={busy}
              >
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
          )}

          <CsvImportPanel projectId={target.id} onImported={() => onDone()} />

          <Link
            href={`/projects/${target.id}/settings?tab=import`}
            className="self-start text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
          >
            {t("importOpenSettings")}
          </Link>
        </>
      ) : (
        <p className="max-w-prose text-sm text-muted-foreground">
          {t("importNoProject")}
        </p>
      )}

      <div>
        <Button type="button" variant="outline" onClick={onSkip} disabled={busy}>
          {busy && <Spinner />}
          {t("importSkipCta")}
        </Button>
      </div>
    </div>
  );
}
