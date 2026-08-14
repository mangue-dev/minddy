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
 * Onglet « Général » des réglages d'un projet : son identité (nom, clé, icône)
 * et la zone de danger. Deux branches — propriétaire, qui modifie et supprime ;
 * membre, qui lit et quitte. Extrait de la page (MIN-167), où il vivait en JSX
 * inline avec son propre état de formulaire.
 */
export function ProjectGeneralSection({
  project,
  isOwner,
  onRequestDelete,
}: {
  project: Project;
  isOwner: boolean;
  /** La page possède le `ConfirmDeleteDialog` : elle route vers /home après. */
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

        {/* Le geste vit dans l'en-tête : le groupe n'a qu'une action, et une
            rangée qui répétait mot pour mot le titre au-dessus d'elle. */}
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
      {/* Le `<form>` enveloppe la carte pour que Entrée dans un champ soumette,
          comme avant — le bouton d'envoi vit dans le pied du groupe. */}
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
              /* Le projet existe : chaque geste écrit tout de suite et le cache
                 `projects` rafraîchi rend la nouvelle icône — rien à retenir ici. */
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
