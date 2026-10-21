"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import {
  createCategoryApi,
  deleteCategoryApi,
  fetchCategoriesApi,
  reorderCategoriesApi,
  updateCategoryApi,
} from "./categories-api";
import type { Category, CategoryUpdateInput, CreateCategoryInput } from "./types";

const categoriesKey = (projectId: string) => ["categories", projectId] as const;

export function useCategoriesQuery(projectId: string | null) {
  const queryClient = useQueryClient();

  const enabled = !!projectId;
  const { data, isPending } = useQuery({
    queryKey: categoriesKey(projectId ?? ""),
    queryFn: () => fetchCategoriesApi(projectId as string),
    enabled,
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

  // Optimistic: the list takes its new order at once, and returns to the
  // previous one if the server refuses it.
  const reorderCategories = useCallback(
    async (categoryIds: string[]) => {
      if (!projectId) return;
      const key = categoriesKey(projectId);
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<Category[]>(key);
      if (previous) {
        const byId = new Map(previous.map((category) => [category.id, category]));
        queryClient.setQueryData<Category[]>(key, [
          ...categoryIds.flatMap((id) => byId.get(id) ?? []),
          ...previous.filter((category) => !categoryIds.includes(category.id)),
        ]);
      }
      try {
        queryClient.setQueryData<Category[]>(key, await reorderCategoriesApi(projectId, categoryIds));
      } catch (error) {
        if (previous) queryClient.setQueryData<Category[]>(key, previous);
        throw error;
      } finally {
        invalidate();
      }
    },
    [projectId, queryClient, invalidate]
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
    loading: enabled && isPending,
    createCategory,
    updateCategory,
    reorderCategories,
    deleteCategory,
  };
}
