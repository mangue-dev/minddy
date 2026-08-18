"use client";

// Quick addition from a picker (MIN — “Menus & addition”). The two hooks below
// below make the last line of the menu; a picker just passes it
// to SearchSelect / SearchMultiSelect (prop `createOption`), which puts the same
// gesture on ALL boards: cards, side panel, creation dialog,
// menus clavier L/O, triage, retours.
//
// The two entities are not created the same, and that is intentional:
//
// - a CATEGORY is born on the spot, with the typed text for name and a color
// free taken from the palette — a label has nothing else to fill in;
// - an OBJECTIVE opens its dialog, pre-filled with the typed text. He carries a status,
// a lead, a target date, a description: create it blindly from a
// menu would make it a shell that no one comes back to fill.

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
 * “Add a category”: creates the label in the project and returns it to
 * the caller, who checks it on their ticket.
 *
 * @param projectId Target project — absent (public board card, project
 * unknown), the line does not appear not.
 * @param categories The categories already there: they are used to choose a
 * color which is not already taken.
 */
export function useCategoryCreateOption({
  projectId,
  categories,
  onCreated,
}: {
  projectId?: string | null;
  /** Colors already taken — everything the design needs from the list. */
  categories: Pick<Category, "color">[];
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
      // Written in the caches BEFORE being checked: the pastille has its name and
      // its color from the first rendering, without waiting for the refetch.
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
 * “Add a goal”: opens the creation dialog, pre-filled with the typed text
 *, and links the created goal to the ticket. The menu closes — the dialog takes the
 * keyboard.
 *
 * A creation in ANOTHER project (the button split from the dialog) does not recall
 * not `onCreated`: the objective does not exist in the ticket project, linking it to it
 * would be refused.
 */
export function useObjectiveCreateOption({
  projectId,
  onCreated,
}: {
  projectId?: string | null;
  onCreated: (objective: Objective) => void;
}): PickerCreateOption | undefined {
  const t = useTranslations("Picker");
  // Outside CreateProvider (public board), no one mounts the dialog: no line.
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
