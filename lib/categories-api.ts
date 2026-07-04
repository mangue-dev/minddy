"use client";

import type { Category, CategoryUpdateInput, CreateCategoryInput } from "./types";

async function parseJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!response.ok) {
    const message =
      (data as { error?: string } | null)?.error || text.trim() || "Requête échouée";
    throw new Error(message);
  }
  return data as T;
}

export async function fetchCategoriesApi(projectId: string): Promise<Category[]> {
  return parseJson<Category[]>(await fetch(`/api/projects/${projectId}/categories`));
}

export async function createCategoryApi(
  projectId: string,
  input: CreateCategoryInput
): Promise<Category> {
  return parseJson<Category>(
    await fetch(`/api/projects/${projectId}/categories`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    })
  );
}

export async function updateCategoryApi(
  categoryId: string,
  updates: CategoryUpdateInput
): Promise<Category> {
  return parseJson<Category>(
    await fetch(`/api/categories/${categoryId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    })
  );
}

export async function deleteCategoryApi(categoryId: string): Promise<void> {
  const response = await fetch(`/api/categories/${categoryId}`, { method: "DELETE" });
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(
      (data as { error?: string } | null)?.error || "Suppression échouée"
    );
  }
}

export async function setIssueCategoriesApi(
  issueId: string,
  categoryIds: string[]
): Promise<void> {
  await parseJson(
    await fetch(`/api/issues/${issueId}/categories`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category_ids: categoryIds }),
    })
  );
}
