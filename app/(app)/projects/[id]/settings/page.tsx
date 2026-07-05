"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
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
        <h1 className="font-display text-xl font-semibold">Projet introuvable</h1>
        <Button asChild variant="outline">
          <Link href="/home">Retour à l&apos;accueil</Link>
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
      setError("Le nom est obligatoire.");
      return;
    }
    if (!isValidKey(finalKey)) {
      setError("La clé doit faire 2 à 5 lettres (A–Z).");
      return;
    }
    setSaving(true);
    try {
      await updateProject(project.id, { name: trimmedName, key: finalKey });
      toast.success("Projet mis à jour.");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    await deleteProject(project.id);
    toast.success(`Projet « ${project.name} » supprimé.`);
    router.push("/home");
  };

  const handleLeave = async () => {
    if (!user) return;
    setLeaving(true);
    try {
      await removeMemberApi(project.id, user.id);
      toast.success(`Tu as quitté « ${project.name} ».`);
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
        Paramètres
      </h1>

      <Tabs defaultValue="general">
        <TabsList>
          <TabsTrigger value="general">Général</TabsTrigger>
          <TabsTrigger value="categories">Catégories</TabsTrigger>
          <TabsTrigger value="members">Membres</TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="pt-4">
          {isOwner ? (
            <div className="flex flex-col gap-4">
              <form onSubmit={handleSave} className="flex flex-col gap-3">
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="settings-name" className="text-sm font-medium">
                    Nom
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
                    Clé
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
                    Enregistrer
                  </Button>
                </div>
              </form>

              <div className="flex items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5">
                <div className="text-sm">
                  <p className="font-medium">Supprimer le Projet</p>
                  <p className="text-xs text-muted-foreground">
                    Le Projet est archivé et sa clé se libère.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  onClick={() => setConfirmDelete(true)}
                >
                  <Trash2 />
                  Supprimer
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
                Seul le propriétaire peut renommer ou supprimer ce Projet.
              </p>
              <div className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5">
                <div className="text-sm">
                  <p className="font-medium">Quitter le Projet</p>
                  <p className="text-xs text-muted-foreground">
                    Tu n&apos;y auras plus accès.
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
                  Quitter
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
        title={`Supprimer « ${project.name} » ?`}
        description="Cette action archive le Projet. Tu ne pourras plus y accéder."
        confirmLabel="Supprimer le Projet"
        onConfirm={handleDelete}
      />
    </div>
  );
}
