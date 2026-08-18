"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Badge, Button, Input, Spinner, toast } from "mangue-ui";
import { LogOut, Settings2, Trash2, TriangleAlert } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useProjects } from "@/lib/projects-context";
import { removeMemberApi } from "@/lib/members-api";
import { isValidKey, normalizeKey } from "@/lib/project-key";
import { projectOrbSeed } from "@/lib/project-orb-colors";
import { ProjectIconPicker } from "@/components/project-icon-picker";
import { SettingsGroup, SettingsRow } from "@/components/settings/settings-ui";
import { SETTINGS_SECTIONS } from "@/lib/settings-sections";
import type { Project } from "@/lib/types";

/**
 * “General” tab of a project's settings: its identity (name, key, icon)
 * and the danger zone. Two branches — owner, which modifies and deletes ;
 * member, which reads and exits. Excerpt from page (MIN-167), where he lived in JSX
 * inline with its own form state.
 */
export function ProjectGeneralSection({
  project,
  isOwner,
  onRequestDelete,
}: {
  project: Project;
  isOwner: boolean;
  /** The page has the `ConfirmDeleteDialog`: it routes to /home afterwards. */
  onRequestDelete: () => void;
}) {
  const t = useTranslations("Settings");
  const tc = useTranslations("Common");
  const router = useRouter();
  const { user } = useAuth();
  const { updateProject, refetch } = useProjects();

  const [name, setName] = useState(project.name);
  const [key, setKey] = useState(project.key);
  const [saving, setSaving] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sync the form once the project resolves (or changes via Realtime).
  useEffect(() => {
    setName(project.name);
    setKey(project.key);
    setError(null);
  }, [project.name, project.key]);

  const dirty = name.trim() !== project.name || normalizeKey(key) !== project.key;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const trimmedName = name.trim();
    const finalKey = normalizeKey(key);
    if (!trimmedName) {
      setError(t("nameRequired"));
      return;
    }
    if (!isValidKey(finalKey)) {
      setError(t("keyInvalid"));
      return;
    }
    setSaving(true);
    try {
      await updateProject(project.id, { name: trimmedName, key: finalKey });
      toast.success(t("projectUpdated"));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleLeave = async () => {
    if (!user) return;
    setLeaving(true);
    try {
      await removeMemberApi(project.id, user.id);
      toast.success(t("leftProject", { name: project.name }));
      refetch();
      router.push("/home");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLeaving(false);
    }
  };

  if (!isOwner) {
    return (
      <>
        <SettingsGroup
          anchor={SETTINGS_SECTIONS.projectGeneral}
          icon={Settings2}
          title={t("generalSectionTitle")}
          description={t("ownerOnlyHint")}
        >
          <SettingsRow
            label={t("nameLabel")}
            control={<span className="text-sm">{project.name}</span>}
          />
          <SettingsRow
            label={t("keyLabel")}
            control={
              <Badge variant="secondary" className="font-mono">
                {project.key}
              </Badge>
            }
          />
        </SettingsGroup>

        {/* The gesture lives in the header: the group has only one action, and a
 row that repeats word for word the title above it. */}
        <SettingsGroup
          anchor={SETTINGS_SECTIONS.projectLeave}
          icon={LogOut}
          title={t("leaveProjectLabel")}
          description={t("leaveProjectHint")}
          action={
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={leaving}
              onClick={() => void handleLeave()}
            >
              {leaving ? <Spinner /> : <LogOut />}
              {t("leave")}
            </Button>
          }
        />
      </>
    );
  }

  return (
    <>
      {/* The `<form>` wraps the card so Enter in a field submits,
 as before — the submit button lives in the footer of the group. */}
      <form onSubmit={handleSave}>
        <SettingsGroup
          anchor={SETTINGS_SECTIONS.projectGeneral}
          icon={Settings2}
          title={t("generalSectionTitle")}
          description={t("generalSectionDesc")}
          footer={
            <>
              {error && <p className="mr-auto text-sm text-destructive">{error}</p>}
              <Button type="submit" disabled={saving || !dirty}>
                {saving && <Spinner />}
                {tc("save")}
              </Button>
            </>
          }
        >
          <SettingsRow
            htmlFor="settings-name"
            label={t("nameLabel")}
            control={
              <Input
                id="settings-name"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-64"
              />
            }
          />

          <SettingsRow
            htmlFor="settings-key"
            label={t("keyLabel")}
            control={
              <Input
                id="settings-key"
                required
                value={key}
                onChange={(e) => setKey(normalizeKey(e.target.value))}
                className="w-28 font-mono uppercase tracking-wide"
                maxLength={5}
              />
            }
          />

          <SettingsRow
            label={t("iconLabel")}
            control={
              /* The project exists: each gesture writes immediately and the refreshed cache
 `projects` renders the new icon — nothing to remember here. */
              <ProjectIconPicker
                projectId={project.id}
                seed={projectOrbSeed(project)}
                iconUrl={project.icon_url}
                onChanged={() => {}}
              />
            }
          />
        </SettingsGroup>
      </form>

      <SettingsGroup
        anchor={SETTINGS_SECTIONS.projectDanger}
        icon={TriangleAlert}
        tone="destructive"
        title={t("dangerZoneTitle")}
        description={t("dangerZoneDesc")}
      >
        <SettingsRow
          label={t("deleteProjectLabel")}
          hint={t("deleteProjectHint")}
          control={
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={onRequestDelete}
            >
              <Trash2 />
              {tc("moveToTrash")}
            </Button>
          }
        />
      </SettingsGroup>
    </>
  );
}
