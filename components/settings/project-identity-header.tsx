"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { Delete02Icon, Globe02Icon, ImageUploadIcon, PencilEdit02Icon, ShuffleIcon } from "@hugeicons/core-free-icons";
import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useFormatter, useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Field, FieldLabel } from "@/components/ui/field";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FormDialog } from "@/components/form-dialog";
import { ProjectOrb } from "@/components/project-orb";
import { useProjectIconActions } from "@/components/project-icon-picker";
import { InlineEditField } from "@/components/settings/inline-edit-field";
import { SettingsBlock } from "@/components/settings/settings-ui";
import { StatsFigure, StatsFigureStrip } from "@/components/stats/stats-chrome";
import { SETTINGS_SECTIONS } from "@/lib/settings-sections";
import { isValidKey, normalizeKey } from "@/lib/project-key";
import { projectOrbSeed } from "@/lib/project-orb-colors";
import { useMembersQuery } from "@/lib/use-members-query";
import { useObjectivesQuery } from "@/lib/use-objectives-query";
import { useCategoriesQuery } from "@/lib/use-categories-query";
import { issuesQueryFn } from "@/lib/issues-api";
import type { Project } from "@/lib/types";

/**
 * The identity of a project at the top of its General settings (MIN-737),
 * built like the account profile: the icon centered, the name and key under
 * it, edited where they are shown, then a few figures. The owner edits; a
 * member reads the same header without edit affordances.
 *
 * The icon opens a menu with the gestures of the creation wizard's picker
 * (`useProjectIconActions`): a new orb while no image covers it, an uploaded
 * image, a website's favicon, or removing the image.
 */
