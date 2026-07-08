"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import {
  createCategoryApi,
  deleteCategoryApi,
  fetchCategoriesApi,
  updateCategoryApi,
} from "./categories-api";
import type { Category, CategoryUpdateInput, CreateCategoryInput } from "./types";

const categoriesKey = (projectId: string) => ["categories", projectId] as const;

export function useCategoriesQuery(projectId: string | null) {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: categoriesKey(projectId ?? ""),
    queryFn: () => fetchCategoriesApi(projectId as string),
    enabled: !!projectId,
  });

  const invalidate = useCallback(() => {
    if (projectId) {
      void queryClient.invalidateQueries({ queryKey: categoriesKey(projectId) });
    }
  }, [queryClient, projectId]);

  const createCategory = useCallback(
    async (input: CreateCategoryInput) => {
      const category = await createCategoryApi(projectId as string, input);
      invalidate();
      return category;
    },
    [projectId, invalidate]
  );

  const updateCategory = useCallback(
    async (categoryId: string, updates: CategoryUpdateInput) => {
      const category = await updateCategoryApi(categoryId, updates);
      invalidate();
      return category;
    },
    [invalidate]
  );

  const deleteCategory = useCallback(
    async (categoryId: string) => {
      await deleteCategoryApi(categoryId);
      invalidate();
      // A deleted category also disappears from issue cards.
      if (projectId) {
        void queryClient.invalidateQueries({ queryKey: ["issues", projectId] });
      }
    },
    [invalidate, projectId, queryClient]
  );

  return {
    categories: (data ?? []) as Category[],
    loading: isLoading,
    createCategory,
    updateCategory,
    deleteCategory,
  };
}
