"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  Badge,
  Button,
  ConfirmDeleteDialog,
  Input,
  Skeleton,
  Spinner,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  toast,
} from "mangue-ui";
import { LogOut, Trash2 } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useProjects } from "@/lib/projects-context";
import { removeMemberApi } from "@/lib/members-api";
import { isValidKey, normalizeKey } from "@/lib/project-key";
import { ProjectMembers } from "@/components/project-members";
import { ProjectCategories } from "@/components/project-categories";

export default function ProjectSettingsPage() {
  const t = useTranslations("Settings");
  const tc = useTranslations("Common");
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const {
    projects,
    loading: projectsLoading,
    updateProject,
    deleteProject,
    refetch,
  } = useProjects();
  const project = projects.find((p) => p.id === id);

  const [name, setName] = useState(project?.name ?? "");
  const [key, setKey] = useState(project?.key ?? "");
  const [saving, setSaving] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Sync the form once the project resolves (or changes via Realtime).
  useEffect(() => {
    if (project) {
      setName(project.name);
      setKey(project.key);
      setError(null);
    }
  }, [project?.name, project?.key]);

  if (projectsLoading && !project) {
    return (
      <div className="mx-auto w-full max-w-2xl px-6 py-8">
        <Skeleton className="h-8 w-64" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex flex-col items-center gap-3 px-6 py-20 text-center">
        <h1 className="font-display text-xl font-semibold">{t("projectNotFound")}</h1>
        <Button asChild variant="outline">
          <Link href="/home">{t("backToHome")}</Link>
        </Button>
      </div>
    );
  }

  const isOwner = project.owner_id === user?.id;
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

  const handleDelete = async () => {
    await deleteProject(project.id);
    toast.success(t("projectDeleted", { name: project.name }));
    router.push("/home");
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

  return (
    <div className="mx-auto w-full max-w-2xl px-6 py-8">
      <h1 className="mb-6 font-display text-xl font-semibold tracking-tight">
        {t("title")}
      </h1>

      <Tabs defaultValue="general">
        <TabsList>
          <TabsTrigger value="general">{t("generalTab")}</TabsTrigger>
          <TabsTrigger value="categories">{t("categoriesTab")}</TabsTrigger>
          <TabsTrigger value="members">{t("membersTab")}</TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="pt-4">
          {isOwner ? (
            <div className="flex flex-col gap-4">
              <form onSubmit={handleSave} className="flex flex-col gap-3">
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="settings-name" className="text-sm font-medium">
                    {t("nameLabel")}
                  </label>
                  <Input
                    id="settings-name"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="settings-key" className="text-sm font-medium">
                    {t("keyLabel")}
                  </label>
                  <Input
                    id="settings-key"
                    required
                    value={key}
                    onChange={(e) => setKey(normalizeKey(e.target.value))}
                    className="w-28 font-mono uppercase tracking-wide"
                    maxLength={5}
                  />
                </div>
                {error && <p className="text-sm text-destructive">{error}</p>}
                <div>
                  <Button type="submit" disabled={saving || !dirty}>
                    {saving && <Spinner />}
                    {tc("save")}
                  </Button>
                </div>
              </form>

              <div className="flex items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5">
                <div className="text-sm">
                  <p className="font-medium">{t("deleteProjectLabel")}</p>
                  <p className="text-xs text-muted-foreground">
                    {t("deleteProjectHint")}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  onClick={() => setConfirmDelete(true)}
                >
                  <Trash2 />
                  {tc("delete")}
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <div>
                  <p className="text-sm font-medium">{project.name}</p>
                  <Badge variant="secondary" className="mt-1 font-mono">
                    {project.key}
                  </Badge>
                </div>
              </div>
              <p className="text-sm text-muted-foreground">
                {t("ownerOnlyHint")}
              </p>
              <div className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5">
                <div className="text-sm">
                  <p className="font-medium">{t("leaveProjectLabel")}</p>
                  <p className="text-xs text-muted-foreground">
                    {t("leaveProjectHint")}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={leaving}
                  onClick={handleLeave}
                >
                  {leaving ? <Spinner /> : <LogOut />}
                  {t("leave")}
                </Button>
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="categories" className="pt-4">
          <ProjectCategories projectId={project.id} />
        </TabsContent>

        <TabsContent value="members" className="pt-4">
          <ProjectMembers projectId={project.id} enabled />
        </TabsContent>
      </Tabs>

      <ConfirmDeleteDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={t("deleteProjectTitle", { name: project.name })}
        description={t("deleteProjectDescription")}
        confirmLabel={t("deleteProjectLabel")}
        onConfirm={handleDelete}
      />
    </div>
  );
}
