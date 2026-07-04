"use client";

import { Button, Skeleton, toast } from "mangue-ui";
import { FolderPlus } from "lucide-react";
import { useAuth } from "@/lib/auth-context";

export default function HomePage() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="mx-auto flex h-full max-w-2xl flex-col justify-center gap-4 px-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-72" />
        <Skeleton className="h-10 w-40" />
      </div>
    );
  }

  return (
    <div className="mx-auto flex h-full max-w-2xl flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="flex size-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
        <FolderPlus className="size-7" />
      </div>
      <div className="space-y-1.5">
        <h1 className="font-display text-2xl font-semibold tracking-tight">
          Aucun Projet pour l&apos;instant
        </h1>
        <p className="text-sm text-muted-foreground">
          Un Projet est ton espace de travail : issues, membres et catégories y
          vivent. Crée ton premier Projet pour commencer.
        </p>
      </div>
      <Button
        onClick={() =>
          toast("La création de Projet arrive au prochain chantier.", {
            description: "Fondations posées — Projets (CRUD + clé) juste après.",
          })
        }
      >
        <FolderPlus />
        Nouveau Projet
      </Button>
      {user?.email && (
        <p className="text-xs text-muted-foreground">Connecté en tant que {user.email}</p>
      )}
    </div>
  );
}
