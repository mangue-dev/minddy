"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Button,
  ConfirmDeleteDialog,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Spinner,
  toast,
} from "mangue-ui";
import { Trash2 } from "lucide-react";
import { useProjects } from "@/lib/projects-context";
import { isValidKey, normalizeKey } from "@/lib/project-key";
import type { Project } from "@/lib/types";

export function ProjectSettingsDialog({
  project,
  open,
  onOpenChange,
}: {
  project: Project;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const { updateProject, deleteProject } = useProjects();

  const [name, setName] = useState(project.name);
  const [key, setKey] = useState(project.key);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Re-sync when the dialog opens or the underlying project changes.
  useEffect(() => {
    if (open) {
      setName(project.name);
      setKey(project.key);
      setError(null);
    }
  }, [open, project.name, project.key]);

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
      onOpenChange(false);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    await deleteProject(project.id);
    toast.success(`Projet « ${project.name} » supprimé.`);
    onOpenChange(false);
    router.push("/home");
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Paramètres du Projet</DialogTitle>
            <DialogDescription>Nom, clé et suppression.</DialogDescription>
          </DialogHeader>

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

            <DialogFooter>
              <Button type="submit" disabled={saving || !dirty}>
                {saving && <Spinner />}
                Enregistrer
              </Button>
            </DialogFooter>
          </form>

          <div className="mt-2 flex items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5">
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
        </DialogContent>
      </Dialog>

      <ConfirmDeleteDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Supprimer « ${project.name} » ?`}
        description="Cette action archive le Projet. Tu ne pourras plus y accéder."
        confirmLabel="Supprimer le Projet"
        onConfirm={handleDelete}
      />
    </>
  );
}