export function ProjectIdentityHeader({
  project,
  onSaveName,
  onSaveKey,
}: {
  project: Project;
  /** Absent for a member: the name and key read as text. */
  onSaveName?: (next: string) => Promise<void>;
  onSaveKey?: (next: string) => Promise<void>;
}) {
  const t = useTranslations("Settings");
  const tProjects = useTranslations("Projects");
  const tCommon = useTranslations("Common");
  const format = useFormatter();
  const canEdit = !!onSaveName;

  const { members } = useMembersQuery(project.id, true);
  const { objectives } = useObjectivesQuery(project.id);
  const { categories } = useCategoriesQuery(project.id);
  // The board's own cache entry: no second request when the board was open,
  // one shared read otherwise.
  const { data: issues } = useQuery({
    queryKey: ["issues", project.id],
    queryFn: issuesQueryFn(project.id),
  });

  const fileRef = useRef<HTMLInputElement>(null);
  const [siteOpen, setSiteOpen] = useState(false);
  const [siteUrl, setSiteUrl] = useState("");
  const icon = useProjectIconActions({ projectId: project.id, onChanged: () => {} });

  const orb = (
    <ProjectOrb
      seed={projectOrbSeed(project)}
      iconUrl={project.icon_url}
      className="size-24 rounded-3xl ring-1 ring-border"
    />
  );

  return (
    <SettingsBlock
      anchor={SETTINGS_SECTIONS.projectGeneral}
      label={t("generalSectionTitle")}
      className="flex flex-col items-center gap-6 pt-6 pb-2"
    >
      <div className="flex max-w-full flex-col items-center px-4 text-center">
        {canEdit ? (
          <>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(event) => {
                void icon.handleFile(event.target.files?.[0]);
                // Selecting the same file again must trigger another change event.
                event.target.value = "";
              }}
            />
            <DropdownMenu>
              <DropdownMenuTrigger
                disabled={icon.busy}
                aria-label={t("changeProjectIcon")}
                className="group relative rounded-3xl outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                {orb}
                {/* The badge says the icon can be changed, on touch screens
                    too where there is no hover. */}
                <span
                  aria-hidden
                  className="absolute -right-1 -bottom-1 flex size-7 items-center justify-center rounded-full border border-border bg-background text-muted-foreground shadow-xs transition-colors group-hover:text-foreground"
                >
                  {icon.busy ? (
                    <Spinner className="size-3.5" />
                  ) : (
                    <HugeiconsIcon icon={PencilEdit02Icon} className="size-3.5" />
                  )}
                </span>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="center">
                {/* A new orb only shows while no image covers it. */}
                {!project.icon_url && (
                  <DropdownMenuItem onSelect={() => void icon.handleReroll()}>
                    <HugeiconsIcon icon={ShuffleIcon} />
                    {tProjects("orbRerollLabel")}
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onSelect={() => fileRef.current?.click()}>
                  <HugeiconsIcon icon={ImageUploadIcon} />
                  {tProjects("iconUploadLabel")}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setSiteOpen(true)}>
                  <HugeiconsIcon icon={Globe02Icon} />
                  {t("importSiteIcon")}
                </DropdownMenuItem>
                {project.icon_url && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      variant="destructive"
                      onSelect={() => void icon.handleRemove()}
                    >
                      <HugeiconsIcon icon={Delete02Icon} />
                      {t("removeProjectIcon")}
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        ) : (
          orb
        )}

        <InlineEditField
          value={project.name}
          onSave={onSaveName}
          label={t("nameLabel")}
          editLabel={t("editProjectName", { name: project.name })}
          validate={(next) => (next ? null : t("nameRequired"))}
          className="mt-4 flex h-10 max-w-full items-center justify-center"
          inputClassName="h-10 w-72 max-w-full text-center text-xl font-semibold"
        >
          <span className="truncate text-2xl font-semibold tracking-tight">
            {project.name}
          </span>
        </InlineEditField>

        <InlineEditField
          value={project.key}
          onSave={onSaveKey}
          label={t("keyLabel")}
          editLabel={t("editProjectKey", { key: project.key })}
          validate={(next) => (isValidKey(normalizeKey(next)) ? null : t("keyInvalid"))}
          normalize={normalizeKey}
          maxLength={5}
          monospace
          className="mt-1 flex h-8 items-center justify-center"
          inputClassName="h-8 w-28 text-center text-sm tracking-wide"
        >
          <span className="font-mono text-sm tracking-wide text-muted-foreground">
            {project.key}
          </span>
        </InlineEditField>
      </div>

      <div className="w-full">
        <StatsFigureStrip columns={5}>
          <StatsFigure label={t("issuesFigure")} value={issues ? issues.length : "—"} />
          <StatsFigure label={t("membersTab")} value={members.length} />
          <StatsFigure label={t("objectivesFigure")} value={objectives.length} />
          <StatsFigure label={t("categoriesTab")} value={categories.length} />
          <StatsFigure
            label={t("createdFigure")}
            // Month and year: a full date wraps in five columns in some
            // languages ("25 de jul. de 2026"), and the day adds nothing here.
            value={format.dateTime(new Date(project.created_at), { month: "short", year: "numeric" })}
          />
        </StatsFigureStrip>
      </div>

      <FormDialog
        open={siteOpen}
        onOpenChange={(open) => !icon.importing && setSiteOpen(open)}
        title={t("importSiteIconTitle")}
        description={t("importSiteIconHint")}
        onSubmit={async () => {
          if (await icon.handleImport(siteUrl)) {
            setSiteOpen(false);
            setSiteUrl("");
          }
        }}
        submitLabel={tProjects("iconImportButton")}
        submitDisabled={!siteUrl.trim()}
        submitting={icon.importing}
        cancelLabel={tCommon("cancel")}
      >
        <Field>
          <FieldLabel htmlFor="project-icon-site">{t("importSiteIconLabel")}</FieldLabel>
          <Input
            id="project-icon-site"
            value={siteUrl}
            inputMode="url"
            onChange={(e) => setSiteUrl(e.target.value)}
            placeholder={tProjects("iconSiteUrlPlaceholder")}
          />
        </Field>
      </FormDialog>
    </SettingsBlock>
  );
}
