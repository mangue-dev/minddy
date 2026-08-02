"use client";

// L'ajout rapide depuis un picker (MIN — « Menus & ajout »). Les deux hooks ci-
// dessous fabriquent la dernière ligne du menu ; un picker ne fait que la passer
// à SearchSelect / SearchMultiSelect (prop `createOption`), ce qui met le même
// geste sur TOUS les boards : cartes, panneau latéral, dialog de création,
// menus clavier L/O, triage, retours.
//
// Les deux entités ne se créent pas pareil, et c'est voulu :
//
//   - une CATÉGORIE naît sur place, avec le texte tapé pour nom et une couleur
//     libre tirée de la palette — une étiquette n'a rien d'autre à remplir ;
//   - un OBJECTIF ouvre son dialog, prérempli du texte tapé. Il porte un statut,
//     un lead, une date cible, une description : le créer à l'aveugle depuis un
//     menu en ferait une coquille que personne ne revient remplir.

import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { createCategoryApi } from "@/lib/categories-api";
import { pickFreeCategoryColor } from "@/lib/category-colors";
import { insertCategoryEverywhere } from "@/lib/optimistic/issue-writes";
import { useCreateOptional } from "@/lib/create-context";
import type { PickerCreateOption } from "@/components/search-select";
import type { Category, Objective } from "@/lib/types";

/**
 * « Ajouter une catégorie » : crée l'étiquette dans le projet et la rend à
 * l'appelant, qui la coche sur son ticket.
 *
 * @param projectId Projet visé — absent (carte d'un board public, projet
 *   inconnu), la ligne n'apparaît pas.
 * @param categories Les catégories déjà là : elles servent à choisir une
 *   couleur qui ne soit pas déjà prise.
 */
export function useCategoryCreateOption({
  projectId,
  categories,
  onCreated,
}: {
  projectId?: string | null;
  categories: Category[];
  onCreated: (category: Category) => void;
}): PickerCreateOption | undefined {
  const t = useTranslations("Picker");
  const queryClient = useQueryClient();

  const onCreate = useCallback(
    async (name: string) => {
      if (!projectId || !name) return;
      const category = await createCategoryApi(projectId, {
        name,
        color: pickFreeCategoryColor(categories.map((c) => c.color)),
      });
      // Écrite dans les caches AVANT d'être cochée : la pastille a son nom et
      // sa couleur du premier rendu, sans attendre le refetch.
      insertCategoryEverywhere(queryClient, projectId, category);
      void queryClient.invalidateQueries({ queryKey: ["categories", projectId] });
      onCreated(category);
    },
    [projectId, categories, queryClient, onCreated]
  );

  if (!projectId) return undefined;
  return { labelFor: (name) => t("createNamed", { name }), onCreate };
}

/**
 * « Ajouter un objectif » : ouvre le dialog de création, prérempli du texte
 * tapé, et lie l'objectif créé au ticket. Le menu se ferme — le dialog prend le
 * clavier.
 *
 * Une création dans un AUTRE projet (le bouton scindé du dialog) ne rappelle
 * pas `onCreated` : l'objectif n'existe pas dans le projet du ticket, l'y lier
 * serait refusé.
 */
export function useObjectiveCreateOption({
  projectId,
  onCreated,
}: {
  projectId?: string | null;
  onCreated: (objective: Objective) => void;
}): PickerCreateOption | undefined {
  const t = useTranslations("Picker");
  // Hors CreateProvider (board public), personne ne monte le dialog : pas de ligne.
  const create = useCreateOptional();

  const onCreate = useCallback(
    (name: string) => {
      if (!projectId || !name) return;
      create?.openCreateObjective({ projectId, name, onCreated });
    },
    [create, projectId, onCreated]
  );

  if (!projectId || !create) return undefined;
  return {
    labelFor: (name) => t("createNamed", { name }),
    closeOnCreate: true,
    onCreate,
  };
}
