"use client";

// La CORBEILLE du wiki d'un projet (MIN-270).
//
// Elle est atteignable depuis le bas de l'arbre plutôt que depuis les réglages
// du projet : c'est là qu'on la cherche quand on vient de supprimer une page,
// et c'est le seul endroit où le geste « je l'ai effacée par erreur » a une
// chance d'être fait dans la minute qui suit.
//
// Elle ne fait PAS doublon avec /trash : la corbeille générale rassemble les six
// types supprimables de tous les projets, celle-ci ne montre que les pages de
// CE projet. Les deux lisent la même source (`useTrashQuery`) et écrivent par la
// même route — restaurer ici ou là-bas est le même geste, avec les mêmes
// invalidations de cache.

import { useMemo } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button, Spinner, toast } from "mangue-ui";
import { FileText, RotateCcw, Trash2 } from "lucide-react";

import { EmptyScene } from "@/components/empty-scene";
import { daysLeft, useTrashQuery } from "@/lib/use-trash-query";
import type { TrashItem } from "@/lib/trash-api";

export function PagesTrash({ projectId }: { projectId: string }) {
  const t = useTranslations("Pages");
  const tTrash = useTranslations("Trash");
  const locale = useLocale();
  const { items, retentionDays, loading, restore } = useTrashQuery();

  const pages = useMemo(
    () =>
      items.filter(
        (item) => item.type === "page" && item.project_id === projectId
      ),
    [items, projectId]
  );

  const onRestore = async (item: TrashItem) => {
    try {
      await restore(item);
      toast.success(tTrash("restored", { title: item.title }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tTrash("restore"));
    }
  };

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center py-16">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-10">
      <h1 className="font-display text-2xl font-semibold tracking-tight">
        {t("trashTitle")}
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {t("trashSubtitle", { days: retentionDays })}
      </p>

      {pages.length === 0 ? (
        <EmptyScene
          icon={Trash2}
          tone="destructive"
          title={t("trashEmpty")}
          className="mt-6"
        />
      ) : (
        <ul className="mt-6 flex flex-col">
          {pages.map((item) => {
            const left = daysLeft(item.deleted_at, retentionDays);
            return (
              <li
                key={item.id}
                className="flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-muted/50"
              >
                <FileText className="size-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{item.title}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {new Date(item.deleted_at).toLocaleDateString(locale, {
                      day: "numeric",
                      month: "short",
                    })}
                    {" · "}
                    {left === 0
                      ? tTrash("daysLeftNone")
                      : tTrash("daysLeft", { count: left })}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void onRestore(item)}
                >
                  <RotateCcw className="size-3.5" />
                  {tTrash("restore")}
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
