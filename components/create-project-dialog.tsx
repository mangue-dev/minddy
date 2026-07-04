"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Button,
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
import { useProjects } from "@/lib/projects-context";
import { isValidKey, normalizeKey, suggestKeyFromName } from "@/lib/project-key";

export function CreateProjectDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const { createProject } = useProjects();

  const [name, setName] = useState("");
  const [key, setKey] = useState("");
  const [keyTouched, setKeyTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setName("");
    setKey("");
    setKeyTouched(false);
    setError(null);
    setSubmitting(false);
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const handleNameChange = (value: string) => {
    setName(value);
    if (!keyTouched) setKey(suggestKeyFromName(value));
  };

  const handleSubmit = async (e: React.FormEvent) => {
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

    setSubmitting(true);
    try {
      const project = await createProject({ name: trimmedName, key: finalKey });
      toast.success(`Projet « ${project.name} » créé.`);
      handleOpenChange(false);
      router.push(`/projects/${project.id}`);
    } catch (err) {
      setError((err as Error).message);
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nouveau Projet</DialogTitle>
          <DialogDescription>
            Un Projet est ton espace de travail. La clé préfixe les identifiants
            d&apos;issues (ex. {key || "MIND"}-42).
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="project-name" className="text-sm font-medium">
              Nom
            </label>
            <Input
              id="project-name"
              autoFocus
              required
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="Mon Projet"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="project-key" className="text-sm font-medium">
              Clé
            </label>
            <Input
              id="project-key"
              required
              value={key}
              onChange={(e) => {
                setKeyTouched(true);
                setKey(normalizeKey(e.target.value));
              }}
              placeholder="MIND"
              className="w-28 font-mono uppercase tracking-wide"
              maxLength={5}
            />
            <p className="text-xs text-muted-foreground">
              2 à 5 lettres, unique dans ton compte.
            </p>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => handleOpenChange(false)}
              disabled={submitting}
            >
              Annuler
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting && <Spinner />}
              Créer le Projet
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
