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
      // The new order is written BEFORE anything is awaited: a drop ends a
      // drag in this very event, and a list still in its old order for a
      // moment made the dragged row jump back before moving.
      const previous = queryClient.getQueryData<Category[]>(key);
      const reordered = previous && (() => {
        const byId = new Map(previous.map((category) => [category.id, category]));
        return [
          ...categoryIds.flatMap((id) => byId.get(id) ?? []),
          ...previous.filter((category) => !categoryIds.includes(category.id)),
        ];
      })();
      if (reordered) queryClient.setQueryData<Category[]>(key, reordered);
      await queryClient.cancelQueries({ queryKey: key });
      // A fetch cancelled on its way back could have restored the old order.
      if (reordered) queryClient.setQueryData<Category[]>(key, reordered);
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
